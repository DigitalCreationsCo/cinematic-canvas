# AWS Production Deployment — Terraform

This directory contains the Terraform configuration for deploying Portals to AWS ECS Fargate in production. The deployment provisions Lore Server, Backend API, and all supporting infrastructure including VPC, S3, DynamoDB, EFS, Secrets Manager, ECR, ALB, NLB, and Route53.

## Architecture

```
Internet
   │
   ├── ALB (HTTPS:443, ACM cert)
   │        │
   │        ├── /api/* → Backend ECS (port 7860)
   │        ├── /health → Backend ECS (port 7860)
   │        └── /* → Lore HTTP (port 41339)
   │
   └── NLB (TCP:41337, UDP:41337)
            │
            └── Lore ECS (port 41337 TCP+UDP)
                    │
                    ├── S3: portals-lore-production-fragments
                    ├── DynamoDB: portals-fragments / portals-fragment-metadata
                    ├── EFS: /data (mutable store + lock store + certs)
                    └── Secrets Manager (JWT keys, HMAC key, DATABASE_URL)
```

## Prerequisites

- AWS account with appropriate permissions
- AWS CLI configured with credentials
- Terraform >= 1.5.0
- Python 3.8+ (for JWT key generation)
- Supabase project with pooled connection URL
- Docker (for building and pushing images to ECR)

## Quick Start

### 1. Configure Variables

Copy the example variables file and fill in the required values:

```bash
cd environments/production
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and provide:
- `database_url`: Supabase pooled PostgreSQL connection URL (required)
- `domain_name`: Your domain name (optional, leave empty for raw ALB/NLB DNS)
- `hosted_zone_id`: Route53 hosted zone ID (required if domain_name is set)

### 2. Initialize Terraform

```bash
terraform init
```

### 3. Review the Plan

```bash
terraform plan
```

### 4. Apply the Configuration

```bash
terraform apply
```

After successful deployment, Terraform will output:
- `alb_dns_name`: ALB DNS name for HTTP/HTTPS access
- `nlb_dns_name`: NLB DNS name for QUIC/gRPC access
- `lore_remote_url`: Lore remote URL format
- `api_url`: Backend API URL
- `ecr_repository_urls`: ECR repository URLs for image pushes
- `jwt_kid`: JWT key ID for token minting
- `jwt_signing_key_secret_arn`: ARN for granting access to token minters

### 5. Push Docker Images to ECR

The Terraform configuration creates ECR repositories but does not push images. You must build and push images manually:

```bash
# Authenticate Docker with ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build and push Lore server image
docker build -f Dockerfile.loreserver.base -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/portals/lore-server:latest .
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/portals/lore-server:latest

# Build and push Backend image
docker build -f Dockerfile.backend -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/portals/backend:latest .
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/portals/backend:latest
```

### 6. Update ECS Services

After pushing images, update the ECS services to use the new images:

```bash
# Force service redeployment
aws ecs update-service --cluster PortalsProductionCluster --service lore-server --force-new-deployment
aws ecs update-service --cluster PortalsProductionCluster --service backend-api --force-new-deployment
```

## Token Minting

Use the updated `mint_token.py` script to generate JWT tokens for Lore authentication:

### AWS Secrets Manager

```bash
python3 infra/lore/auth/mint_token.py \
  --subject user@example.com \
  --aws-region us-east-1 \
  --aws-secret-id portals/production/jwt-private-key \
  --expires-in 86400
```

### GCP Secret Manager (legacy)

```bash
python3 infra/lore/auth/mint_token.py \
  --subject user@example.com \
  --project-id my-gcp-project \
  --expires-in 86400
```

### Local Key File

```bash
python3 infra/lore/auth/mint_token.py \
  --subject user@example.com \
  --key-file infra/terraform-aws/modules/secrets/generated/private_key.pem \
  --kid-file infra/terraform-aws/modules/secrets/generated/kid.txt \
  --expires-in 86400
