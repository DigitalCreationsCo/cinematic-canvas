# Cinematic Framework

An AI-powered cinematic video generation framework that transforms creative prompts and audio into professional-quality videos or music videos with continuity, character consistency, and cinematic storytelling.

## Overview

Cinematic Framework leverages Google's Vertex AI (Gemini models) and LangGraph to orchestrate a sophisticated multi-agent workflow that:

- **Analyzes audio tracks** to extract musical structure, timing, and emotional beats
- **Generates detailed storyboards** with scenes, characters, locations, and cinematography
- **Maintains visual continuity** across scenes using reference images and persistent state checkpoints
- **Produces cinematic videos** with proper shot composition, lighting, and camera movements
- **Stitches scenes** into a final rendered video synchronized with audio
- **Self-improves** its generation process by learning from quality-check feedback, utilizing enhanced evaluation guidelines.
- **Tracks learning metrics** and persists state using PostgreSQL for robust checkpointing and resumability.

## Features

- **Audio-Driven and/or Prompt-Based**: Generate videos from audio files (with automatic scene timing) and/or from creative prompts
- **Multi-Agent Architecture**: Specialized agents for audio analysis, storyboard composition, character/location management, scene generation, and quality control
- **Role-Based Prompt Architecture**: Film production crew roles (Director, Cinematographer, Gaffer, Script Supervisor, etc.) compose prompts for specialized, high-quality output. See [PROMPTS_ARCHITECTURE.md](docs/PROMPTS_ARCHITECTURE.md) for architecture details and [WORKFLOW_INTEGRATION.md](docs/WORKFLOW_INTEGRATION.md) for integration status.
- **Self-Improving Generation**: A `QualityCheckAgent` evaluates generated scenes and provides feedback. This feedback is used to refine a set of "Generation Rules" that guide subsequent scene generations, improving quality and consistency over time.
- **Learning Metrics**: The framework tracks the number of attempts and quality scores for each scene, calculating trend lines to provide real-time feedback on whether the system is "learning" (i.e., requiring fewer attempts to generate high-quality scenes).
- **Visual Continuity**: Maintains character appearance and location consistency using reference images and **pre-generated start/end frames** for each scene, with intelligent skipping of generation if frames already exist in storage, now governed by persistent checkpoints.
- **Cinematic Quality**: Professional shot types, camera movements, lighting, and transitions
- **Persistent State & Resume Capability**: Workflow state is persisted in PostgreSQL via LangGraph checkpointers, allowing for robust resumption and enabling command-driven operations like STOP/RETRY.
- **Comprehensive Schemas**: Type-safe data structures using Zod for all workflow stages, defined in [shared/schema.ts](shared/schema.ts).
- **Automatic Retry Logic**: Handles API failures and safety filter violations, centrally managed via command handlers in the pipeline worker.

## Architecture

The framework uses a **LangGraph state machine** running in a dedicated `pipeline-wrapper` service. Execution is controlled via commands published to a Pub/Sub topic (`video-commands`). State changes are broadcast via another Pub/Sub topic (`video-events`), which the API server relays to connected clients via SSE.

```mermaid
graph TD
    A[Client/API] -->|Publish Command (START/STOP/RETRY)| B(Pub/Sub: video-commands);
    B --> C[Pipeline Worker: pipeline-wrapper];
    C -->|Check/Save State| D[(PostgreSQL Checkpoint)];
    C -->|Execute Graph| E[LangGraph Workflow];
    C -->|Publish State Update| F(Pub/Sub: video-events);
    F --> G[API Server];
    G -->|SSE Stream| A;
    
    subgraph Workflow Execution
        E
        D
    end
  ```

### Key Components & Agents

1.  **AudioProcessingAgent**: Analyzes audio files to extract musical structure, timing, and mood, setting initial scene parameters.
2.  **CompositionalAgent**: Expands creative prompts and generates comprehensive storyboards.
3.  **ContinuityManagerAgent**: Manages character and location reference images, ensuring visual coherence by checking and generating start/end frames for scenes based on persistent state context.
4.  **SceneGeneratorAgent**: Generates individual video clips, now relying on pre-generated start/end frames from the persistent state for continuity.
5.  **QualityCheckAgent**: Evaluates generated scenes for quality and consistency, feeding back into the prompt/rule refinement loop.
6.  **Prompt CorrectionInstruction**: Guides the process for refining prompts based on quality feedback.
7.  **Generation Rules Presets**: Proactive domain-specific rules that can be automatically added to guide generation quality.
8.  **Pipeline Worker (`pipeline-wrapper/`)**: A dedicated service running the LangGraph instance. It handles command execution (`START_PIPELINE`, `STOP_PIPELINE`, `RETRY_SCENE`) and uses the `PostgresCheckpointer` for reliable state management, removing reliance on in-memory storage for workflow progression. Its compilation now explicitly includes storage logic via `tsconfig.json`.
9.  **API Server (`server/`)**: Now stateless, it acts as a proxy, publishing client requests as Pub/Sub commands and streaming Pub/Sub events back to the client via project-specific SSE connections managed via temporary Pub/Sub subscriptions. It initializes a Google Cloud Storage client upon startup to support project listing and metadata retrieval.

