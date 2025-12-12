# Cinematic Framework

An AI-powered cinematic video generation framework that transforms creative prompts and audio into professional-quality videos or music videos with continuity, character consistency, and cinematic storytelling.

## Overview

Cinematic Framework leverages Google's Vertex AI (Gemini models) and LangGraph to orchestrate a sophisticated multi-agent workflow that:

- **Analyzes audio tracks** to extract musical structure, timing, and emotional beats
- **Generates detailed storyboards** with scenes, characters, locations, and cinematography
- **Maintains visual continuity** across scenes using reference images for scene-to-scene consistency
- **Produces cinematic videos** with proper shot composition, lighting, and camera movements
- **Stitches scenes** into a final rendered video synchronized with audio
- **Self-improves** its generation process by learning from quality-check feedback, utilizing a unified retry handler and enhanced evaluation guidelines.
- **Tracks learning metrics** to measure efficiency and quality improvements over time, with verbose logging for detailed insights.

## Features

- **Audio-Driven and/or Prompt-Based**: Generate videos from audio files (with automatic scene timing) and/or from creative prompts
- **Multi-Agent Architecture**: Specialized agents for audio analysis, storyboard composition, character/location management, scene generation, and quality control
- **Role-Based Prompt Architecture**: Film production crew roles (Director, Cinematographer, Gaffer, Script Supervisor, etc.) compose prompts for specialized, high-quality output. See [PROMPTS_ARCHITECTURE.md](PROMPTS_ARCHITECTURE.md) for architecture details and [WORKFLOW_INTEGRATION.md](WORKFLOW_INTEGRATION.md) for integration status.
- **Self-Improving Generation**: A `QualityCheckAgent` evaluates generated scenes and provides feedback. This feedback is used to refine a set of "Generation Rules" that guide subsequent scene generations, improving quality and consistency over time.
- **Learning Metrics**: The framework tracks the number of attempts and quality scores for each scene, calculating trend lines to provide real-time feedback on whether the system is "learning" (i.e., requiring fewer attempts to generate high-quality scenes).
- **Visual Continuity**: Maintains character appearance and location consistency using reference images and **pre-generated start/end frames** for each scene, with intelligent skipping of generation if frames already exist in storage.
- **Cinematic Quality**: Professional shot types, camera movements, lighting, and transitions
- **Resume Capability**: Workflow can resume from checkpoints, avoiding regeneration of existing assets
- **Comprehensive Schemas**: Type-safe data structures using Zod for all workflow stages
- **Automatic Retry Logic**: Handles API failures and safety filter violations

## Architecture

The framework uses a **LangGraph state machine** to orchestrate the following workflow:

```mermaid
graph TD
    A[START] --> B{Resume?};
    B -- Has Scenes --> G[process_scene];
    B -- Has Prompt --> E[generate_character_assets];
    B -- No --> C[expand_creative_prompt];
    C --> D{Has Audio?};
    D -- No --> H[generate_storyboard_exclusively_from_prompt];
    D -- Yes --> F[create_scenes_from_audio];
    F --> I[enrich_storyboard_and_scenes];
    H --> E;
    I --> E;
    E --> J[generate_location_assets];
    J --> G;
    G --> K{All Scenes Processed?};
    K -- No --> G;
    K -- Yes --> L[render_video];
    L --> M[finalize];
    M --> N[END];
  ```

### Key Agents

