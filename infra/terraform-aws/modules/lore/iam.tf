# =============================================================================
# Lore Module IAM Roles
# =============================================================================

# ---------------------------------------------------------------------------
# Execution Role — used by ECS agent to pull images and write logs
# ---------------------------------------------------------------------------
resource "aws_iam_role" "lore_execution" {
  name_prefix        = "${var.environment}-portals-lore-exec-"
  assume_role_policy = data.aws_iam_policy_document.assume_role_ecs.json

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-lore-execution-role"
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

resource "aws_iam_role_policy_attachment" "lore_execution_ecs" {
  role       = aws_iam_role.lore_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Inline policy for Secrets Manager access
resource "aws_iam_role_policy" "lore_execution_secrets" {
  name = "secrets-manager-access"
  role = aws_iam_role.lore_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          var.secrets_arns["hmac-key"],
          var.secrets_arns["jwks"]
        ]
      }
    ]
  })
}

# Inline policy for ECR access
resource "aws_iam_role_policy" "lore_execution_ecr" {
  name = "ecr-access"
  role = aws_iam_role.lore_execution.id

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
resource "aws_iam_role_policy" "lore_execution_logs" {
  name = "cloudwatch-logs"
  role = aws_iam_role.lore_execution.id

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
# Task Role — used by Lore container to access AWS services
# ---------------------------------------------------------------------------
resource "aws_iam_role" "lore_task" {
  name_prefix        = "${var.environment}-portals-lore-task-"
  assume_role_policy = data.aws_iam_policy_document.assume_role_ecs.json

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-lore-task-role"
  })
}

# Inline policy for S3 access (scoped to fragments bucket only)
resource "aws_iam_role_policy" "lore_task_s3" {
  name = "s3-fragments-access"
  role = aws_iam_role.lore_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.s3_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = var.s3_bucket_arn
      }
    ]
  })
}

# Inline policy for DynamoDB access (scoped to fragment tables only)
resource "aws_iam_role_policy" "lore_task_dynamodb" {
  name = "dynamodb-fragments-access"
  role = aws_iam_role.lore_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          var.dynamodb_fragments_table_arn,
          "${var.dynamodb_fragments_table_arn}/index/*",
          var.dynamodb_metadata_table_arn
        ]
      }
    ]
  })
}

# Inline policy for Secrets Manager (HMAC key and JWKS)
resource "aws_iam_role_policy" "lore_task_secrets" {
  name = "secrets-manager-access"
  role = aws_iam_role.lore_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          var.secrets_arns["hmac-key"],
          var.secrets_arns["jwks"]
        ]
      }
    ]
  })
}