## Prerequisites

- **Node.js** (v18 or higher)
- **Docker** and **Docker Compose** (for local development environment)
- **PostgreSQL Database** (required for persistent state checkpointers; Docker Compose sets this up locally)
- **Google Cloud Project** with:
  - Vertex AI API enabled
  - Google Cloud Storage bucket created
  - Service account with appropriate permissions

## Installation (Local Development with Docker)

The local setup now requires running Docker Compose to manage the background services:

```bash
# 1. Install dependencies for API/Worker/Client
npm install

# 2. Start necessary infrastructure components (Pub/Sub Emulator, Postgres, API Server, Client)
docker-compose up --build -d

# Note: The pipeline-wrapper service builds and runs separately via docker-compose.
```

## Configuration

### Environment Variables
Update `.env` (or environment variables in deployment). **The API Server now explicitly loads environment variables using `dotenv` upon startup.** Note that `GCP_PROJECT_ID` and `GCP_BUCKET_NAME` are now required for the API server to initialize Google Cloud Storage client connectivity.

```bash
# Google Cloud Platform Configuration
GCP_PROJECT_ID="your-gcp-project-id"
GCP_BUCKET_NAME="your-gcp-bucket-name"
# GOOGLE_APPLICATION_CREDENTIALS is often omitted when using ADC or Workload Identity
# POSTGRES_URL must point to the database accessible by the pipeline worker (e.g., postgres://postgres:example@postgres-db:5432/cinematiccanvas)
POSTGRES_URL="postgres://postgres:example@postgres-db:5432/cinematiccanvas"
```

### Required GCP Permissions
Your service account needs the following IAM roles:
- `storage.objectAdmin` or `storage.objectCreator` + `storage.objectViewer` on the bucket
- `aiplatform.user` for Vertex AI API access

## Usage (API Interaction)

Pipeline execution is initiated via API calls that publish commands to Pub/Sub, allowing the decoupled worker service to pick them up. The API server also provides endpoints for querying current state and available projects, leveraging direct GCS access for the latter.

### Starting a Pipeline
Use POST to `/api/video/start`. This publishes a `START_PIPELINE` command.

```bash
curl -X POST http://localhost:8000/api/video/start \
-H "Content-Type: application/json" \
-d '{
  "projectId": "new-video-id-12345",
  "audioUrl": "gs://my-bucket/audio/song.mp3",
  "creativePrompt": "A 1980s VHS-style music video..."
}'
```

### Stopping a Pipeline
Use POST to `/api/video/stop`. This publishes a `STOP_PIPELINE` command, causing the worker to save its current state and terminate processing for that run ID.

```bash
curl -X POST http://localhost:8000/api/video/stop \
-H "Content-Type: application/json" \
-d '{
  "projectId": "new-video-id-12345"
}'
```

### Retrieving Current State
Use GET to `/api/state`. This retrieves the current snapshot of storyboard elements, metrics, and progress from storage, decoupled from the SSE stream.

### Listing Available Projects
Use GET to `/api/projects`. This queries the configured GCS bucket directly to list existing project directories (prefixes). **The listing now excludes any project directory named 'audio' to prevent accessing raw audio assets.**

### Viewing Live State Updates (SSE)
Client applications connect to `/api/events/:projectId` to receive real-time state updates via SSE, which relies on the worker publishing to the `video-events` topic.

## Project Structure

