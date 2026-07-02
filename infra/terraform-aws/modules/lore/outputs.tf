# =============================================================================
# Lore Module Outputs
# =============================================================================

output "service_name" {
  description = "Lore ECS service name"
  value       = aws_ecs_service.lore.name
}

output "task_definition_arn" {
  description = "Lore task definition ARN"
  value       = aws_ecs_task_definition.lore.arn
}

output "security_group_id" {
  description = "Lore ECS security group ID"
  value       = aws_security_group.lore.id
}
