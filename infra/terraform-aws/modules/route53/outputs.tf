# =============================================================================
# Route53 Module Outputs
# =============================================================================

output "certificate_arn" {
  description = "ACM certificate ARN (empty if no domain)"
  value       = var.domain_name != "" ? aws_acm_certificate.main[0].arn : ""
}

output "api_fqdn" {
  description = "API FQDN (api.domain.com, empty if no domain)"
  value       = var.domain_name != "" ? "api.${var.domain_name}" : ""
}

output "lore_fqdn" {
  description = "Lore FQDN (lore.domain.com, empty if no domain)"
  value       = var.domain_name != "" ? "lore.${var.domain_name}" : ""
}
