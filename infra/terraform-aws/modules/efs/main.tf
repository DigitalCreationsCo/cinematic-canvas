# =============================================================================
# EFS Module — Lore Persistent Storage
# =============================================================================
#
# Provides persistent, shared filesystem storage for the Lore server:
#   - Mutable store (branch pointers, key-value metadata)
#   - Lock store (in-process locks, survives container restarts)
#   - TLS certificates (generated once, persisted)
#
# Mounted at /data inside the Lore ECS task. Mount targets are created
# in each private subnet for cross-AZ access (though Lore runs as a
# single-node topology).
#
# =============================================================================

# ---------------------------------------------------------------------------
# File System
# ---------------------------------------------------------------------------
resource "aws_efs_file_system" "lore" {
  creation_token = "${var.environment}-portals-lore-data"
  encrypted      = true

  performance_mode = "generalPurpose"
  throughput_mode  = "bursting"

  tags = merge(var.tags, {
    Name        = "${var.environment}-portals-lore-data"
    Environment = var.environment
  })
}

# ---------------------------------------------------------------------------
# Security Group — allows NFS from ECS tasks only
# ---------------------------------------------------------------------------
resource "aws_security_group" "efs" {
  name_prefix = "${var.environment}-portals-efs-"
  description = "Allow NFS access to Lore EFS from ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "NFS from ECS tasks"
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [var.ecs_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-efs-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Mount Targets — one per private subnet
# ---------------------------------------------------------------------------
resource "aws_efs_mount_target" "lore" {
  count = length(var.private_subnet_ids)

  file_system_id  = aws_efs_file_system.lore.id
  subnet_id       = var.private_subnet_ids[count.index]
  security_groups = [aws_security_group.efs.id]
}

# ---------------------------------------------------------------------------
# Access Point — Lore data directory
# ---------------------------------------------------------------------------
#
# Root directory creation mode ensures /data exists on the file system.
# Lore's container runs as root (uid=0) because the entrypoint needs
# write access to create subdirectories, certificates, and lock files.
resource "aws_efs_access_point" "lore_data" {
  file_system_id = aws_efs_file_system.lore.id

  root_directory {
    path = "/data"

    creation_info {
      owner_gid   = 0
      owner_uid   = 0
      permissions = "0755"
    }
  }

  posix_user {
    gid = 0
    uid = 0
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-lore-data-ap"
  })
}
