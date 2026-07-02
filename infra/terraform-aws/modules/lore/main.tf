# =============================================================================
# Lore Module — Lore Server ECS Service
# =============================================================================
#
# Deploys the Lore server as an ECS Fargate service with:
# - EFS volume for persistent storage (mutable store, locks, certs)
# - S3 + DynamoDB for immutable fragment store
# - JWKS sidecar container for JWT validation
# - ALB attachment for HTTP (port 41339)
# - NLB attachment for QUIC/gRPC (port 41337 TCP+UDP)
#
# =============================================================================

# ---------------------------------------------------------------------------
# Security Group — Lore ECS tasks
# ---------------------------------------------------------------------------
resource "aws_security_group" "lore" {
  name_prefix = "${var.environment}-portals-lore-"
  description = "Allow traffic from ALB/NLB to Lore ECS tasks"
  vpc_id      = var.vpc_id

  # HTTP from ALB (port 41339)
  ingress {
    description     = "HTTP from ALB"
    from_port       = 41339
    to_port         = 41339
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  # TCP from NLB (port 41337)
  ingress {
    description     = "TCP from NLB"
    from_port       = 41337
    to_port         = 41337
    protocol        = "tcp"
    security_groups = [var.nlb_security_group_id]
  }

  # UDP from NLB (port 41337)
  ingress {
    description     = "UDP from NLB"
    from_port       = 41337
    to_port         = 41337
    protocol        = "udp"
    security_groups = [var.nlb_security_group_id]
  }

  # Egress to AWS services (S3, DynamoDB, Secrets Manager)
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # NFS to EFS
  egress {
    description     = "NFS to EFS"
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [var.efs_security_group_id]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-lore-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Task Definition
# ---------------------------------------------------------------------------
resource "aws_ecs_task_definition" "lore" {
  family                   = "lore-server"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.lore_execution.arn
  task_role_arn            = aws_iam_role.lore_task.arn

  # EFS volume for persistent storage
  volume {
    name = "lore-data"

    efs_volume_configuration {
      file_system_id     = var.efs_file_system_id
      root_directory     = "/"
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = var.efs_access_point_id
        iam             = "DISABLED"
      }
    }
  }

  # Lore server container
  container_definitions = jsonencode([
    {
      name      = "lore-server"
      image     = "${var.ecr_repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = 41337
          protocol      = "tcp"
        },
        {
          containerPort = 41337
          protocol      = "udp"
        },
        {
          containerPort = 41339
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "LORE_CONFIG_PATH"
          value = "/etc/lore/config"
        },
        {
          name  = "LORE_ENV"
          value = "prod"
        },
        {
          name  = "RUST_LOG"
          value = "info"
        },
        {
          name  = "AWS_DEFAULT_REGION"
          value = var.region
        },
        {
          name  = "LORE__PLUGINS__AWS__IMMUTABLE_STORE__S3_BUCKET"
          value = var.s3_bucket_name
        },
        {
          name  = "LORE__PLUGINS__AWS__IMMUTABLE_STORE__S3_REGION"
          value = var.region
        },
        {
          name  = "LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_FRAGMENTS_TABLE"
          value = var.dynamodb_fragments_table_name
        },
        {
          name  = "LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_METADATA_TABLE"
          value = var.dynamodb_metadata_table_name
        },
        {
          name  = "LORE__PLUGINS__AWS__IMMUTABLE_STORE__DYNAMODB_REGION"
          value = var.region
        },
        {
          name  = "LORE__SERVER__AUTH__JWK__ENDPOINT"
          value = "http://127.0.0.1:8080/jwks.json"
        },
        {
          name  = "LORE__SERVER__AUTH__JWT_ISSUER"
          value = var.jwt_issuer
        },
        {
          name  = "LORE__SERVER__AUTH__JWT_AUDIENCE"
          value = jsonencode(var.jwt_audience)
        }
      ]

      secrets = [
        {
          name      = "LORE__SERVER__HTTP__PRESIGNED_URL_HMAC_KEY"
          valueFrom = var.secrets_arns["hmac-key"]
        }
      ]

      mountPoints = [
        {
          sourceVolume  = "lore-data"
          containerPath = "/data"
          readOnly      = false
        }
      ]

      # Entrypoint script to generate self-signed cert if missing
      entryPoint = ["/bin/sh", "-c"]
      command = [
        <<-EOT
          if [ ! -f /data/certs/cert.pem ]; then
            echo "Generating self-signed TLS certificate..."
            mkdir -p /data/certs
            openssl req -x509 -newkey rsa:2048 -keyout /data/certs/key.pem -out /data/certs/cert.pem \
              -days 365 -nodes -subj "/CN=localhost"
            echo "Certificate generated at /data/certs/"
          fi
          exec /usr/local/bin/loreserver
        EOT
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.cloudwatch_log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "lore"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:41339/health_check || exit 1"]
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
    },
    # JWKS sidecar container
    {
      name      = "jwks-sidecar"
      image     = "python:3.11-slim"
      essential = false

      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]

      entryPoint = ["/bin/sh", "-c"]
      command = [
        <<-EOT
          echo '${var.jwks_content}' > /jwks.json
          cd / && python3 -m http.server 8080
        EOT
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = var.cloudwatch_log_group_name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "jwks-sidecar"
        }
      }
    }
  ])
}

# ---------------------------------------------------------------------------
# ECS Service
# ---------------------------------------------------------------------------
resource "aws_ecs_service" "lore" {
  name            = "lore-server"
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.lore.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  platform_version = "1.4.0" # Required for EFS + UDP support

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.lore.id]
    assign_public_ip = false
  }

  # Load balancer attachments
  load_balancer {
    target_group_arn = var.alb_target_group_arn
    container_name   = "lore-server"
    container_port   = 41339
  }

  load_balancer {
    target_group_arn = var.nlb_target_group_tcp_arn
    container_name   = "lore-server"
    container_port   = 41337
  }

  load_balancer {
    target_group_arn = var.nlb_target_group_udp_arn
    container_name   = "lore-server"
    container_port   = 41337
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-lore-service"
  })

  depends_on = [
    aws_iam_role.lore_execution,
    aws_iam_role.lore_task
  ]
}
