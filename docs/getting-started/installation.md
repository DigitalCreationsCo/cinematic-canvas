---
title: Installation
description: Step-by-step guide to installing Cinematic Canvas locally using Docker.
keywords: ["installation", "setup", "docker", "local development", "prerequisites"]
---


# Installation Guide

## Prerequisites

Before setting up Cinematic Canvas, ensure you have the following installed:

*   **Node.js**: v22 or higher recommended.
*   **Docker & Docker Compose**: Required for managing local infrastructure (Pub/Sub Emulator, Postgres).
*   **Google Cloud Project**: You need a GCP project with the following enabled:
    *   Vertex AI API
    *   Google Cloud Storage (Bucket created)
    *   Service Account with appropriate permissions (Storage Admin, Vertex AI User, Pub/Sub Admin)

## Local Development with Docker

The recommended way to run Cinematic Canvas locally is using Docker Compose. This ensures all background services (Postgres, Pub/Sub Emulator) are correctly configured.

### 1. Install Dependencies

Install the project dependencies for the API, Worker, and Client.

```bash
npm install
```

### 2. Start Infrastructure

Start the necessary infrastructure components (Pub/Sub Emulator, Postgres, API Server, Client) in detached mode.

```bash
docker-compose up --build -d
```

> **Note**: The `postgres-db` service is started automatically by docker-compose and is accessible to the worker service.

## Local Development (Without Docker)

For faster iteration and debugging, you can run the services directly using `tsx` outside of Docker, but you still need the dependency containers running.

### 1. Start Infrastructure Only

Start Postgres and the Pub/Sub Emulator.

```bash
docker-compose up -d pubsub-emulator postgres-db
```

### 2. Start Services Independently

You can run each service in a separate terminal:

**Terminal 1: Client (Frontend)**
```bash
npm run dev
```

**Terminal 2: Server (API Layer)**
```bash
npm run start:server
```

**Terminal 3: Worker (Pipeline Execution)**
```bash
npm run start:worker
```

### 3. VS Code Debugging

The project includes VS Code launch configurations for debugging:
*   **Launch Worker**: Debug the pipeline logic.
*   **Launch Server**: Debug the API.
*   **Debug Full-Stack**: Launches Server, Worker, and Client.

## Verifying Installation

To verify that the system is running correctly:

1.  **Check Client**: Open `http://localhost:5173` (or the port shown in your terminal).
2.  **Check API**: `curl http://localhost:8000/health` (assuming health endpoint exists) or check logs.
3.  **Check Logs**:
    ```bash
    docker-compose logs -f
    ```
