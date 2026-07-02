# =============================================================================
# Backend Module — Backend API ECS Service
# =============================================================================
#
# Deploys the Backend API as an ECS Fargate service with:
# - ALB attachment for HTTP (port 7860)
# - Secrets Manager integration for DATABASE_URL and JWT keys
# - Health check endpoint
#
# =============================================================================

# ---------------------------------------------------------------------------
# Security Group — Backend ECS tasks
# ---------------------------------------------------------------------------
resource "aws_security_group" "backend" {
  name_prefix = "${var.environment}-portals-backend-"
  description = "Allow traffic from ALB to Backend ECS tasks"
  vpc_id      = var.vpc_id

  # HTTP from ALB (port 7860)
  ingress {
    description     = "HTTP from ALB"
    from_port       = 7860
    to_port         = 7860
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  # Egress to AWS services (Secrets Manager, etc.)
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-backend-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Task Definition
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "backend" {
  family                   = "backend-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.backend_execution.arn
  task_role_arn            = aws_iam_role.backend_task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "${var.ecr_repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 7860
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "PORTALS_HOST"
          value = "0.0.0.0"
        },
        {
          name  = "PORTALS_PORT"
          value = "7860"
        },
        {
          name  = "PORTALS_BACKEND_ONLY"
          value = "true"
        },
        {
          name  = "RUST_LOG"
          value = "info"
        }
      ]

      secrets = [
        {
          name      = "PORTALS_DATABASE_URL"
          valueFrom = var.database_url_secret_arn
        },
        {
          name      = "PORTALS_JWT_PRIVATE_KEY"
          valueFrom = var.jwt_private_key_secret_arn
        },
        {
          name      = "PORTALS_JWT_KID"
          valueFrom = var.jwt_kid_secret_arn
        },
        {
          name      = "PORTALS_JWT_CONFIG"
          valueFrom = var.jwt_config_secret_arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.cloudwatch_log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "backend"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:7860/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      linuxParameters = {
        capabilities = {
          add = ["NET_BIND_SERVICE"]
        }
      }
    }
  ])
}

# ---------------------------------------------------------------------------
# ECS Service
# ---------------------------------------------------------------------------
resource "aws_ecs_service" "backend" {
  name            = "backend-api"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = false
  }

  # Load balancer attachment
  load_balancer {
    target_group_arn = var.alb_target_group_arn
    container_name   = "backend"
    container_port   = 7860
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-backend-service"
  })

  depends_on = [
    aws_iam_role.backend_execution,
    aws_iam_role.backend_task
  ]
}
