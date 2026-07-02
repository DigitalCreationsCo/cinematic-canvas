output "fragments_table_arn" {
  description = "ARN of the fragment index DynamoDB table."
  value       = aws_dynamodb_table.fragments.arn
}

output "fragments_table_name" {
  description = "Name of the fragment index DynamoDB table."
  value       = aws_dynamodb_table.fragments.name
}

output "metadata_table_arn" {
  description = "ARN of the fragment metadata DynamoDB table."
  value       = aws_dynamodb_table.metadata.arn
}

output "metadata_table_name" {
  description = "Name of the fragment metadata DynamoDB table."
  value       = aws_dynamodb_table.metadata.name
}
