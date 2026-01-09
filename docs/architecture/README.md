# System Architecture

This section documents the technical design and implementation details of the Cinematic Canvas video generation platform.

## Core System
*   [Core System Architecture](core-system.md): High-level overview of the distributed, event-driven pipeline, job plane, and persistence model.

## Subsystems
*   [Data Models & Schemas](data-models.md): Detailed reference of the Type definitions, Schemas, and the DRY composition strategy used for Roles, Scenes, and State.
*   [Prompt Engineering System](prompt-system.md): The Role-Based Prompt Architecture (Director, Cinematographer, etc.) that powers the generative process.
*   [Temporal Tracking System](temporal-system.md): How the system maintains narrative continuity (injuries, weather, time of day) across sequential scenes.
*   [Media Processing](media-processing.md): Architecture of the video rendering and stitching pipeline (`MediaController`).

## Key Patterns
*   **Event-Driven**: All communication between Control Plane and Execution Plane happens via Pub/Sub.
*   **State-Authoritative**: PostgreSQL is the single source of truth; no hidden in-memory state.
*   **Role-Based Generation**: Prompts are composed from specialized "expert" roles rather than monolithic instructions.
*   **Human-in-the-Loop**: Failures trigger interruptible states where humans can intervene (via `retryLlmCall`).