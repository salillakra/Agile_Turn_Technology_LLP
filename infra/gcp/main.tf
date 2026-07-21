locals {
  network_name = "${var.name_prefix}-vpc"
  labels = {
    app     = "ats"
    managed = "terraform"
  }
  public_origin = var.domain != "" ? trimsuffix(var.domain, "/") : "http://${google_compute_address.app_ip.address}"
  database_url = format(
    "postgresql://atsuser:%s@postgres:5432/atsdb?sslmode=disable",
    urlencode(random_password.postgres.result)
  )
}

resource "random_password" "postgres" {
  length  = 24
  special = false
}

# ── APIs ──────────────────────────────────────────────────────────────────────
resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
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

resource "google_compute_firewall" "allow_web" {
  name    = "${var.name_prefix}-allow-web"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    # 80/443 = Coolify proxy; 8000 = Coolify UI; 6001/6002 = Coolify realtime
    ports = ["80", "443", "8000", "6001", "6002"]
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

# ── App VM (Coolify host — all services run in compose on this box) ───────────
resource "google_compute_address" "app_ip" {
  name   = "${var.name_prefix}-app-ip"
  region = var.region
}

resource "google_service_account" "app" {
  account_id   = "${var.name_prefix}-app"
  display_name = "ATS Coolify host"
}

resource "google_project_iam_member" "log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.app.email}"
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
    database_url      = local.database_url
    postgres_password = random_password.postgres.result
    nextauth_secret   = var.nextauth_secret
    nextauth_url      = local.public_origin
    gemini_api_key    = var.gemini_api_key
    smtp_host         = var.smtp_host
    smtp_port         = var.smtp_port
    smtp_user         = var.smtp_user
    smtp_password     = var.smtp_password
    smtp_from         = var.smtp_from
    email_enabled     = var.smtp_host != "" && var.smtp_from != "" && var.smtp_password != "" ? "1" : "0"
    coolify_url       = "http://${google_compute_address.app_ip.address}:8000"
  })

  depends_on = [
    google_project_iam_member.log_writer,
  ]

  allow_stopping_for_update = true
}
