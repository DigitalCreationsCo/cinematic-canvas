# =============================================================================
# Backend Module IAM Roles
# =============================================================================

# ---------------------------------------------------------------------------
# Execution Role — used by ECS agent to pull images and write logs
# ---------------------------------------------------------------------------
resource "aws_iam_role" "backend_execution" {
  name_prefix        = "${var.environment}-portals-backend-exec-"
  assume_role_policy = data.aws_iam_policy_document.assume_role_ecs.json

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-backend-execution-role"
  })
}

data "aws_iam_policy_document" "assume_role_ecs" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "backend_execution_ecs" {
  role       = aws_iam_role.backend_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Inline policy for Secrets Manager access
resource "aws_iam_role_policy" "backend_execution_secrets" {
  name = "secrets-manager-access"
  role = aws_iam_role.backend_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          var.database_url_secret_arn,
          var.jwt_private_key_secret_arn,
          var.jwt_kid_secret_arn,
          var.jwt_config_secret_arn
        ]
      }
    ]
  })
}

# Inline policy for ECR access
resource "aws_iam_role_policy" "backend_execution_ecr" {
  name = "ecr-access"
  role = aws_iam_role.backend_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
        Resource = "*"
      }
    ]
  })
}

# Inline policy for CloudWatch Logs
resource "aws_iam_role_policy" "backend_execution_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.backend_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.region}:*:log-group:${var.cloudwatch_log_group_name}:*"
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Task Role — used by Backend container to access AWS services
# ---------------------------------------------------------------------------
resource "aws_iam_role" "backend_task" {
  name_prefix        = "${var.environment}-portals-backend-task-"
  assume_role_policy = data.aws_iam_policy_document.assume_role_ecs.json

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-backend-task-role"
  })
}

# Inline policy for Secrets Manager (JWT keys and DATABASE_URL)
resource "aws_iam_role_policy" "backend_task_secrets" {
  name = "secrets-manager-access"
  role = aws_iam_role.backend_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          var.database_url_secret_arn,
          var.jwt_private_key_secret_arn,
          var.jwt_kid_secret_arn,
          var.jwt_config_secret_arn
        ]
      }
    ]
  })
}
