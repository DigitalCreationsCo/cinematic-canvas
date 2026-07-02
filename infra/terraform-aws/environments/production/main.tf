# =============================================================================
# Production Environment — Root Module
# =============================================================================
#
# Composes all infrastructure modules for the Portals production deployment
# on AWS ECS Fargate. Deploys Lore Server, Backend API, and all supporting
# infrastructure (VPC, S3, DynamoDB, EFS, Secrets, ECR, ALB, NLB, Route53).
#
# =============================================================================

provider "aws" {
  region = var.aws_region
}

# ---------------------------------------------------------------------------
# VPC Module
# ---------------------------------------------------------------------------
module "vpc" {
  source = "../../modules/vpc"

  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  tags               = var.tags
}

# ---------------------------------------------------------------------------
# S3 Module
# ---------------------------------------------------------------------------
module "s3" {
  source = "../../modules/s3"

  bucket_name   = var.s3_bucket_name
  environment   = var.environment
  force_destroy = false
  tags          = var.tags
}

# ---------------------------------------------------------------------------
# DynamoDB Module
# ---------------------------------------------------------------------------
module "dynamodb" {
  source = "../../modules/dynamodb"

  environment                   = var.environment
  fragments_table_name          = var.dynamodb_fragments_table_name
  metadata_table_name           = var.dynamodb_metadata_table_name
  enable_point_in_time_recovery = true
  tags                          = var.tags
}

# ---------------------------------------------------------------------------
# EFS Module
# ---------------------------------------------------------------------------
module "efs" {
  source = "../../modules/efs"

  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  ecs_security_group_id = aws_security_group.ecs_tasks.id
  tags                  = var.tags
}

# ---------------------------------------------------------------------------
# Secrets Module
# ---------------------------------------------------------------------------
module "secrets" {
  source = "../../modules/secrets"

  environment  = var.environment
  jwt_issuer   = var.jwt_issuer
  jwt_audience = var.jwt_audience
  database_url = var.database_url
  tags         = var.tags
}

# ---------------------------------------------------------------------------
# ECR Module
# ---------------------------------------------------------------------------
module "ecr" {
  source = "../../modules/ecr"

  environment                = var.environment
  repository_names           = var.ecr_repository_names
  force_delete               = false
  untagged_image_expiry_days = 7
  max_tagged_image_count     = 10
  tags                       = var.tags
}

# ---------------------------------------------------------------------------
# CloudWatch Module
# ---------------------------------------------------------------------------
module "cloudwatch" {
  source = "../../modules/cloudwatch"

  environment        = var.environment
  log_retention_days = var.log_retention_days
  tags               = var.tags
}

# ---------------------------------------------------------------------------
# ECS Cluster Module
# ---------------------------------------------------------------------------
module "ecs" {
  source = "../../modules/ecs"

  environment  = var.environment
  cluster_name = "PortalsProductionCluster"
  tags         = var.tags
}

# ---------------------------------------------------------------------------
# ALB Module
# ---------------------------------------------------------------------------
module "alb" {
  source = "../../modules/alb"

  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  environment       = var.environment
  certificate_arn   = module.route53.certificate_arn
  tags              = var.tags
}

# ---------------------------------------------------------------------------
# NLB Module
# ---------------------------------------------------------------------------
module "nlb" {
  source = "../../modules/nlb"

  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  environment       = var.environment
  tags              = var.tags
}

# ---------------------------------------------------------------------------
# Route53 Module (conditional)
# ---------------------------------------------------------------------------
module "route53" {
  source = "../../modules/route53"

  domain_name    = var.domain_name
  hosted_zone_id = var.hosted_zone_id
  alb_dns_name   = module.alb.alb_dns_name
  alb_zone_id    = module.alb.alb_zone_id
  nlb_dns_name   = module.nlb.nlb_dns_name
  nlb_zone_id    = module.nlb.nlb_zone_id
  tags           = var.tags
}

# ---------------------------------------------------------------------------
# Lore Module
# ---------------------------------------------------------------------------
module "lore" {
  source = "../../modules/lore"

  cluster_id                    = module.ecs.cluster_id
  cluster_name                  = module.ecs.cluster_name
  ecr_repository_url            = module.ecr.repository_urls["portals/lore-server"]
  image_tag                     = var.lore_image_tag
  vpc_id                        = module.vpc.vpc_id
  private_subnet_ids            = module.vpc.private_subnet_ids
  efs_file_system_id            = module.efs.file_system_id
  efs_access_point_id           = module.efs.access_point_id
  s3_bucket_name                = module.s3.bucket_name
  s3_bucket_arn                 = module.s3.bucket_arn
  dynamodb_fragments_table_name = module.dynamodb.fragments_table_name
  dynamodb_fragments_table_arn  = module.dynamodb.fragments_table_arn
  dynamodb_metadata_table_name  = module.dynamodb.metadata_table_name
  dynamodb_metadata_table_arn   = module.dynamodb.metadata_table_arn
  secrets_arns = {
    hmac-key = module.secrets.hmac_key_arn
    jwks     = module.secrets.jwks_arn
  }
  jwks_content              = module.secrets.jwks_content
  jwt_issuer                = var.jwt_issuer
  jwt_audience              = var.jwt_audience
  alb_target_group_arn      = module.alb.lore_target_group_arn
  nlb_target_group_tcp_arn  = module.nlb.tcp_target_group_arn
  nlb_target_group_udp_arn  = module.nlb.udp_target_group_arn
  alb_security_group_id     = module.alb.security_group_id
  nlb_security_group_id     = module.nlb.security_group_id
  efs_security_group_id     = module.efs.security_group_id
  cpu                       = var.lore_cpu
  memory                    = var.lore_memory
  desired_count             = var.lore_desired_count
  environment               = var.environment
  region                    = var.aws_region
  cloudwatch_log_group_name = module.cloudwatch.lore_log_group_name
  tags                      = var.tags

  depends_on = [
    module.alb,
    module.nlb,
    module.efs
  ]
}

# ---------------------------------------------------------------------------
# Backend Module
# ---------------------------------------------------------------------------
module "backend" {
  source = "../../modules/backend"

  cluster_id                 = module.ecs.cluster_id
  ecr_repository_url         = module.ecr.repository_urls["portals/backend"]
  image_tag                  = var.backend_image_tag
  vpc_id                     = module.vpc.vpc_id
  private_subnet_ids         = module.vpc.private_subnet_ids
  alb_target_group_arn       = module.alb.backend_target_group_arn
  alb_security_group_id      = module.alb.security_group_id
  database_url_secret_arn    = module.secrets.database_url_arn
  jwt_private_key_secret_arn = module.secrets.jwt_private_key_arn
  jwt_kid_secret_arn         = module.secrets.jwt_kid_arn
  jwt_config_secret_arn      = module.secrets.jwt_config_arn
  cpu                        = var.backend_cpu
  memory                     = var.backend_memory
  desired_count              = var.backend_desired_count
  environment                = var.environment
  region                     = var.aws_region
  cloudwatch_log_group_name  = module.cloudwatch.backend_log_group_name
  tags                       = var.tags

  depends_on = [
    module.alb
  ]
}

# ---------------------------------------------------------------------------
# Shared ECS Tasks Security Group
# ---------------------------------------------------------------------------
resource "aws_security_group" "ecs_tasks" {
  name_prefix = "${var.environment}-portals-ecs-tasks-"
  description = "Shared security group for ECS tasks"
  vpc_id      = module.vpc.vpc_id

  # Allow all outbound
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-ecs-tasks-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}