```
cinematic-canvas/
├── .keeper/                          # Agent task tracking
├── audio/                            # Local audio files for testing
├── client/                           # Frontend application (React/Vite)
├── docs/                             # Documentation files
├── pipeline-wrapper/                 # Dedicated service for running LangGraph/Checkpointer
│   ├── Dockerfile
│   ├── checkpointer-manager.ts       # Abstraction for Postgres checkpointer
│   └── index.ts                      # Main worker logic subscribing to Pub/Sub commands
├── pipeline/                         # Core workflow agents and logic
│   ├── agents/                       # Agent implementations
│   ├── llm/                          # LLM provider abstractions
│   ├── lib/                          # Utility libraries
│   ├── prompts/                      # System prompts for agents
│   ├── index.ts                      # Core graph definition
│   └── types.ts
├── server/                           # Stateless API server
│   ├── index.ts                      # Server entry point and SSE implementation
│   └── routes.ts                     # API routing and Pub/Sub command publishing
├── shared/                           # Shared types/schemas used across client, server, and worker
│   ├── pipeline-types.ts             # GraphState and domain types
│   ├── pubsub-types.ts               # Command/Event structures (e.g., START_PIPELINE)
│   └── schema.ts
├── .env.example
├── package.json                      # Dependencies and scripts
├── docker-compose.yml                # Local development orchestration
├── Dockerfile.api                    # Dockerfile for API/Server
└── ...
```

## Dependencies

### Core Dependencies (Updated)
- **@google-cloud/pubsub** (^5.2.0): For command/event communication between services.
- **@langchain/langgraph-checkpoint-postgres** (^1.0.0): For persistent state management.
- **pg** (^8.12.0): PostgreSQL client library used by the checkpointer.
- **uuid** (^13.0.0): Used by the API server for unique SSE subscription IDs.

### Development Dependencies
(No major changes observed in dev dependencies relevant to this file, retaining existing list below for completeness)

- **typescript** (^5.9.3): TypeScript compiler
- **vitest** (^4.0.14): Testing framework
- **@vitest/coverage-v8** (^4.0.14): Code coverage
- **ts-node** (^10.9.2): TypeScript execution

## Configuration
### Environment Variables (Docker Compose Context)
When running locally via `docker-compose.yml`, the following variables are implicitly set or need external definition for services connecting to external GCP resources (if not using the emulator):
- `PUBSUB_EMULATOR_HOST`: Points to the local Pub/Sub emulator container.
- `POSTGRES_URL`: Connection string for the service database.
- `GCP_PROJECT_ID`, `GCP_BUCKET_NAME`: GCP resource identifiers.

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run coverage
```

## Security: Google Cloud Credentials & Data Access

**State Persistence**: All workflow progress, scenes, characters, and metrics are now persisted in a PostgreSQL database via LangGraph checkpoints (`thread_id` corresponds to `projectId`).

(Rest of Security section regarding GCP keys remains largely unchanged, referencing correct environment variables.)

## Troubleshooting

### Common Issues (Updated)
- **Issue: "Failed to connect to database"**
  - Solution: Ensure `postgres-db` service is running and `POSTGRES_URL` in `.env` (or passed to pipeline-wrapper) is correct.
- **Issue: "Pipeline did not resume / Ran from beginning"**
  - Solution: Verify that the `projectId` used matches the `thread_id` saved in the database, and the `pipeline-wrapper` service can access PostgreSQL.
- **Issue: "Video generation timed out"**
  - Solution: Increase timeout settings configured within the pipeline agents or pipeline worker environment.
- **Issue: "Safety filter triggered"**
  - Solution: The framework automatically sanitizes prompts. Review safety error codes in pipeline agents.
- **Issue: "FFmpeg errors"**
  - Solution: Verify FFmpeg is installed and accessible in the `pipeline-wrapper` container's PATH.

## Performance Considerations
- **Scene generation**: ~2-5 minutes per scene (API dependent)
- **Total workflow time**: Highly dependent on retry counts, as failures are now managed via command/checkpointing, not just internal retries. A stalled pipeline can be explicitly stopped via API command.

## Limitations
- Video durations must be exactly 4, 6, or 8 seconds (Vertex AI constraint).
- Maximum 15-minute timeout per scene generation.
- Requires significant GCP quota for video generation API.

## Contributing

Contributions are welcome! Please ensure:
- All tests pass (`npm test`)
- Code coverage remains above 90% (`npm run coverage`)
- TypeScript strict mode compliance
- New services (e.g., `pipeline-wrapper`) are properly containerized and configured in `docker-compose.yml`.

## License

ISC

## Support

For issues and questions:
- Review Docker Compose logs (`docker-compose logs`).
- Check PostgreSQL database for state inconsistencies.
- Review Pub/Sub topic messages if commands are not reaching the worker.