variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "fragments_table_name" {
  description = "Name of the DynamoDB table for fragment index (hash → repository_context)."
  type        = string
  default     = "portals-fragments"
}

variable "metadata_table_name" {
  description = "Name of the DynamoDB table for fragment metadata (hash → metadata)."
  type        = string
  default     = "portals-fragment-metadata"
}

variable "enable_point_in_time_recovery" {
  description = "Enable DynamoDB point-in-time recovery for both tables."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
