---
title: Configuration
description: Environment variables and service configuration for Cinematic Canvas.
keywords: ["configuration", "env variables", "gcp", "database", "llm settings"]
---


# Configuration

Cinematic Canvas uses environment variables for configuration. These are loaded using `dotenv` in the API Server and Worker.

## Environment Variables (.env)

Create a `.env` file in the root directory based on `.env.example`.

### Google Cloud Platform

```bash
# Google Cloud Platform Configuration
GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
GOOGLE_CLOUD_BUCKET="your-gcp-bucket-name"

# Pub/Sub Configuration
PUBSUB_EMULATOR_PROJECT_ID="test-project" # Required for local Pub/Sub operations

# Set this to 'pubsub-emulator:8085' when running in Docker
# Set to 'localhost:8085' when running locally outside Docker
# Leave blank if using actual GCP Pub/Sub service
PUBSUB_EMULATOR_HOST="" 
```

### Database

```bash
# Connection string for the PostgreSQL database
# Format: postgres://user:password@host:port/database
POSTGRES_URL="postgres://postgres:example@postgres-db:5432/cinematiccanvas"
```

### LLM Configuration

```bash
LLM_TEXT_PROVIDER="google"      # Currently only supports google
TEXT_MODEL_NAME="gemini-2.5-pro"
IMAGE_MODEL_NAME="gemini-2.5-flash-image"
VIDEO_MODEL_NAME="veo-2.0-generate-exp"
```

## Service Configuration

### API Server
The API server listens on port **8000** by default. It acts as a proxy between the client and the Pub/Sub system.

### Pipeline Worker
The worker service subscribes to the `video-commands` Pub/Sub topic. It requires:
*   Access to `POSTGRES_URL` for state persistence.
*   Access to `GOOGLE_CLOUD_BUCKET` for asset storage.
*   Valid GCP credentials (via ADC or key file).

## Automatic Resource Initialization

When the services start, they automatically verify and create:
*   **Pub/Sub Topics**: `video-commands`, `video-events`, `pipeline-cancellations`.
*   **Subscriptions**: Worker subscriptions to commands.
*   **Buckets**: Verifies access to the configured GCS bucket.

The services will exit with a critical error if these resources cannot be accessed or created.
