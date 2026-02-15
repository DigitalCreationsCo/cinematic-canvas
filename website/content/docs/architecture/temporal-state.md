# Temporal State Tracking System

## Overview

The Cinematic Framework includes a comprehensive **Temporal State Tracking System** that monitors and evolves character and location states throughout the story progression. This system ensures that progressive changes—such as injuries, dirt accumulation, weather evolution, and costume damage—are tracked and maintained across scenes for realistic continuity.

**Key Principle**: *Every change persists until the narrative provides a reason for it to revert.*

## Architecture

### Core Components

1.  **State Evolution Engine** (`pipeline/agents/state-evolution.ts`)
    *   Analyzes scene descriptions using heuristic-based parsers.
    *   Updates state objects based on narrative triggers (e.g., "runs through mud" → increases `dirtLevel`).

2.  **Continuity Manager** (`pipeline/agents/continuity-manager.ts`)
    *   Initializes baseline states.
    *   Calls evolution logic after each scene generation.
    *   Persists state to the database.

3.  **Prompt Composer** (`pipeline/prompts/prompt-composer.ts`)
    *   Injects current state into generation prompts via `formatCharacterTemporalState()` and `formatLocationTemporalState()`.

---

## Character State Tracking

The system tracks the following properties for every character:

### 1. Physical Condition
*   **Injuries**: Array of `{ type, location, severity, acquiredInScene }`.
    *   *Example*: "Cut on left arm (accquired Scene 2)" persists to Scene 10.
*   **Exhaustion**: `fresh` → `tired` → `exhausted` → `collapsing`.
*   **Sweat**: `dry` → `drenched`.

### 2. Appearance & Costume
*   **Dirt Level**: `clean` → `muddy` → `covered`.
*   **Costume Condition**:
    *   **Tears**: e.g., "sleeve torn".
    *   **Stains**: e.g., "blood on shirt".
    *   **Wetness**: `dry` → `soaked`.
*   **Hair**: Tracks `messiness` and `wetness` while maintaining baseline style.

### 3. Spatial & Emotional
*   **Position**: Left/Center/Right, FG/BG.
*   **Exit Direction**: Logic ensures if they exit left, they enter right (if continuous).
*   **Emotional Arc**: History of emotional states for context.

---

## Location State Tracking

### 1. Environment Evolution
*   **Time of Day**: `morning` → `noon` → `dusk` → `night`.
*   **Weather**: `clear` → `cloudy` → `rain` → `storm`.
    *   Includes `intensity` and `precipitation` levels.
*   **Ground Condition**: Tracks `wetness`, `debris` (glass, rubble), and `damage` (craters).

### 2. Object Persistence
*   **Broken Objects**: A window shattered in Scene 2 remains shattered in Scene 8.
*   **Atmospheric Effects**: Smoke, fog, or dust clouds can linger and dissipate over time.

---

## Media Synchronization Layer

The system includes a synchronization layer to coordinate playback across multiple video elements (main display + timeline previews) with a master audio track.

### Logic
1.  **External Audio Priority**: If an external `audioUrl` (music/voiceover) exists, it becomes the **Master Clock**.
2.  **Muting**: The visual video's intrinsic audio is muted to prevent clash.
3.  **Sync**: All video elements (`mainVideoRef`, `timelineVideoRefs`) are forcefully synchronized to the Master Audio's `currentTime` on every animation frame.

---

## Usage in Prompts

When generating a scene, the system injects a specialized block into the prompt:

```text
CHARACTER: John Smith
...
CURRENT STATE (MUST MAINTAIN):
  - Injuries: cut on arm (minor)
  - Dirt Level: dirty
  - Costume Tears: sleeve torn

LOCATION CURRENT STATE (MUST MAINTAIN):
  - Weather: Rain
  - Ground: wet
  - Broken Objects: window shattered
```

This forces the video generation model to respect the accumulated history of the story.
