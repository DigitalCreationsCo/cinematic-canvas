output "jwt_private_key_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the JWT private key."
  value       = aws_secretsmanager_secret.jwt_private_key.arn
}

output "jwt_private_key_arn" {
  description = "ARN of the Secrets Manager secret holding the JWT private key (alias)."
  value       = aws_secretsmanager_secret.jwt_private_key.arn
}

output "jwks_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the JWKS document."
  value       = aws_secretsmanager_secret.jwks.arn
}

output "jwks_arn" {
  description = "ARN of the Secrets Manager secret holding the JWKS document (alias)."
  value       = aws_secretsmanager_secret.jwks.arn
}

output "jwt_kid_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the JWT key ID."
  value       = aws_secretsmanager_secret.jwt_kid.arn
}

output "jwt_kid_arn" {
  description = "ARN of the Secrets Manager secret holding the JWT key ID (alias)."
  value       = aws_secretsmanager_secret.jwt_kid.arn
}

output "hmac_key_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the presigned URL HMAC key."
  value       = aws_secretsmanager_secret.hmac_key.arn
}

output "hmac_key_arn" {
  description = "ARN of the Secrets Manager secret holding the presigned URL HMAC key (alias)."
  value       = aws_secretsmanager_secret.hmac_key.arn
}

output "database_url_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the DATABASE_URL."
  value       = aws_secretsmanager_secret.database_url.arn
}

output "database_url_arn" {
  description = "ARN of the Secrets Manager secret holding the DATABASE_URL (alias)."
  value       = aws_secretsmanager_secret.database_url.arn
}

output "jwt_config_secret_arn" {
  description = "ARN of the Secrets Manager secret holding the JWT configuration."
  value       = aws_secretsmanager_secret.jwt_config.arn
}

output "jwt_config_arn" {
  description = "ARN of the Secrets Manager secret holding the JWT configuration (alias)."
  value       = aws_secretsmanager_secret.jwt_config.arn
}

output "jwks_content" {
  description = "Raw JWKS JSON content. Used to configure the JWKS sidecar or upload to S3."
  value       = data.local_file.jwt_public_jwks.content
}

output "jwt_kid" {
  description = "Key ID baked into the JWKS and expected in every minted token's header."
  value       = trimspace(data.local_file.jwt_kid.content)
}

# Map of all secret ARNs for convenient IAM policy construction
output "all_secret_arns" {
  description = "Map of all secret ARNs keyed by logical name."
  value = {
    jwt_private_key = aws_secretsmanager_secret.jwt_private_key.arn
    jwks            = aws_secretsmanager_secret.jwks.arn
    jwt_kid         = aws_secretsmanager_secret.jwt_kid.arn
    hmac_key        = aws_secretsmanager_secret.hmac_key.arn
    database_url    = aws_secretsmanager_secret.database_url.arn
    jwt_config      = aws_secretsmanager_secret.jwt_config.arn
  }
}