```

## Operational Notes

### Scaling

- **Lore Server**: Single-node topology by default (desired_count = 1). Lore's topology provider is set to "none" for single-node operation. Do not scale beyond 1 task without updating Lore configuration.
- **Backend API**: Multi-node topology by default (desired_count = 2). Can be scaled horizontally via ECS auto-scaling policies.

### Key Rotation

To rotate JWT keys:

1. Delete the generated key files in `modules/secrets/generated/`
2. Run `terraform apply` to regenerate keys and update Secrets Manager
3. Update any services that cache the JWKS or kid

### Cost Optimization

- **NAT Gateway**: Single NAT Gateway in one AZ for cost savings. Upgrade to per-AZ NATs for production HA if needed.
- **EFS**: Bursting throughput mode is cost-effective for moderate workloads. Switch to provisioned throughput for high I/O workloads.
- **ECR Lifecycle**: Untagged images expire after 7 days; last 10 tagged images are retained.

### Monitoring

- **CloudWatch Logs**: Lore and Backend logs are sent to `/portals/production/lore-server` and `/portals/production/backend` log groups with 30-day retention.
- **ECS Container Insights**: Enabled on the cluster for task-level metrics.
- **Health Checks**: Lore HTTP health check on port 41339, Backend health check on port 7860.

## Module Reference

### modules/vpc
3-AZ VPC with public and private subnets, NAT Gateway, Internet Gateway.

### modules/s3
S3 bucket for immutable fragment storage with SSE-S3 encryption and blocked public access.

### modules/dynamodb
Two DynamoDB tables for fragment index and metadata with PAY_PER_REQUEST billing and PITR enabled.

### modules/efs
EFS file system for persistent Lore storage (mutable store, locks, certs) with mount targets in private subnets.

### modules/secrets
Generates JWT keypair and stores secrets in AWS Secrets Manager (private key, JWKS, kid, HMAC key, DATABASE_URL, JWT config).

### modules/ecr
ECR repositories for Lore server and Backend images with lifecycle policies.

### modules/ecs
ECS Fargate cluster with Container Insights enabled.

### modules/lore
Lore Server ECS service with EFS volume, JWKS sidecar container, ALB/NLB attachments.

### modules/backend
Backend API ECS service with Secrets Manager integration and ALB attachment.

### modules/alb
Application Load Balancer for HTTP traffic with routing rules for API and Lore.

### modules/nlb
Network Load Balancer for QUIC (UDP) and gRPC (TCP) traffic.

### modules/cloudwatch
CloudWatch log groups for ECS service logs.

### modules/route53
Conditional Route53 records and ACM certificate (only when domain_name is provided).

## Troubleshooting

### ECS Tasks Not Starting

Check task logs in CloudWatch:
```bash
aws logs tail /portals/production/lore-server --follow
aws logs tail /portals/production/backend --follow
```

Common issues:
- ECR image pull errors: Verify image exists in ECR and task role has ecr permissions
- EFS mount failures: Verify EFS security group allows NFS from ECS tasks
- Secret access errors: Verify task role has secretsmanager:GetSecretValue permissions

### Health Check Failures

- Lore health check: `curl http://<ALB_DNS_NAME>/health_check`
- Backend health check: `curl http://<ALB_DNS_NAME>/health`

### NLB UDP Health Checks

NLB does not support UDP health checks directly. The UDP target group uses TCP health checks on port 41339 (Lore HTTP) as a proxy.

### JWKS Sidecar

The JWKS is served by a lightweight Python sidecar container on `http://127.0.0.1:8080/jwks.json`. If Lore fails to fetch JWKS at startup, check the sidecar logs.

### Terraform State Lock

If Terraform state is locked, use:
```bash
terraform force-unlock <LOCK_ID>
```

## Security Considerations

- **Least Privilege**: IAM roles are scoped to specific resources (S3 bucket, DynamoDB tables, Secrets Manager secrets).
- **Secrets Management**: All sensitive values are stored in AWS Secrets Manager; no secrets appear in Terraform outputs.
- **Network Security**: ECS tasks in private subnets; only ALB/NLB have public IPs. Security groups restrict inbound traffic.
- **Encryption**: EFS, S3, and DynamoDB are encrypted at rest. TLS is used for ALB (when ACM cert is configured).

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

**Warning**: This will delete all resources including EFS data, DynamoDB tables, and S3 bucket contents. Ensure you have backups if needed.

## Migration from GCP

The existing GCP Terraform configuration in `infra/terraform/` is preserved. This AWS deployment is completely separate and does not interfere with the GCP setup. If you prefer to replace the GCP deployment in-place, you can delete `infra/terraform/` after verifying the AWS deployment is working correctly.
