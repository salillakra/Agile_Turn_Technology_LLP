output "app_external_ip" {
  value = google_compute_address.app_ip.address
}

output "coolify_url" {
  value = "http://${google_compute_address.app_ip.address}:8000"
}

output "app_url_hint" {
  value = var.domain != "" ? trimsuffix(var.domain, "/") : "http://${google_compute_address.app_ip.address}:3000 (after you deploy ATS in Coolify)"
}

output "sql_private_ip" {
  value = google_sql_database_instance.pg.private_ip_address
}

output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "ssh" {
  value = "gcloud compute ssh ${google_compute_instance.app.name} --zone ${var.zone} --project ${var.project_id}"
}

output "next_steps" {
  value = <<-EOT
    1. Open Coolify: http://${google_compute_address.app_ip.address}:8000
    2. Create admin account
    3. On the VM, env file is at /opt/ats/ats.env — paste into Coolify app env
    4. Deploy Dockerfile target "render" from this repo
    5. CREATE EXTENSION IF NOT EXISTS vector; on Cloud SQL
  EOT
}
