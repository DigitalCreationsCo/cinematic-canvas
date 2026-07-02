# =============================================================================
# NLB Module Outputs
# =============================================================================

output "nlb_arn" {
  description = "NLB ARN"
  value       = aws_lb.main.arn
}

output "nlb_dns_name" {
  description = "NLB DNS name"
  value       = aws_lb.main.dns_name
}

output "nlb_zone_id" {
  description = "NLB canonical hosted zone ID"
  value       = aws_lb.main.zone_id
}

output "tcp_target_group_arn" {
  description = "TCP target group ARN (port 41337)"
  value       = aws_lb_target_group.tcp.arn
}

output "udp_target_group_arn" {
  description = "UDP target group ARN (port 41337)"
  value       = aws_lb_target_group.udp.arn
}

output "security_group_id" {
  description = "NLB security group ID"
  value       = aws_security_group.nlb.id
}
