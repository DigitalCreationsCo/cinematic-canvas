---
title: LTX Deployment
description: Detailed guide for deploying the auto-scaling LTX-Video infrastructure on GCP.
keywords: ["deployment", "ltx", "gcp", "terraform", "infrastructure"]
---


# LTX Video Generation - Deployment Guide

## Overview

This guide covers the production deployment of the **LTX-Video** generation service on Google Cloud Platform (GCP). The architecture uses **Managed Instance Groups (MIG)** with **Auto-scaling** and **Global Load Balancing** to provide a secure, high-performance, and cost-effective solution.

## Architecture

```
User Request (HTTPS) 
      ↓
Global Load Balancer (Cloud Armor)
      ↓
Managed Instance Group (Auto-scaling)
      ↓
Compute Engine VM (NVIDIA L4/T4)
  └─ FastAPI Server (serve.py)
      ↓
LTX-Video Model (GPU)
      ↓
Save to GCS (Output Bucket)
```

## Infrastructure Components
*   **VPC Network**: Dedicated network for LTX resources.
*   **MIG**: Handles VM lifecycle, auto-healing, and scaling (0 to N).
*   **Load Balancer**: External HTTP(S) Load Balancer with SSL.
*   **Cloud Armor**: DDoS protection and WAF.
*   **Secret Manager**: Stores API keys.
*   **Cloud Storage**:
    *   `model-cache`: Caches weights to speed up boot times.
    *   `video-output`: Stores generated MP4s.

## Quick Start Deployment

### 1. Prerequisites
*   GCP Project with billing enabled.
*   `gcloud` CLI installed and authenticated.
*   Terraform v1.0+ installed.
*   Required Quotas: NVIDIA T4 or L4 GPUs in your target region.

### 2. Configuration
Navigate to the `terraform` directory in the repository:

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
```hcl
project_id = "your-project-id"
region     = "us-central1"

# Recommended for Production
autoscaling_min_replicas = 0  # Zero cost when idle
autoscaling_max_replicas = 5
machine_type = "n1-standard-8"
gpu_type     = "nvidia-tesla-t4"
```

### 3. Deploy
```bash
terraform init
terraform apply
```

This process takes ~15-20 minutes (infrastructure creation + initial model download).

### 4. Retrieve Credentials
```bash
# Get Load Balancer IP
terraform output -raw load_balancer_ip

# Get API Key
terraform output -raw api_key
```

## Autoscaling Configuration

The service is designed to scale dynamically based on load.

### Zero-Cost Idle (Recommended)
By setting `min_replicas = 0`, the infrastructure scales down completely when not in use.
*   **Idle Cost**: ~$25/month (Load Balancer + Storage).
*   **Cold Start**: ~6-10 minutes for the first request.
*   **Subsequent Requests**: Instant (if within cooldown period).

### Always-On (Low Latency)
By setting `min_replicas = 1`, you ensure at least one instance is always ready.
*   **Idle Cost**: ~$700/month (1 GPU VM + Fixed costs).
*   **Response**: Instant.

### Triggers
*   **Scale Up**: CPU > 70% OR Load Balancer utilization > 80%.
*   **Scale Down**: CPU < 70% for 5 minutes (cooldown).

## Operations

### Check Health
```bash
curl http://<LB_IP>/health
```

### Manual Scaling
You can override autoscaling for maintenance or burst preparation:
```bash
gcloud compute instance-groups managed resize ltx-video-mig \
    --size=3 \
    --region=us-central1
```

### View Logs
```bash
# Application Logs
gcloud logging read "resource.type=gce_instance AND labels.application=ltx-video" --limit 50
```

### SSH Access
```bash
gcloud compute ssh --zone=us-central1-a $(gcloud compute instances list --filter='name~ltx-video-vm' --format='value(name)' --limit=1)
```

## Troubleshooting

### Instances Not Scaling Up
1.  **Check Quotas**: Ensure you have enough GPU quota in the region.
2.  **Check Autoscaler**: `gcloud compute instance-groups managed describe ...`
3.  **Check Errors**: Look for "QuotaExceeded" errors in logs.

### Slow Startup
*   **First Run**: The model must download (~10GB). This takes ~5-10 mins.
*   **Subsequent Runs**: The model is cached in GCS. Startup should be ~4-6 mins.
*   **Fix**: If too slow, consider increasing `min_replicas` or using a faster disk type.

## Security

*   **Network**: VMs are in a private VPC. SSH access is restricted via IAP.
*   **API**: Protected by API Key (header `X-API-Key`).
*   **DDoS**: Cloud Armor filters malicious traffic.
