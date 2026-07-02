# =============================================================================
# Backend Module Variables
# =============================================================================

variable "cluster_id" {
  description = "ECS cluster ID"
  type        = string
}

variable "ecr_repository_url" {
  description = "ECR repository URL for Backend image"
  type        = string
}

variable "image_tag" {
  description = "Docker image tag for Backend"
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

variable "alb_target_group_arn" {
  description = "ALB target group ARN for Backend (port 7860)"
  type        = string
}

variable "alb_security_group_id" {
  description = "ALB security group ID"
  type        = string
}

variable "database_url_secret_arn" {
  description = "Secret ARN for DATABASE_URL"
  type        = string
}

variable "jwt_private_key_secret_arn" {
  description = "Secret ARN for JWT private key"
  type        = string
}

variable "jwt_kid_secret_arn" {
  description = "Secret ARN for JWT key ID"
  type        = string
}

variable "jwt_config_secret_arn" {
  description = "Secret ARN for JWT config (issuer, audience, kid)"
  type        = string
}

variable "cpu" {
  description = "Task CPU units (512 = 0.5 vCPU)"
  type        = number
  default     = 512
}

variable "memory" {
  description = "Task memory in MB"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of tasks"
  type        = number
  default     = 2
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
  description = "CloudWatch log group name for Backend"
  type        = string
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
