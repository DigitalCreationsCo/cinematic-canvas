variable "project_id" {
  description = "GCP project ID to deploy into."
  type        = string
}

variable "region" {
  description = "GCP region for regional resources (bucket, disk)."
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone for the Compute Engine VM."
  type        = string
  default     = "us-central1-a"
}

variable "instance_name" {
  description = "Name used for the VM and most related resources."
  type        = string
  default     = "lore-server"
}

variable "machine_type" {
  description = "Machine type for the loreserver VM."
  type        = string
  default     = "e2-medium"
}

variable "boot_disk_size_gb" {
  description = "Boot disk size in GB. Holds the OS and the loreserver binary only -- not server data."
  type        = number
  default     = 30
}

variable "data_disk_size_gb" {
  description = "Size in GB of the SSD persistent disk backing the mutable store, lock store, certs, and config."
  type        = number
  default     = 50
}

variable "bucket_name" {
  description = "Globally-unique GCS bucket name backing the immutable store (mounted via gcsfuse)."
  type        = string
}

variable "bucket_force_destroy" {
  description = "Allow `terraform destroy` to delete the bucket even if it still has objects in it. Leave false for real deployments."
  type        = bool
  default     = false
}

variable "jwt_issuer" {
  description = "Value stamped into the server's `jwt_issuer` check, and into every token mint_token.py issues. Purely a shared convention between the two -- not a real URL, since there's no external identity provider here."
  type        = string
  default     = "lore-token-issuer"
}

variable "jwt_audience" {
  description = "Value(s) checked against a token's `aud` claim. mint_token.py's --audience default must match one entry."
  type        = list(string)
  default     = ["lore-server"]
}

variable "ssh_iap_only" {
  description = "If true (recommended), SSH is reachable only through Identity-Aware Proxy tunneling -- no public port 22 at all."
  type        = bool
  default     = true
}

variable "repository_name" {
  description = "Informational only -- used to build the example lore:// URL in outputs. Repositories are created client-side with `lore repository create`, Terraform doesn't create them."
  type        = string
  default     = "my-project"
}
