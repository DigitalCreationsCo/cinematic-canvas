# =============================================================================
# Route53 Module — DNS Records and ACM Certificate
# =============================================================================
#
# Conditionally creates Route53 resources when a domain name is provided:
# - ACM certificate with DNS validation
# - A/AAAA records for api.domain.com → ALB
# - A/AAAA records for lore.domain.com → NLB
#
# If domain_name is empty, no resources are created (deployment uses
# raw ALB/NLB DNS names).
#
# =============================================================================

# ---------------------------------------------------------------------------
# ACM Certificate — DNS-validated wildcard
# ---------------------------------------------------------------------------
resource "aws_acm_certificate" "main" {
  count = var.domain_name != "" ? 1 : 0

  domain_name       = "*.${var.domain_name}"
  validation_method = "DNS"

  subject_alternative_names = [
    var.domain_name
  ]

  tags = merge(var.tags, {
    Name        = "${var.domain_name}-wildcard"
    Environment = "production"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# DNS Validation Records
# ---------------------------------------------------------------------------
resource "aws_route53_record" "cert_validation" {
  for_each = var.domain_name != "" ? {
    for dvo in aws_acm_certificate.main[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  type            = each.value.type
  ttl             = 60
  zone_id         = var.hosted_zone_id
}

# ---------------------------------------------------------------------------
# Certificate Validation
# ---------------------------------------------------------------------------
resource "aws_acm_certificate_validation" "main" {
  count = var.domain_name != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]

  depends_on = [aws_route53_record.cert_validation]
}

# ---------------------------------------------------------------------------
# API DNS Records — A + AAAA to ALB
# ---------------------------------------------------------------------------
resource "aws_route53_record" "api_a" {
  count = var.domain_name != "" ? 1 : 0

  name    = "api.${var.domain_name}"
  type    = "A"
  zone_id = var.hosted_zone_id

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "api_aaaa" {
  count = var.domain_name != "" ? 1 : 0

  name    = "api.${var.domain_name}"
  type    = "AAAA"
  zone_id = var.hosted_zone_id

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# ---------------------------------------------------------------------------
# Lore DNS Records — A + AAAA to NLB
# ---------------------------------------------------------------------------
resource "aws_route53_record" "lore_a" {
  count = var.domain_name != "" ? 1 : 0

  name    = "lore.${var.domain_name}"
  type    = "A"
  zone_id = var.hosted_zone_id

  alias {
    name                   = var.nlb_dns_name
    zone_id                = var.nlb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "lore_aaaa" {
  count = var.domain_name != "" ? 1 : 0

  name    = "lore.${var.domain_name}"
  type    = "AAAA"
  zone_id = var.hosted_zone_id

  alias {
    name                   = var.nlb_dns_name
    zone_id                = var.nlb_zone_id
    evaluate_target_health = true
  }
}
