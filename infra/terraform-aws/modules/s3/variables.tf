variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "bucket_name" {
  description = "Globally-unique S3 bucket name for the Lore immutable fragment store."
  type        = string
}

variable "force_destroy" {
  description = "Allow `terraform destroy` to delete the bucket even if it still contains objects. Leave false for real deployments."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