1. **AudioProcessingAgent**: Analyzes audio files using Gemini's multimodal capabilities to extract musical structure, lyrics, tempo, mood, and generates timed scene templates, also initializes `startFrame` and `endFrame` for each segment.
2. **CompositionalAgent**: Expands creative prompts and generates comprehensive storyboards with characters, locations, cinematography, and narrative structure
3. **ContinuityManagerAgent**: Manages character and location reference images, tracks continuity context across scenes, **generates start and end frames for each scene, skipping if they already exist in storage**, and refines generation rules based on feedback
4. **SceneGeneratorAgent**: Generates individual video clips using Google's video generation API with continuity constraints, **now relying on pre-generated start/end frames instead of extracting them from the video**, includes `responseMimeType: 'text/plain'` in `generateContent` calls, and handles safety filter related errors by throwing an `RAIError`.
5. **QualityCheckAgent**: Evaluates generated scenes for quality and consistency, providing feedback for prompt corrections and rule generation, including prompt sanitization, and now uses enhanced evaluation guidelines and verbose logging.
6. **PromptCorrectionInstruction**: The `buildCorrectionPrompt` now includes `SAFETY GUIDELINES` by calling `buildSafetyGuidelinesPrompt()` and follows additive correction principles with explicit semantics.
7. **QualityRetryHandler**: A new unified retry handler (`pipeline/utils/quality-retry-handler.ts`) that centralizes retry logic, eliminates code duplication, and ensures consistent best-attempt tracking.
8. **RetryLogger**: A new comprehensive logging utility (`pipeline/utils/retry-logger.ts`) that provides detailed attempt-by-attempt logging, evaluation breakdowns, and quality trend analysis.
9. **Evaluation Guidelines**: New evaluation guidelines (`pipeline/prompts/evaluation-guidelines.ts`) with clear severity definitions, semantic understanding checklists, and precise rating thresholds.
10. **Generation Rules Presets**: New domain-specific and proactive generation rules (`pipeline/prompts/generation-rules-presets.ts`) that can be automatically added based on scene content.

**Recommended Updates (Not Yet Applied in Agents)**:
- `pipeline/agents/frame-composition-agent.ts`: Integrate `QualityRetryHandler` for `generateImageWithQualityCheck`.
- `pipeline/agents/scene-generator.ts`: Integrate `QualityRetryHandler` for `generateWithQualityRetry`.
- `pipeline/graph.ts`: Add proactive domain rules at workflow start using `detectRelevantDomainRules` and `getProactiveRules`.

## Prerequisites

- **Node.js** (v18 or higher)
- **TypeScript** (v5.9+)
- **FFmpeg** installed (for video processing)
- **Google Cloud Project** with:
  - Vertex AI API enabled
  - Google Cloud Storage bucket created
  - Service account with appropriate permissions (see Security section below)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd cinematicframework

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file in the project root (use `.env.example` as template):

```bash
# Google Cloud Platform Configuration
GCP_PROJECT_ID="your-gcp-project-id"
GCP_BUCKET_NAME="your-gcp-bucket-name"
GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
```

### Required GCP Permissions

Your service account needs the following IAM roles:
- `storage.objectAdmin` or `storage.objectCreator` + `storage.objectViewer` on the bucket
- `aiplatform.user` for Vertex AI API access

## Usage

### Basic Usage

```bash
# Generate video from audio file and prompt
npm start -- --audio audio/song.mp3 --prompt "A cyberpunk thriller set in Neo Tokyo"

# Generate video from prompt only (no audio)
npm start -- --prompt "An epic space battle between rival factions"

# Resume a previous video generation
npm start -- --id video_1234567890 --audio audio/song.mp3 --prompt "..."
```

### Command Line Arguments

| Argument | Aliases | Type | Description |
|----------|---------|------|-------------|
| `--audio` | `--file`, `--audioPath` | string | Path to local audio file (MP3, WAV) |
| `--prompt` | `--creativePrompt` | string | Creative prompt describing the video concept |
| `--id` | `--resume`, `--videoId` | string | Video ID to resume from or specify |

### Examples

**Example 1: Music video with audio**
```bash
npm start -- \
  --audio audio/metal-track.mp3 \
  --prompt "A dark fantasy tale of a wandering knight battling demons in a cursed realm"
```

**Example 2: Short film without audio**
```bash
npm start -- \
  --prompt "A noir detective story set in 1940s Los Angeles, featuring a hard-boiled detective investigating a murder"
```

**Example 3: Resume interrupted workflow**
```bash
npm start -- \
  --id video_1701234567890 \
  --audio audio/song.mp3 \
  --prompt "Original prompt..."
```

## Project Structure

