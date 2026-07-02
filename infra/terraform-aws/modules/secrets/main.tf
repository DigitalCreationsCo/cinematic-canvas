# =============================================================================
# Secrets Module — JWT Keypair, HMAC Key, DATABASE_URL
# =============================================================================
#
# Generates the RSA keypair for Lore JWT auth (reusing the existing
# generate_jwt_keys.py script) and stores all secrets in AWS Secrets
# Manager. No secret values appear in Terraform state outputs.
#
# Secrets created:
#   portals/<env>/jwt-private-key   — RSA private key PEM
#   portals/<env>/jwt-public-key    — Public key PEM (convenience)
#   portals/<env>/jwks              — JWKS JSON document
#   portals/<env>/jwt-kid           — Key ID string
#   portals/<env>/hmac-key          — Lore presigned URL HMAC key
#   portals/<env>/database-url      — Supabase pooled connection URL
#   portals/<env>/jwt-config        — JSON with issuer/audience/kid
#
# =============================================================================

# ---------------------------------------------------------------------------
# JWT Keypair Generation
# ---------------------------------------------------------------------------
#
# Runs the same generate_jwt_keys.py script used by the GCP terraform.
# Idempotent: skips generation if files already exist in the output dir.
resource "null_resource" "jwt_keypair" {
  provisioner "local-exec" {
    command = "python3 ${path.module}/scripts/generate_jwt_keys.py ${path.module}/generated"
  }

  triggers = {
    # Re-check on every apply (script is idempotent — only generates
    # if files don't exist yet)
    check = timestamp()
  }
}

# ---------------------------------------------------------------------------
# Read generated files as data sources
# ---------------------------------------------------------------------------
# depends_on defers reads until after local-exec, enabling single-pass
# `terraform apply` from scratch.
data "local_file" "jwt_private_key" {
  filename   = "${path.module}/generated/private_key.pem"
  depends_on = [null_resource.jwt_keypair]
}

data "local_file" "jwt_public_jwks" {
  filename   = "${path.module}/generated/jwks.json"
  depends_on = [null_resource.jwt_keypair]
}

data "local_file" "jwt_kid" {
  filename   = "${path.module}/generated/kid.txt"
  depends_on = [null_resource.jwt_keypair]
}

# ---------------------------------------------------------------------------
# HMAC Key — auto-generated 32-byte random key (64 hex chars)
# ---------------------------------------------------------------------------
resource "random_password" "hmac_key" {
  length  = 64
  special = false
  upper   = false

  # Only hex characters — matches Lore's expected format
  override_special = ""
}

# ---------------------------------------------------------------------------
# Secrets Manager: JWT Private Key
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "jwt_private_key" {
  name        = "portals/${var.environment}/jwt-private-key"
  description = "RSA private key (PKCS8 PEM) for signing Lore JWT tokens. Used by mint_token.py and the backend API."

  tags = merge(var.tags, {
    Environment = var.environment
    Component   = "auth"
  })
}

resource "aws_secretsmanager_secret_version" "jwt_private_key" {
  secret_id     = aws_secretsmanager_secret.jwt_private_key.id
  secret_string = data.local_file.jwt_private_key.content
}

# ---------------------------------------------------------------------------
# Secrets Manager: JWKS Document
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "jwks" {
  name        = "portals/${var.environment}/jwks"
  description = "JWKS JSON document containing the public key for JWT validation. Served to Lore at startup."

  tags = merge(var.tags, {
    Environment = var.environment
    Component   = "auth"
  })
}

resource "aws_secretsmanager_secret_version" "jwks" {
  secret_id     = aws_secretsmanager_secret.jwks.id
  secret_string = data.local_file.jwt_public_jwks.content
}

# ---------------------------------------------------------------------------
# Secrets Manager: JWT Key ID
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "jwt_kid" {
  name        = "portals/${var.environment}/jwt-kid"
  description = "Key ID (kid) for the JWT signing key. Must match the kid in the JWKS document and every minted token."

  tags = merge(var.tags, {
    Environment = var.environment
    Component   = "auth"
  })
}

resource "aws_secretsmanager_secret_version" "jwt_kid" {
  secret_id     = aws_secretsmanager_secret.jwt_kid.id
  secret_string = trimspace(data.local_file.jwt_kid.content)
}

# ---------------------------------------------------------------------------
# Secrets Manager: Presigned URL HMAC Key
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "hmac_key" {
  name        = "portals/${var.environment}/hmac-key"
  description = "32-byte HMAC key (hex-encoded) for Lore HTTP presigned URLs."

  tags = merge(var.tags, {
    Environment = var.environment
    Component   = "lore"
  })
}

resource "aws_secretsmanager_secret_version" "hmac_key" {
  secret_id     = aws_secretsmanager_secret.hmac_key.id
  secret_string = random_password.hmac_key.result
}

# ---------------------------------------------------------------------------
# Secrets Manager: Database URL
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "database_url" {
  name        = "portals/${var.environment}/database-url"
  description = "Supabase pooled PostgreSQL connection URL for the Portals backend."

  tags = merge(var.tags, {
    Environment = var.environment
    Component   = "backend"
  })
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = var.database_url
}

# ---------------------------------------------------------------------------
# Secrets Manager: JWT Configuration (reference document)
# ---------------------------------------------------------------------------
resource "aws_secretsmanager_secret" "jwt_config" {
  name        = "portals/${var.environment}/jwt-config"
  description = "JWT configuration reference (issuer, audience, kid). Read by services that need to validate or mint tokens."

  tags = merge(var.tags, {
    Environment = var.environment
    Component   = "auth"
  })
}

resource "aws_secretsmanager_secret_version" "jwt_config" {
  secret_id = aws_secretsmanager_secret.jwt_config.id
  secret_string = jsonencode({
    issuer   = var.jwt_issuer
    audience = var.jwt_audience
    kid      = trimspace(data.local_file.jwt_kid.content)
  })
}
