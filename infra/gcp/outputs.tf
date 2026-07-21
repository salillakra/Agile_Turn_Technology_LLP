output "app_external_ip" {
  value = google_compute_address.app_ip.address
}

output "coolify_url" {
  value = "http://${google_compute_address.app_ip.address}:8000"
}

output "app_url_hint" {
  value = var.domain != "" ? trimsuffix(var.domain, "/") : "http://${google_compute_address.app_ip.address} (Coolify proxy → app:3000)"
}

output "ssh" {
  value = "gcloud compute ssh ${google_compute_instance.app.name} --zone ${var.zone} --project ${var.project_id}"
}

output "postgres_password" {
  value     = random_password.postgres.result
  sensitive = true
}

output "next_steps" {
  value = <<-EOT
    1. Open Coolify: http://${google_compute_address.app_ip.address}:8000
    2. Create admin account
    3. Env file on VM: /opt/ats/ats.env — paste into Coolify app env
       (terraform output -raw postgres_password if you need the DB password)
    4. Deploy docker-compose.yml from this repo
    5. Domain → service "app", port 3000
    6. CREATE EXTENSION IF NOT EXISTS vector; on compose postgres
    7. Coolify build concurrency = 1
  EOT
}
