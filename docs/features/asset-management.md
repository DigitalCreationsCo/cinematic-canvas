---
title: Asset Management
description: Versioning system, storage architecture, and asset optimization strategies.
keywords: ["assets", "versioning", "storage", "optimization", "caching"]
---


# Asset Management & Versioning

## Overview

Cinematic Canvas employs a high-performance, type-safe asset management system. It distinguishes between **Creative Versions** (user iterations) and **System Retries** (robustness), ensuring a clean user experience while maintaining data integrity.

## Asset Versioning Architecture

### Creative Iteration (User-Facing)
An **Asset Version** represents a distinct creative attempt requested by the user.

*   **Immutable**: Once finalized, a version is locked.
*   **Sequential**: Versions increment linearly (v1, v2, v3).
*   **User Visible**: Exposed in the UI for history browsing and rollback.
*   **"Best" Pointer**: A pointer tracks the currently selected/approved version for the final render.

### System Retries (Robustness)
A **System Retry** occurs when the backend encounters a technical error (e.g., GPU crash) or a quality check failure.

*   **Invisible**: These do not increment the public Asset Version.
*   **Tracked**: Internal `retry_count` is logged for debugging.
*   **Limit**: Defaults to 3 attempts before marking the Version as `FAILED`.

## Optimized Asset System

The underlying implementation (`AssetVersionManager`) is optimized for performance and scale.

### Key Optimizations
1.  **N+1 Query Elimination**: Batch operations fetch assets for all scenes in a single query (90% reduction in DB load).
2.  **Client-Side Caching**: Uses `WeakMap` and TTL caching to prevent redundant API calls during navigation.
3.  **Optimistic Updates**: The UI updates immediately on user action (e.g., changing a version), syncing with the backend in the background.

## Storage Structure

Assets are stored in Google Cloud Storage with a structured hierarchy:

```text
gs://<bucket>/
  ├── <projectId>/
  │   ├── scenes/
  │   │   ├── scene_01/
  │   │   │   ├── versions/
  │   │   │   │   ├── v1_scene.mp4
  │   │   │   │   ├── v2_scene.mp4
  │   │   │   │   └── ...
  │   │   │   ├── references/
  │   │   │   └── artifacts/
  │   ├── characters/
  │   └── render/
  │       └── final_movie.mp4
```

## Reference Images

Reference images are critical for visual continuity. The system manages two types:

1.  **Application References**: User-uploaded or system-generated character sheets.
2.  **GenAI References**: Specialized formats for specific models (e.g., Gemini, Imagen).

The system uses helper functions (`src/shared/lm/utils.ts`) to transform these references into the correct format for each generative model, ensuring seamless fallbacks between providers.
