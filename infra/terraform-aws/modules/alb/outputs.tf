# =============================================================================
# ALB Module Outputs
# =============================================================================

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB canonical hosted zone ID"
  value       = aws_lb.main.zone_id
}

output "lore_target_group_arn" {
  description = "Lore HTTP target group ARN (port 41339)"
  value       = aws_lb_target_group.lore.arn
}

output "backend_target_group_arn" {
  description = "Backend target group ARN (port 7860)"
  value       = aws_lb_target_group.backend.arn
}

output "security_group_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}
