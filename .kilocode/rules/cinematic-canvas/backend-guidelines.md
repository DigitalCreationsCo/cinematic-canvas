---
trigger: glob
globs: src/server, src/shared, src/pipeline, src/worker
---

# Backend Development Guidelines

## 1. API Route Definition

api route paths are defined in src/shared and should be used in the backend code. Hard-coded api route paths should not be used.

When creating new api routes, implement the route in the api routes defined in src/shared and the api object as a path accessor.

## 2. Batch Processing

Cinematic Canvas is a batch-first system. Most backend services (ProjectRepository, AssetVersionManager, StorageManager) implement batch-first function parameters. Batch-first means that the function accepts lists of items to process rather than single items. This allows for more efficient processing of data and reduces the number of database queries.

When creating new backend services, try to implement batch-first functions where possible.

When creating new service methods, check for similar existing functionality to avoid duplicating functionality.