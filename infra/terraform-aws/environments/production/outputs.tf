# =============================================================================
# Production Environment Outputs
# =============================================================================

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.alb_dns_name
}

output "nlb_dns_name" {
  description = "NLB DNS name"
  value       = module.nlb.nlb_dns_name
}

output "lore_remote_url" {
  description = "Lore remote URL format"
  value       = "lore://${module.nlb.nlb_dns_name}:41337/${var.environment}"
}

output "health_check_url" {
  description = "Lore health check URL"
  value       = "http://${module.alb.alb_dns_name}/health_check"
}

output "api_url" {
  description = "Backend API URL"
  value       = var.domain_name != "" ? "https://api.${var.domain_name}" : "http://${module.alb.alb_dns_name}"
}

output "ecr_repository_urls" {
  description = "ECR repository URLs"
  value       = module.ecr.repository_urls
}

output "jwt_kid" {
  description = "JWT key ID (for mint_token.py)"
  value       = module.secrets.jwt_kid
}

output "jwt_signing_key_secret_arn" {
  description = "JWT signing key secret ARN (for granting access to token minters)"
  value       = module.secrets.jwt_private_key_arn
}

output "certificate_arn" {
  description = "ACM certificate ARN (empty if no domain)"
  value       = module.route53.certificate_arn
}

output "api_fqdn" {
  description = "API FQDN (empty if no domain)"
  value       = module.route53.api_fqdn
}

output "lore_fqdn" {
  description = "Lore FQDN (empty if no domain)"
  value       = module.route53.lore_fqdn
}
