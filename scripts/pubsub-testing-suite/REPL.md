# PubSub Testing Module

REPL-friendly testing utilities for publishing messages to Google Cloud PubSub topics in the cinematic-canvas system.

## Quick Start (REPL)

```bash
# Start the REPL
npx tsx scripts/pubsub-testing/repl.ts

# Then interactively test:
pubsub-test> await pubsubTesting.givenFullState({ scenario: "rich" })
pubsub-test> await pubsubTesting.givenJobDispatch("EXPAND_CREATIVE_PROMPT", "proj-123")
pubsub-test> await pubsubTesting.givenJobChain("proj-789", 500)
pubsub-test> await pubsubTesting.givenWorkflow({ audio: true, sceneCount: 5 })
pubsub-test> await pubsubTesting.givenJobCompleted("job-123", "proj-456")
```

## Programmatic Usage

```typescript
import pubsubTesting from "./pubsub-testing/index.js";

// Publish FULL_STATE with rich storyboard data
await pubsubTesting.givenFullState({ scenario: "rich", projectId: "my-project" });

// Dispatch a specific job type
await pubsubTesting.givenJobDispatch("GENERATE_STORYBOARD", "proj-123");

// Dispatch a chain of all workflow jobs
await pubsubTesting.givenJobChain("proj-123", 500);

// Complete workflow with audio
await pubsubTesting.givenWorkflow({ audio: true, sceneCount: 5 });

// Job lifecycle events
await pubsubTesting.givenJobDispatched("job-123", "proj-123");
await pubsubTesting.givenJobStarted("job-123");
await pubsubTesting.givenJobCompleted("job-123", "proj-123");
await pubsubTesting.givenJobFailed("job-123", "proj-123", "API timeout");

// Cleanup
await pubsubTesting.close();
```

## API Reference

### `givenFullState(options?)`

Publish a FULL_STATE event with a test project.

**Options:**
- `scenario`: `"minimal"` | `"rich"` | `"audio"` (default: `"rich"`)
- `projectId`: Optional project ID (generates UUID if missing)
- `dryRun`: Log without publishing

### `givenJobDispatch(type, projectId?)`

Dispatch a job of the specified type.

**Job Types:**
- `EXPAND_CREATIVE_PROMPT`
- `GENERATE_STORYBOARD`
- `PROCESS_AUDIO_TO_SCENES`
- `ENHANCE_STORYBOARD`
- `SEMANTIC_ANALYSIS`
- `GENERATE_CHARACTER_ASSETS`
- `GENERATE_LOCATION_ASSETS`
- `GENERATE_SCENE_FRAMES`
- `GENERATE_SCENE_VIDEO`
- `RENDER_VIDEO`

### `givenJobChain(projectId?, delayMs?)`

Dispatch a complete chain of workflow jobs.

### `givenWorkflow(options?)`

Create a complete workflow with FULL_STATE + initial job.

### Job Lifecycle Events

```typescript
await pubsubTesting.givenJobDispatched(jobId, projectId);
await pubsubTesting.givenJobStarted(jobId);
await pubsubTesting.givenJobCompleted(jobId, projectId);
await pubsubTesting.givenJobFailed(jobId, projectId, errorMessage);
```

## Environment Configuration

```bash
# Required
GOOGLE_CLOUD_PROJECT=your-gcp-project

# Optional - for PubSub emulator
PUBSUB_EMULATOR_HOST=localhost:8085
```

## Fixtures API

- `TestScenarios.minimalProject()` - Empty project
- `TestScenarios.richStoryboard()` - Project with 5 scenes, 3 characters, 2 locations
- `TestScenarios.audioProject()` - Project with audio analysis segments
- `TestScenarios.workflowChain(projectId)` - Array of all job types in order

---

# Prompt Testing Frameworks

## Recommended Tools

### 1. **Promptfoo** (CI/CD Testing)
```yaml
# promptfooconfig.yaml
prompts: [prompts/storyboard.txt]
providers: [google:gemini-1.5-pro]
tests:
  - vars:
      title: "Urban Drama"
      prompt: "A cinematic story"
    assert:
      - type: contains
        value: "scene"
```

### 2. **LangSmith** (LangChain Debugging)
Automatic tracing, dataset creation, prompt versioning.

### 3. **Zod Validation** (Type Safety)
Runtime validation of LLM outputs:
```typescript
const StoryboardSchema = z.object({
  scenes: z.array(z.object({
    index: z.number(),
    description: z.string(),
  })),
});
```

## Testing Strategies

1. **Golden Datasets**: Curated test cases with known-good outputs
2. **Snapshot Testing**: Capture expected outputs for regression detection
3. **A/B Testing**: Feature flag-driven prompt versions in production
4. **Property Testing**: Generative testing with fast-check
