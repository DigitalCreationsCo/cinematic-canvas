# =============================================================================
# Backend Module Outputs
# =============================================================================

output "service_name" {
  description = "Backend ECS service name"
  value       = aws_ecs_service.backend.name
}

output "task_definition_arn" {
  description = "Backend task definition ARN"
  value       = aws_ecs_task_definition.backend.arn
}

output "security_group_id" {
  description = "Backend ECS security group ID"
  value       = aws_security_group.backend.id
}
