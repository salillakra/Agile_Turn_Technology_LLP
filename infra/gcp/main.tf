locals {
  network_name = "${var.name_prefix}-vpc"
  labels = {
    app     = "ats"
    managed = "terraform"
  }
}

resource "random_id" "suffix" {
  byte_length = 2
}

# ── APIs ──────────────────────────────────────────────────────────────────────
resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
    "sqladmin.googleapis.com",
    "servicenetworking.googleapis.com",
    "artifactregistry.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# ── Network ───────────────────────────────────────────────────────────────────
resource "google_compute_network" "vpc" {
  name                    = local.network_name
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${var.name_prefix}-subnet"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_compute_global_address" "private_ip_range" {
  name          = "${var.name_prefix}-sql-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

resource "google_compute_firewall" "allow_web" {
  name    = "${var.name_prefix}-allow-web"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    # 80/443 = apps + Coolify proxy; 8000 = Coolify UI; 6001/6002 = Coolify realtime
    ports    = ["80", "443", "8000", "6001", "6002", "3000"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["${var.name_prefix}-app"]
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "${var.name_prefix}-allow-ssh"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = var.ssh_source_ranges
  target_tags   = ["${var.name_prefix}-app"]
}

# ── Cloud SQL (Postgres) ──────────────────────────────────────────────────────
resource "google_sql_database_instance" "pg" {
  name             = "${var.name_prefix}-pg-${random_id.suffix.hex}"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 20
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled    = true
      start_time = "02:00"
    }
  }

  deletion_protection = false
  depends_on          = [google_service_networking_connection.private_vpc]
}

resource "google_sql_database" "db" {
  name     = "atsdb"
  instance = google_sql_database_instance.pg.name
}

resource "google_sql_user" "ats" {
  name     = "ats"
  instance = google_sql_database_instance.pg.name
  password = var.db_password
}

# ── Artifact Registry (optional: push images Coolify can pull) ────────────────
resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "${var.name_prefix}-images"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

# ── App VM (Coolify host) ─────────────────────────────────────────────────────
resource "google_compute_address" "app_ip" {
  name   = "${var.name_prefix}-app-ip"
  region = var.region
}

resource "google_service_account" "app" {
  account_id   = "${var.name_prefix}-app"
  display_name = "ATS Coolify host"
}

resource "google_project_iam_member" "ar_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.app.email}"
}

resource "google_project_iam_member" "log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.app.email}"
}

locals {
  database_url = format(
    "postgresql://ats:%s@%s:5432/atsdb?sslmode=require",
    urlencode(var.db_password),
    google_sql_database_instance.pg.private_ip_address
  )
  public_origin = var.domain != "" ? trimsuffix(var.domain, "/") : "http://${google_compute_address.app_ip.address}:3000"
}

resource "google_compute_instance" "app" {
  name         = "${var.name_prefix}-app"
  machine_type = var.machine_type
  zone         = var.zone
  tags         = ["${var.name_prefix}-app"]
  labels       = local.labels

  boot_disk {
    initialize_params {
      # Coolify install script targets Ubuntu
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = var.disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subnet.id
    access_config {
      nat_ip = google_compute_address.app_ip.address
    }
  }

  service_account {
    email  = google_service_account.app.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  metadata_startup_script = templatefile("${path.module}/startup.sh.tftpl", {
    database_url    = local.database_url
    nextauth_secret = var.nextauth_secret
    nextauth_url    = local.public_origin
    gemini_api_key  = var.gemini_api_key
    smtp_host       = var.smtp_host
    smtp_port       = var.smtp_port
    smtp_user       = var.smtp_user
    smtp_password   = var.smtp_password
    smtp_from       = var.smtp_from
    email_enabled   = var.smtp_host != "" && var.smtp_from != "" && var.smtp_password != "" ? "1" : "0"
    coolify_url     = "http://${google_compute_address.app_ip.address}:8000"
  })

  depends_on = [
    google_sql_database.db,
    google_sql_user.ats,
    google_project_iam_member.ar_reader,
  ]

  allow_stopping_for_update = true
}
