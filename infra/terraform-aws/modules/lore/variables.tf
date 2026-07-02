# =============================================================================
# Lore Module Variables
# =============================================================================

variable "cluster_id" {
  description = "ECS cluster ID"
  type        = string
}

variable "cluster_name" {
  description = "ECS cluster name"
  type        = string
}

variable "ecr_repository_url" {
  description = "ECR repository URL for Lore server image"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag for Lore server"
  type        = string
  default     = "latest"
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs"
  type        = list(string)
}

variable "efs_file_system_id" {
  description = "EFS file system ID"
  type        = string
}

variable "efs_access_point_id" {
  description = "EFS access point ID"
  type        = string
}

variable "s3_bucket_name" {
  description = "S3 bucket name for fragments"
  type        = string
}

variable "s3_bucket_arn" {
  description = "S3 bucket ARN"
  type        = string
}

variable "dynamodb_fragments_table_name" {
  description = "DynamoDB fragments table name"
  type        = string
}

variable "dynamodb_fragments_table_arn" {
  description = "DynamoDB fragments table ARN"
  type        = string
}

variable "dynamodb_metadata_table_name" {
  description = "DynamoDB metadata table name"
  type        = string
}

variable "dynamodb_metadata_table_arn" {
  description = "DynamoDB metadata table ARN"
  type        = string
}

variable "secrets_arns" {
  description = "Map of secret ARNs (hmac-key, jwks, jwt-config)"
  type        = map(string)
}

variable "jwks_content" {
  description = "JWKS JSON content for sidecar container"
  type        = string
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

variable "alb_target_group_arn" {
  description = "ALB target group ARN for Lore HTTP (port 41339)"
  type        = string
}

variable "nlb_target_group_tcp_arn" {
  description = "NLB TCP target group ARN for Lore (port 41337)"
  type        = string
}

variable "nlb_target_group_udp_arn" {
  description = "NLB UDP target group ARN for Lore (port 41337)"
  type        = string
}

variable "alb_security_group_id" {
  description = "ALB security group ID"
  type        = string
}

variable "nlb_security_group_id" {
  description = "NLB security group ID"
  type        = string
}

variable "efs_security_group_id" {
  description = "EFS security group ID"
  type        = string
}

variable "cpu" {
  description = "Task CPU units (1024 = 1 vCPU)"
  type        = number
  default     = 1024
}

variable "memory" {
  description = "Task memory in MB"
  type        = number
  default     = 2048
}

variable "desired_count" {
  description = "Desired number of tasks"
  type        = number
  default     = 1
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "cloudwatch_log_group_name" {
  description = "CloudWatch log group name for Lore"
  type        = string
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
