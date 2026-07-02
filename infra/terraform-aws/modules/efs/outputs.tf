output "file_system_id" {
  description = "ID of the EFS file system."
  value       = aws_efs_file_system.lore.id
}

output "file_system_arn" {
  description = "ARN of the EFS file system."
  value       = aws_efs_file_system.lore.arn
}

output "access_point_id" {
  description = "ID of the EFS access point for Lore data."
  value       = aws_efs_access_point.lore_data.id
}

output "security_group_id" {
  description = "ID of the EFS security group."
  value       = aws_security_group.efs.id
}

output "mount_target_ids" {
  description = "IDs of the EFS mount targets."
  value       = aws_efs_mount_target.lore[*].id
}
