---
title: System Deployment
description: Guide for deploying the core API, workers, and frontend applications.
keywords: ["deployment", "production", "api", "worker", "client"]
---


# General System Deployment

## Overview

This guide covers the deployment of the core Cinematic Canvas components:
1.  **API Server**: Node.js Service (Control Plane).
2.  **Pipeline Worker**: Node.js Service (Execution Plane).
3.  **Client**: React/Vite Frontend.
4.  **Database**: PostgreSQL.

> **Note**: For LTX Video Node deployment, see [LTX Deployment Guide](./ltx-deployment.md).

## Production Architecture

In a production environment, we recommend:
*   **Container Orchestration**: Kubernetes (GKE) or Cloud Run.
*   **Managed Database**: Cloud SQL for PostgreSQL.
*   **Pub/Sub**: Real Google Cloud Pub/Sub (not emulator).
*   **Storage**: Google Cloud Storage.

## Building Containers

The project includes Dockerfiles for the services.

### API Server
```bash
docker build -f Dockerfile.api -t gcr.io/your-project/cinematic-api:latest .
```

### Pipeline Worker
```bash
docker build -f src/pipeline/Dockerfile -t gcr.io/your-project/cinematic-worker:latest .
```

### Client
Build the static assets and serve via CDN or Nginx.
```bash
npm run build
# Output is in dist/
```

## Environment Variables

Ensure these variables are set in your production environment (Secrets/ConfigMaps).

### Common
*   `GOOGLE_CLOUD_PROJECT`: Project ID.
*   `GOOGLE_CLOUD_BUCKET`: GCS Bucket name.
*   `POSTGRES_URL`: Connection string to Cloud SQL.

### API Server
*   `PORT`: Service port (default 8000).
*   `PUBSUB_EMULATOR_HOST`: **Unset** this to use real Pub/Sub.

### Worker
*   `LLM_TEXT_PROVIDER`: `google`
*   `TEXT_MODEL_NAME`: `gemini-2.5-pro`
*   `LTX_API_KEY`: Key for the LTX video service.
*   `LTX_API_URL`: URL of the LTX Load Balancer.

## Deployment Steps (Cloud Run Example)

1.  **Push Images**:
    ```bash
    docker push gcr.io/your-project/cinematic-api:latest
    docker push gcr.io/your-project/cinematic-worker:latest
    ```

2.  **Deploy API**:
    ```bash
    gcloud run deploy cinematic-api \
      --image gcr.io/your-project/cinematic-api:latest \
      --allow-unauthenticated \
      --set-env-vars ...
    ```

3.  **Deploy Worker**:
    ```bash
    gcloud run deploy cinematic-worker \
      --image gcr.io/your-project/cinematic-worker:latest \
      --no-allow-unauthenticated \
      --min-instances 1 \
      --set-env-vars ...
    ```
    *Note: Workers need to be persistent or triggered via Pub/Sub push subscriptions. For pull subscriptions (current architecture), a persistent container (GKE or Compute Engine) is preferred over Cloud Run.*

## Database Migrations

Before starting services, ensure the database schema is up to date.

```bash
npm run db:migrate
```

## Verification

1.  Check API Health: `https://your-api-url/health`
2.  Check Worker Logs: Ensure it successfully subscribes to `video-commands`.
3.  Test Flow: Start a simple project to verify end-to-end connectivity.
