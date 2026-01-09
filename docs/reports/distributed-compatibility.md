# Distributed Compatibility Report

**Severity**: High
**Status**: Remediation in Progress

## Executive Summary
The system contains legacy state management patterns that prevent safe horizontal scaling.

## Key Issues

1.  **In-Memory State Caching (`storage-manager.ts`)**:
    *   *Issue*: `latestAttempts` map is stored in local memory.
    *   *Risk*: Race conditions where multiple workers overwrite files.
    *   *Remediation*: Move attempt tracking to Postgres (`GraphState`).

2.  **Local File System Conflicts (`scene-generator.ts`)**:
    *   *Issue*: Hardcoded paths like `/tmp/scene_1.mp4`.
    *   *Risk*: Data corruption if multiple jobs run on the same node.
    *   *Remediation*: Use unique temporary directories for every job.

3.  **Local Concurrency Control**:
    *   *Issue*: `activeProjects` Set is local to the Node process.
    *   *Risk*: Double processing if multiple workers receive the same message.
    *   *Remediation*: Use Distributed Locking (Postgres or Redis).

## Remediation Plan
1.  **Phase 1 (Data Safety)**: Externalize attempt tracking to Postgres.
2.  **Phase 2 (File Safety)**: Implement unique temp directories for all agents.
3.  **Phase 3 (Concurrency)**: Implement distributed locking.