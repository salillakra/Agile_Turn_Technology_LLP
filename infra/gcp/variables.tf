variable "project_id" {
  type        = string
  description = "GCP project id"
}

variable "region" {
  type    = string
  default = "asia-south1"
}

variable "zone" {
  type    = string
  default = "asia-south1-a"
}

variable "name_prefix" {
  type    = string
  default = "ats"
}

variable "machine_type" {
  type        = string
  default     = "e2-standard-2" # 2 vCPU / 8GB
  description = "Coolify + ATS needs ≥2 vCPU / 8GB"
}

variable "disk_size_gb" {
  type    = number
  default = 80
}

variable "db_tier" {
  type        = string
  default     = "db-custom-1-3840"
  description = "Cloud SQL tier (f1-micro is too small for pgvector workloads)"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Postgres password for user ats"
}

variable "nextauth_secret" {
  type      = string
  sensitive = true
}

variable "domain" {
  type        = string
  default     = ""
  description = "Public https origin for NEXTAUTH_URL. Empty → http://EXTERNAL_IP:3000 until Coolify domain is set"
}

variable "ssh_source_ranges" {
  type        = list(string)
  default     = ["0.0.0.0/0"]
  description = "CIDRs allowed to SSH (lock this down)"
}

variable "gemini_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "smtp_host" {
  type    = string
  default = ""
}

variable "smtp_port" {
  type    = string
  default = "465"
}

variable "smtp_user" {
  type    = string
  default = ""
}

variable "smtp_password" {
  type      = string
  default   = ""
  sensitive = true
}

variable "smtp_from" {
  type    = string
  default = ""
}
