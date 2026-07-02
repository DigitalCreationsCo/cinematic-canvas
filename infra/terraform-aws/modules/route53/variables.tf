# =============================================================================
# Route53 Module Variables
# =============================================================================

variable "domain_name" {
  description = "Domain name (e.g., portals.io). If empty, no Route53 resources are created."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID (required if domain_name is set)"
  type        = string
  default     = ""
}

variable "alb_dns_name" {
  description = "ALB DNS name for alias records"
  type        = string
}

variable "alb_zone_id" {
  description = "ALB canonical hosted zone ID"
  type        = string
}

variable "nlb_dns_name" {
  description = "NLB DNS name for alias records"
  type        = string
}

variable "nlb_zone_id" {
  description = "NLB canonical hosted zone ID"
  type        = string
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
