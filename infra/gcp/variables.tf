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
  default     = "e2-standard-4" # 4 vCPU / 16GB — builds + Coolify + compose
  description = "Coolify host: 4 vCPU / 16GB leaves headroom for Docker builds"
}

variable "disk_size_gb" {
  type    = number
  default = 120
}

variable "nextauth_secret" {
  type      = string
  sensitive = true
}

variable "domain" {
  type        = string
  default     = ""
  description = "Public https origin for NEXTAUTH_URL. Empty → http://EXTERNAL_IP until Coolify domain is set"
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
