variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC."
  type        = string
}

variable "private_subnet_ids" {
  description = "IDs of the private subnets for EFS mount targets."
  type        = list(string)
}

variable "ecs_security_group_id" {
  description = "Security group ID of the ECS tasks that will mount this file system."
  type        = string
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
