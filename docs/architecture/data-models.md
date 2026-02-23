---
title: Data Models
description: Schema definitions, Zod validation composition, and type safety layers.
keywords: ["data models", "schema", "zod", "types", "database entities"]
---


# Data Models & Schema Composition

## Overview

The system uses **Zod** for schema validation and type inference. A key design principle is **Schema Composition** to avoid code duplication (DRY) and ensure consistency across the [Role-Based Architecture](./prompt-engineering.md).

## Schema Composition Strategy

Instead of defining a single massive `Scene` object, we compose it from specific role schemas. This modularity allows agents to validate only the data they own.

### The Composite `SceneSchema`

```typescript
SceneSchema = z.intersection(
  AudioAnalysisAttributesSchema,              // Director: Timing
  z.intersection(
    z.object({ id: number }),      // Core ID
    z.intersection(
      DirectorSceneSchema,         // Director: Narrative
      z.intersection(
        CinematographySchema,      // Cinematographer: Visuals
        z.intersection(
          LightingSchema,          // Gaffer: Lighting
          z.intersection(
            ScriptSupervisorSceneSchema,  // Continuity
            SceneGenerationLegacyAssetsSchema   // Artifacts (Video URLs)
          )
        )
      )
    )
  )
);
```

### Role-Specific Schemas

*   **`DirectorSceneSchema`**: Narrative description, mood, audio sync timing.
*   **`CinematographySchema`**: Shot type, camera angle, movement, focal point.
*   **`LightingSchema`**: Light quality, color temperature, source motivation.
*   **`ScriptSupervisorSceneSchema`**: Continuity checklists, character tracking.
*   **`PhysicalTraitsSchema`** (Costume): Character hair, clothing, build.

## Core Data Models

### Shared Enums
To prevent "magic strings", we use centralized Zod enums:
*   **`DepartmentEnum`**: `['director', 'cinematographer', 'gaffer', ...]`
*   **`SeverityEnum`**: `['critical', 'major', 'minor']`
*   **`RatingEnum`**: `['PASS', 'FAIL', ...]`

### Video Assets (`ObjectData`)
Assets are no longer simple strings. They are structured objects to handle permissions:
```typescript
{
  storageUri: "gs://bucket/path/video.mp4", // For Internal/Worker use
  publicUri: "https://storage.googleapis.com/..." // For Frontend/Client use
}
```

## Optimization & Type Safety

### Tri-Layer Type System
To handle the complexity of database relationships vs. application logic, we use a three-layer approach:

1.  **Database Entities**: Match the SQL schema exactly (flat, foreign keys).
    *   `SceneEntity`: Has `locationId`, but *no* `characterIds` (stored in junction table).
2.  **Query Results**: Minimal data transfer.
    *   `SceneQueryResult`: Includes `characters: Array<{id: string}>` (just IDs).
3.  **Domain Models**: Hydrated, usable objects.
    *   `Scene`: Has `characterIds: string[]`.

### Why this matters?
*   **Performance**: We don't fetch full character objects when querying a scene, only their IDs.
*   **Safety**: Zod validates all DB outputs before they reach the app.
*   **Clarity**: Developers know exactly what shape of data they are working with.
