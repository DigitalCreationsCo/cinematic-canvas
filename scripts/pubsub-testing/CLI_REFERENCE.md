# PubSub Testing CLI - Quick Reference

## Discovery Commands
```bash
tsx cli.ts list-scenarios              # List all test scenarios
tsx cli.ts list-jobs                   # List all job types
tsx cli.ts preview <scenario>          # Preview scenario data
tsx cli.ts status                      # Show configuration
```

## Full State Events
```bash
tsx cli.ts full-state                  # Rich scenario, auto ID
tsx cli.ts full-state proj-123         # Specific project ID
tsx cli.ts full-state --scenario=audio # Audio scenario
tsx cli.ts full-state --dry-run        # Preview only
```

## Job Events
```bash
# Lifecycle Events
tsx cli.ts job-event JOB_DISPATCHED <jobId> <projectId>
tsx cli.ts job-event JOB_STARTED <jobId>
tsx cli.ts job-event JOB_COMPLETED <jobId> <projectId>
tsx cli.ts job-event JOB_FAILED <jobId> <projectId> --error="msg"
tsx cli.ts job-event JOB_CANCELLED <jobId>

# Dispatch Jobs
tsx cli.ts dispatch-job <type> [projectId]
tsx cli.ts job-chain [projectId] [--delay=500]
```

## Workflows
```bash
tsx cli.ts workflow                    # Standard workflow
tsx cli.ts workflow --audio            # Audio workflow
tsx cli.ts workflow --scenes=5         # Custom scene count
tsx cli.ts workflow proj-123 --audio --scenes=7
```

## Batch Operations
```bash
tsx cli.ts batch --file=ops.json
tsx cli.ts batch --file=ops.json --delay=500
tsx cli.ts batch --file=ops.json --no-continue-on-error
```

## Global Flags
```bash
-v, --verbose        # Detailed output
-q, --quiet          # Minimal output
--dry-run            # Preview without publishing
-h, --help           # Show help
-V, --version        # Show version
```

## Job Types
```
EXPAND_CREATIVE_PROMPT       GENERATE_CHARACTER_ASSETS
GENERATE_STORYBOARD          GENERATE_LOCATION_ASSETS
PROCESS_AUDIO_TO_SCENES      GENERATE_SCENE_FRAMES
ENHANCE_STORYBOARD           GENERATE_SCENE_VIDEO
SEMANTIC_ANALYSIS            RENDER_VIDEO
```

## Scenarios
```
minimal    # Empty project (0 scenes, 0 chars, 0 locs)
rich       # Full project (5 scenes, 3 chars, 2 locs)
audio      # Audio project (3 scenes, 2 chars, 1 loc)
```

## Common Workflows

### Complete Pipeline Test
```bash
tsx cli.ts preview rich
tsx cli.ts full-state proj-001 --scenario=rich
tsx cli.ts job-chain proj-001 --delay=1000
```

### Audio Workflow Test
```bash
tsx cli.ts workflow proj-002 --audio --scenes=5
```

### Individual Job Test
```bash
tsx cli.ts full-state proj-003
tsx cli.ts dispatch-job EXPAND_CREATIVE_PROMPT proj-003
tsx cli.ts job-event JOB_COMPLETED <job-id> proj-003
```

### Batch Test
```bash
# Create batch.json with operations
tsx cli.ts batch --file=batch.json --delay=500
```

## Environment Setup
```bash
export GCP_PROJECT_ID=your-project-id
export PUBSUB_EMULATOR_HOST=localhost:8085  # Optional
```

## Package.json Scripts
```json
{
  "scripts": {
    "pubsub": "tsx scripts/pubsub-testing/cli.ts",
    "pubsub:list": "npm run pubsub list-scenarios",
    "pubsub:status": "npm run pubsub status"
  }
}
```

Then:
```bash
npm run pubsub -- full-state --scenario=rich
npm run pubsub:list
```

## Tips
- Always use `preview` or `--dry-run` first
- Use `-v` for debugging
- Use consistent project IDs for related tests
- Check `status` to verify configuration