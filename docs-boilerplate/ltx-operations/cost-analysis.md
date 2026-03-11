---
title: Cost Analysis
description: Pricing breakdown for LTX video generation, storage, and compute.
keywords: ["cost", "pricing", "ltx", "gcp", "budget"]
---


# Cost Analysis (LTX Video)

## Overview

This document provides a detailed breakdown of the costs associated with running the LTX Video Generation service on GCP.

## Cost Per Second of Video

| Configuration | Cost/Second | Cost/Minute | Notes |
|---------------|-------------|-------------|-------|
| **T4 (Recommended)** | **$0.0096** | **$0.58** | 704x1216, 121 frames |
| **L4 (High Perf)** | **$0.0108** | **$0.65** | Faster generation |
| **T4 Preemptible** | **$0.0027** | **$0.16** | 75% savings, for Dev/Test |

**Formula:**
`Cost = (Generation Time × Hourly Rate) + Storage + Network + LB Overhead`

## Monthly Cost Scenarios

### 1. Idle (Zero-Scale)
When `min_replicas = 0` and no videos are generated.
*   Load Balancer: $18.00
*   Cloud Armor: $5.00
*   Storage/Secrets: ~$1.86
*   **Total: ~$24.86 / month**

### 2. Hobbyist (10 videos/month)
*   **Config**: T4 Preemptible, min=0
*   **Compute**: ~$1.20
*   **Fixed**: $24.86
*   **Total: ~$26.07 / month**

### 3. Small Business (100 videos/month)
*   **Config**: T4 Standard, min=0
*   **Compute**: ~$47.50
*   **Fixed**: $24.86
*   **Total: ~$72.43 / month**
*   **Per Video**: ~$0.72

### 4. High Volume (2,000 videos/month)
*   **Config**: L4 Standard, min=1
*   **Compute**: ~$1,200
*   **Fixed**: ~$100 (traffic dependent)
*   **Total: ~$1,300 / month**
*   **Per Video**: ~$0.65

## Optimization Strategies

1.  **Aggressive Scale-Down**: Set `autoscaling_cooldown_period = 180` (3 mins) to shut down VMs quickly after use.
2.  **Preemptible VMs**: Use `use_preemptible = true` for development environments to save 70-80%.
3.  **Scheduled Scaling**: Use Cloud Scheduler to set `min_replicas=1` only during business hours.
4.  **Region Selection**: `us-central1` is typically cheapest. Asia/Europe regions may be 10-20% more expensive.

## Billing Alerts

It is **highly recommended** to set up budget alerts in GCP:
*   Set a monthly budget (e.g., $50).
*   Configure alerts at 50%, 90%, and 100%.
*   Monitor the `ltx-video-mig` instance group size to ensure it doesn't scale unexpectedly.
