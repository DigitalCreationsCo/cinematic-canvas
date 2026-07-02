variable "environment" {
  description = "Deployment environment name."
  type        = string
}

variable "jwt_issuer" {
  description = "JWT issuer claim. Must match what mint_token.py stamps and what Lore's server.auth.jwt_issuer checks."
  type        = string
  default     = "lore-token-issuer"
}

variable "jwt_audience" {
  description = "JWT audience claim(s). Must match what Lore's server.auth.jwt_audience accepts."
  type        = list(string)
  default     = ["lore-server"]
}

variable "database_url" {
  description = "Supabase pooled PostgreSQL connection URL. Stored in Secrets Manager and injected into the backend ECS task."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
