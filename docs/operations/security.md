---
title: Security
description: Security practices for network, authentication, data protection, and content safety.
keywords: ["security", "authentication", "encryption", "vpc", "safety"]
---


# Security

## Overview

Security in Cinematic Canvas is multi-layered, protecting assets, infrastructure, and user data.

## 1. Network Security

### VPC Isolation
*   **LTX Nodes**: Deployed in a private VPC. No public IPs on VMs. Access is only via the Load Balancer.
*   **Database**: Cloud SQL should have private IP only, accessible only by the Worker/API VPC.

### Firewalls
*   Restrict SSH access to IAP (Identity-Aware Proxy) ranges.
*   Load Balancer should only accept traffic on ports 80/443.

### Cloud Armor (WAF)
The LTX deployment includes Cloud Armor policies to protect against:
*   DDoS attacks.
*   SQL Injection / XSS.
*   Geo-blocking (if configured).
*   Rate limiting (default: 100 requests/min per IP).

## 2. Authentication & Authorization

### Service Accounts
*   **Worker SA**: Should have minimal privileges:
    *   `roles/storage.objectAdmin` (Specific bucket only)
    *   `roles/pubsub.subscriber`
    *   `roles/pubsub.publisher`
    *   `roles/aiplatform.user`
*   **LTX Node SA**:
    *   `roles/storage.objectViewer` (Model cache)
    *   `roles/storage.objectCreator` (Video output)
    *   `roles/secretmanager.secretAccessor` (API Keys)

### API Keys
*   **LTX Service**: Protected by a hardcoded API Key stored in Secret Manager (`ltx-video-api-keys`).
*   **Rotation**: Rotate keys every 90 days via Secret Manager and restart the MIG.

## 3. Data Protection

### Encryption
*   **At Rest**: All data in GCS and Cloud SQL is encrypted by default (Google-managed keys).
*   **In Transit**: All traffic uses HTTPS/TLS.

### Asset Privacy
*   **Public Access**: By default, generated assets are private. Signed URLs or public buckets (if configured) are used for frontend display.
*   **Buckets**: Ensure `publicAccessPrevention` is enforced unless explicitly required.

## 4. Safety & Content Moderation

### LLM Safety
*   **Input Sanitization**: The `FirstAD` agent sanitizes prompts to remove harmful content before generation.
*   **Vertex AI Filters**: We rely on Google's built-in safety filters for Gemini models.

### User Inputs
*   The API validates all inputs using **Zod** schemas to prevent injection attacks or malformed data processing.
