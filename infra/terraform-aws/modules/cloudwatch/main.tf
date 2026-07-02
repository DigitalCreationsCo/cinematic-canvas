# =============================================================================
# CloudWatch Module — ECS Service Log Groups
# =============================================================================
#
# Dedicated log groups for Lore Server and Backend API. ECS tasks use
# the awslogs log driver to ship container stdout/stderr here.
#
# =============================================================================

resource "aws_cloudwatch_log_group" "lore_server" {
  name              = "/portals/${var.environment}/lore-server"
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, {
    Name        = "lore-server"
    Environment = var.environment
    Service     = "lore"
  })
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/portals/${var.environment}/backend"
  retention_in_days = var.log_retention_days

  tags = merge(var.tags, {
    Name        = "backend"
    Environment = var.environment
    Service     = "backend"
  })
}