```
cinematicframework/
├── pipeline/
│   ├── agents/                       # Agent implementations
│   │   ├── audio-processing-agent.ts # Audio analysis agent
│   │   ├── compositional-agent.ts    # Storyboard generation agent
│   │   ├── continuity-manager.ts     # Continuity tracking agent
│   │   ├── frame-composition-agent.ts # Frame composition agent
│   │   └── scene-generator.ts        # Video generation agent
│   ├── llm/                          # LLM provider abstractions
│   │   ├── google/                   # Google-specific implementations
│   │   │   ├── google-provider.ts
│   │   │   └── llm-params.ts
│   │   ├── index.ts
│   │   └── types.ts
│   ├── lib/                          # Utility libraries
│   │   └── llm-retry.ts             # Retry logic with exponential backoff
│   ├── prompts/                      # System prompts for agents
│   │   ├── audio-processing-instruction.ts
│   │   ├── character-image-instruction.ts
│   │   ├── continuity-instructions.ts
│   │   ├── default-creative-prompt.ts
│   │   ├── location-image-instruction.ts
│   │   ├── prompt-expansion-instruction.ts
│   │   └── storyboard-composition-instruction.ts
│   ├── index.ts                      # Main workflow orchestration
│   ├── storage-manager.ts            # GCS storage utilities
│   ├── types.ts                      # Type definitions and Zod schemas
│   └── utils.ts                      # Helper functions
├── audio/                            # Audio files directory
├── dist/                             # Compiled JavaScript output
├── coverage/                         # Test coverage reports
├── .env                              # Environment configuration (gitignored)
├── .env.example                      # Environment template
├── package.json                      # Dependencies and scripts
├── tsconfig.json                     # TypeScript configuration
└── vitest.config.ts                  # Test configuration
```

## Output Structure

All outputs are stored in Google Cloud Storage with the following structure:

```
gs://[bucket-name]/[video-id]/
├── audio/                            # Uploaded audio file
│   └── [audio-filename].mp3
├── scenes/
│   ├── storyboard.json              # Complete storyboard with metadata
│   ├── scene_001.mp4                # Individual scene videos
│   ├── scene_002.mp4
│   └── ...
├── images/
│   ├── characters/                   # Character reference images
│   │   ├── char_1_reference.png
│   │   └── ...
│   ├── locations/                    # Location reference images
│   │   ├── loc_1_reference.png
│   │   └── ...
│   └── frames/                       # Pre-generated start/end frames for continuity
│       ├── scene_001_start_frame.png
│       ├── scene_001_end_frame.png
│       ├── scene_002_start_frame.png
│       ├── scene_002_end_frame.png
│       └── ...
└── final/
    ├── movie.mp4                     # Final stitched video
    └── final_output.json             # Complete workflow output
```

## Dependencies

### Core Dependencies

- **@google-cloud/storage** (^7.17.3): Google Cloud Storage client
- **@google/genai** (^1.30.0): Google Generative AI SDK (Vertex AI)
- **@langchain/langgraph** (^1.0.2): State graph workflow orchestration
- **fluent-ffmpeg** (^2.1.3): Video processing and stitching
- **zod** (^4.1.13): Runtime type validation and schema generation
- **dotenv** (^17.2.3): Environment variable management
- **yargs** (^18.0.0): Command-line argument parsing

### Development Dependencies

- **typescript** (^5.9.3): TypeScript compiler
- **vitest** (^4.0.14): Testing framework
- **@vitest/coverage-v8** (^4.0.14): Code coverage
- **ts-node** (^10.9.2): TypeScript execution

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run coverage
```

## Security: Google Cloud Credentials

### Problem: Service Account Key Exposure

The project requires Google Cloud credentials to access Vertex AI and Cloud Storage APIs. **Never commit service account keys to version control** as they provide full access to your GCP resources.

### Recommended Solutions

#### Option 1: Application Default Credentials (Recommended for Development)

For local development, use ADC (Application Default Credentials):

```bash
# Install Google Cloud SDK
# https://cloud.google.com/sdk/docs/install

