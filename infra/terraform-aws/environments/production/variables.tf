# =============================================================================
# Production Environment Variables
# =============================================================================

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "database_url" {
  description = "Supabase pooled PostgreSQL connection URL (sensitive)"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "Domain name for Route53 (e.g., portals.io). If empty, no Route53 resources are created."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID (required if domain_name is set)"
  type        = string
  default     = ""
}

variable "lore_image_tag" {
  description = "Docker image tag for Lore server"
  type        = string
  default     = "latest"
}

variable "backend_image_tag" {
  description = "Docker image tag for Backend API"
  type        = string
  default     = "latest"
}

variable "jwt_issuer" {
  description = "JWT issuer claim"
  type        = string
  default     = "lore-token-issuer"
}

variable "jwt_audience" {
  description = "JWT audience claim"
  type        = list(string)
  default     = ["lore-server"]
}

variable "s3_bucket_name" {
  description = "S3 bucket name for fragments"
  type        = string
  default     = "portals-lore-production-fragments"
}

variable "dynamodb_fragments_table_name" {
  description = "DynamoDB fragments table name"
  type        = string
  default     = "portals-fragments"
}

variable "dynamodb_metadata_table_name" {
  description = "DynamoDB metadata table name"
  type        = string
  default     = "portals-fragment-metadata"
}

variable "ecr_repository_names" {
  description = "ECR repository names"
  type        = list(string)
  default     = ["portals/lore-server", "portals/backend"]
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones (empty to auto-discover)"
  type        = list(string)
  default     = []
}

variable "lore_cpu" {
  description = "Lore task CPU units"
  type        = number
  default     = 1024
}

variable "lore_memory" {
  description = "Lore task memory in MB"
  type        = number
  default     = 2048
}

variable "lore_desired_count" {
  description = "Lore desired task count"
  type        = number
  default     = 1
}

variable "backend_cpu" {
  description = "Backend task CPU units"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Backend task memory in MB"
  type        = number
  default     = 1024
}

variable "backend_desired_count" {
  description = "Backend desired task count"
  type        = number
  default     = 2
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default = {
    Project   = "Portals"
    ManagedBy = "Terraform"
  }
}
