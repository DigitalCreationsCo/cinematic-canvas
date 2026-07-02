output "bucket_arn" {
  description = "ARN of the S3 bucket."
  value       = aws_s3_bucket.fragments.arn
}

output "bucket_name" {
  description = "Name of the S3 bucket."
  value       = aws_s3_bucket.fragments.bucket
}

output "bucket_id" {
  description = "ID of the S3 bucket."
  value       = aws_s3_bucket.fragments.id
}

output "bucket_regional_domain_name" {
  description = "Regional domain name of the S3 bucket."
  value       = aws_s3_bucket.fragments.bucket_regional_domain_name
}