# Authenticate with your Google account
gcloud auth application-default login

# Set your project
gcloud config set project YOUR_PROJECT_ID
```

Then update your `.env`:
```bash
GCP_PROJECT_ID="your-gcp-project-id"
GCP_BUCKET_NAME="your-bucket-name"
# Remove or comment out GOOGLE_APPLICATION_CREDENTIALS
```

**Pros**: No key files to manage, uses your personal credentials
**Cons**: Each developer needs to authenticate individually

#### Option 2: Secret Manager (Recommended for Teams)

Store the service account key in Google Secret Manager:

```bash
# Create secret with service account key
gcloud secrets create cinematicframework-sa-key \
  --data-file=./service-account-key.json

# Grant access to specific users
gcloud secrets add-iam-policy-binding cinematicframework-sa-key \
  --member="user:teammate@example.com" \
  --role="roles/secretmanager.secretAccessor"
```

Modify code to fetch credentials from Secret Manager at runtime (see [documentation](https://cloud.google.com/secret-manager/docs/creating-and-accessing-secrets#secretmanager-access-secret-version-nodejs)).

#### Option 3: Workload Identity (Recommended for Production)

For production deployments on GKE, Cloud Run, or Compute Engine, use Workload Identity to automatically provide credentials without key files.

#### Option 4: Environment-Specific Service Accounts

Create separate service accounts for different environments:
- `cinematicframework-dev@project.iam.gserviceaccount.com` (limited permissions)
- `cinematicframework-prod@project.iam.gserviceaccount.com` (production permissions)

Share keys via secure channels (1Password, LastPass, Vault) and **never commit them**.

### Best Practices

1. **Add service account keys to `.gitignore`** (already configured):
   ```
   *.json
   !package*.json
   !tsconfig.json
   ```

2. **Use principle of least privilege**: Grant only necessary IAM roles
3. **Rotate keys regularly**: Set expiration policies on service accounts
4. **Audit access**: Monitor service account usage in Cloud Logging
5. **Use environment variables**: Never hardcode credentials in source code

## Troubleshooting

### Common Issues

**Issue: "Video generation timed out"**
- Solution: Increase `TIMEOUT_MS` in [scene-generator.ts](pipeline/agents/scene-generator.ts:162)

**Issue: "Safety filter triggered"**
- Solution: The framework automatically sanitizes prompts. Review safety error codes in [scene-generator.ts](pipeline/agents/scene-generator.ts:70-84)

**Issue: "Scene video already exists, skipping"**
- Solution: This is expected behavior for resume functionality. Delete the video in GCS to regenerate

**Issue: "Invalid scene duration"**
- Solution: Ensure all durations are 4, 6, or 8 seconds (API constraint)

**Issue: FFmpeg errors**
- Solution: Verify FFmpeg is installed (`ffmpeg -version`) and accessible in PATH

## Performance Considerations

- **Scene generation**: ~2-5 minutes per scene (API dependent)
- **Rate limiting**: 30-second cooldown between scenes to avoid quota issues
- **Audio processing**: ~30-60 seconds for full track analysis
- **Storyboard generation**: ~1-2 minutes depending on complexity
- **Total workflow time**: For a 3-minute song (~15 scenes), expect 60-90 minutes

## Limitations

- Video durations must be exactly 4, 6, or 8 seconds (Vertex AI constraint)
- Maximum 15-minute timeout per scene generation
- Requires significant GCP quota for video generation API
- Person generation may be restricted based on project allowlist

## Contributing

Contributions are welcome! Please ensure:
- All tests pass (`npm test`)
- Code coverage remains above 90% (`npm run coverage`)
- TypeScript strict mode compliance
- Proper error handling and logging

## License

ISC

## Support

For issues and questions:
- Check [Troubleshooting](#troubleshooting) section
- Review error logs in console output
- Inspect GCS bucket for intermediate outputs
- Check Google Cloud Console for quota limits

## Acknowledgments

Built with:
- Google Vertex AI (Gemini models)
- LangGraph for workflow orchestration
- FFmpeg for video processing