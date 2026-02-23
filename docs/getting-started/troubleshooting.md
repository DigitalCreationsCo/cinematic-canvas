---
title: Troubleshooting
description: Common issues and solutions for database connections, pipeline execution, and infrastructure.
keywords: ["troubleshooting", "errors", "database connection", "pipeline failure", "ffmpeg"]
---


# Troubleshooting

Common issues and solutions for running Cinematic Canvas.

## Database Connection Issues

### "Failed to connect to database"
*   **Cause**: The `pipeline-worker` service cannot reach the PostgreSQL instance.
*   **Solution**:
    *   If running in Docker: Ensure `POSTGRES_URL` uses the service name (e.g., `postgres-db`).
    *   If running locally: Ensure `POSTGRES_URL` points to `localhost`.
    *   Verify the database container is running: `docker-compose ps`.

## Pipeline Execution Issues

### "Pipeline did not resume / Ran from beginning"
*   **Cause**: Checkpoint mismatch or failure to load state.
*   **Solution**:
    *   Verify `projectId` matches the `thread_id` in the database.
    *   Check worker logs for checkpoint deserialization errors.

### "Video generation timed out"
*   **Cause**: The generation step took longer than the configured timeout (default 15 mins).
*   **Solution**: Increase timeout settings in the pipeline agent configuration.

### "Safety filter triggered"
*   **Cause**: The LLM provider blocked the prompt due to safety settings.
*   **Solution**: Review the prompt for sensitive content. The system automatically sanitizes prompts, but strict filters may still trigger.

## Infrastructure Issues

### "FFmpeg errors"
*   **Cause**: FFmpeg is missing from the environment.
*   **Solution**: Ensure FFmpeg is installed in the `pipeline-worker` container (it is included in the provided Dockerfile).

### Pub/Sub Communication Failures
*   **Cause**: Incorrect `PUBSUB_EMULATOR_HOST` setting.
*   **Solution**:
    *   In Docker: `pubsub-emulator:8085`
    *   Local: `localhost:8085`
    *   Production: Unset the variable to use real GCP Pub/Sub.

## Support

If you encounter issues not listed here:
1.  Check `docker-compose logs` for stack traces.
2.  Inspect the PostgreSQL `checkpoints` table for state integrity.
3.  Verify Pub/Sub messages are flowing using the GCP Console or emulator logs.
