output "repository_urls" {
  description = "Map of repository name to URL."
  value       = { for k, v in aws_ecr_repository.repos : k => v.repository_url }
}

output "repository_arns" {
  description = "Map of repository name to ARN."
  value       = { for k, v in aws_ecr_repository.repos : k => v.arn }
}
