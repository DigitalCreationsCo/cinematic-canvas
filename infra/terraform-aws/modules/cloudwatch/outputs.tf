output "lore_log_group_name" {
  description = "Name of the CloudWatch log group for the Lore server."
  value       = aws_cloudwatch_log_group.lore_server.name
}

output "lore_log_group_arn" {
  description = "ARN of the CloudWatch log group for the Lore server."
  value       = aws_cloudwatch_log_group.lore_server.arn
}

output "backend_log_group_name" {
  description = "Name of the CloudWatch log group for the backend."
  value       = aws_cloudwatch_log_group.backend.name
}

output "backend_log_group_arn" {
  description = "ARN of the CloudWatch log group for the backend."
  value       = aws_cloudwatch_log_group.backend.arn
}
