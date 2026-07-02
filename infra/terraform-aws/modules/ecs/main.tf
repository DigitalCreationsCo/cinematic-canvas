# =============================================================================
# ECS Module — Fargate Cluster
# =============================================================================
#
# ECS cluster with Container Insights enabled. Uses Fargate and
# Fargate Spot capacity providers (no EC2 instances to manage).
#
# =============================================================================

resource "aws_ecs_cluster" "main" {
  name = var.cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(var.tags, {
    Name        = var.cluster_name
    Environment = var.environment
  })
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}
