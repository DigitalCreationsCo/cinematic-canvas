# RAG Evolution: Stateful Storytelling Architecture

This document outlines the evolution of the RAG (Retrieval-Augmented Generation) system from a positional sampling algorithm to a **Stateful Chronicle Architecture**. The goal is to dramatically improve storytelling continuity, character tracking, and item management while maintaining a strictly bounded token budget.

---

## 1. Current State: Positional RAG (Existing)

The existing implementation in `@shared/rag.ts` uses a **Reciprocal/Harmonic Sequence Algorithm**:

1. **Problem Solved:** Provides a chronological overview of the narrative arc (sparse at the beginning, dense at the end).
2. **Issues:**
   - **Causal Disconnect:** The AI receives isolated snapshots without understanding how events connect.
   - **Semantic Blindspot:** Mathematical selection misses contextually important events (e.g., a sword found in Block 12 may be forgotten if Block 15 is selected).
   - **Scaling Breakdown:** For stories with hundreds of blocks, the gaps between selected indices become too large.

---

## 2. Proposed Improvements

### 2A. Clustered Block Fetching (Micro-Context)

**Problem:** The algorithm selects single blocks, which can leave narrative gaps.

**Solution:** Instead of fetching exact indices, fetch a small window around each selected index to provide "connective tissue."

```typescript
// Instead of fetching exact indices, fetch a small window around them
const windowedIndices = new Set<number>();
indices.forEach(idx => {
    if (idx > 1) windowedIndices.add(idx - 1);  // Previous block (setup)
    windowedIndices.add(idx);                      // The milestone itself
    if (idx < blockCount) windowedIndices.add(idx + 1);  // Next block (resolution)
});
```

**Benefit:** The AI now sees the setup, action, and resolution of each selected milestone, reducing hallucination about what happened in between.

---

### 2B. Dynamic Divisions (Rejected)

**Reason for Rejection:** The user correctly noted that this would cause context window bloat after a few hundred blocks. The token budget must remain fixed regardless of story length.

**Conclusion:** Keep `RAG_DIVISIONS = 5` as a hard constant. Token efficiency is more important than granular history.

---

### 2C. Notable Events Chronicle (Semantic Memory Without Embeddings)

**Problem:** Vector search / embeddings are complex to set up and expensive. The model should track important events explicitly.

**Solution:** A simple **bulleted list** of "noteworthy" contextual moments, maintained by the model itself. No embeddings or vector database required.

**Format:**
```
Notable Events:
- Block 10: The bankrobber fled through the back exit.
- Block 15: Lily found an old diary written by the sheriff.
- Block 22: The mysterious stranger gave you a rusty key.
```

**Trigger:** The model emits a `newNotableEvent` field when:
- A major plot point occurs (revelations, betrayals, discoveries)
- A significant item is acquired or lost
- A character joins, leaves, or dies
- A location change of narrative importance occurs

**Benefit:** This is highly dense, token-efficient semantic memory. It tells the model *what happened* without needing to retrieve the full block text.

---

### 2D. Running Summary (Compression)

**Problem:** Even with the Chronicle, older events accumulate and bloat the token budget.

**Solution:** A **Running Summary** that compresses the oldest notable events into a 3-4 sentence paragraph.

**Lifecycle:**
1. Store notable events in a chronological list.
2. When the list exceeds a threshold (e.g., 15 events), trigger a compression.
3. Pass the oldest 10 events to an LLM to generate a summary.
4. Replace the 10 events with the summary sentence.
5. Retain the 5 most recent events as full bullets.

**Example:**
```
Before Compression:
- Block 5: You started in a tavern.
- Block 10: You met Elara.
- Block 15: You found a map.
- Block 20: You entered the dungeon.
- Block 25: You fought a goblin.
- ... (10 more events)

After Compression:
[Summary]: You began your journey in a tavern where you met Elara. Together, you found a map to an ancient dungeon and fought your way past a goblin guardian.

- Block 30: You discovered the treasure room.
- Block 35: Elara was captured by a shadow.
- Block 40: You decided to pursue her into the caves.
```

**Benefit:** The system scales indefinitely. The token cost remains constant regardless of story length.

---

### 2E. World State (JSON State Tracking)

**Problem:** Continuity requires knowing *current* facts: Where is the player? What do they have? Who is with them?

**Solution:** A strict JSON object passed into every prompt, tracking the current world state.

**Schema:**
```typescript
interface WorldState {
  location: string;           // "Dragon's Cave Entrance"
  inventory: string[];       // ["Rusty Sword", "Health Potion"]
  characters: {              // Active characters with status
    name: string;
    status: "active" | "wounded" | "captured" | "deceased";
  }[];
  statusEffects: string[];   // e.g., ["Poisoned", "Blessed"]
}
```

**Model Responsibility:** The model emits state deltas in its response:
```json
{
  "title": "A Bitter Choice",
  "content": "You drink the potion...",
  "inventoryToRemove": ["Health Potion"],
  "charactersToUpdate": [{ "name": "Elara", "status": "wounded" }],
  "locationUpdate": "Inside the Dragon's Lair"
}
```

**Benefit:** 
- The model can reference existing items/characters naturally.
- State changes are explicit and trackable.
- Eliminates "forgot the sword" problems entirely.

---

## 3. The Ideal Solution: Stateful Chronicle Architecture

This is the synthesis of all improvements (A, C, D, E). It replaces the math-based positional RAG with a deterministic, LLM-managed state machine.

### Architecture Overview

Every story generation prompt receives **four context components**:

| Component | Purpose | Token Cost |
|-----------|---------|------------|
| **Running Summary** | Compressed history of older events (~3-4 sentences) | ~50 tokens |
| **Notable Events Chronicle** | Bulleted list of recent major plot points (~10-15 items) | ~200 tokens |
| **World State (JSON)** | Current location, inventory, characters, effects | ~100 tokens |
| **Micro-Context** | Last 3 blocks verbatim (immediate connective tissue) | ~300 tokens |

**Total:** ~650 tokens (fixed, regardless of story length)

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    STORY GENERATION                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐    ┌────────────────────────────────┐ │
│  │  World State    │    │  Notable Events (Chronicle)    │ │
│  │  (JSON)         │    │  - Block 10: Bankrobber fled   │ │
│  │  location: Cave │    │  - Block 15: Lily found diary   │ │
│  │  inventory: []   │    │  - Block 22: Got rusty key     │ │
│  │  characters: [] │    └────────────────────────────────┘ │
│  └─────────────────┘                                        │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Micro-Context (Last 3 Blocks)                          ││
│  │  Block 27: You enter the dark cave...                 ││
│  │  Block 28: You hear a growl from ahead...             ││
│  │  Block 29: A dragon emerges from the shadows!        ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Running Summary (Compressed older events)             ││
│  │  "You started in a tavern, met Elara, found a map...  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   LLM Generation   │
                    │   (gemini-2.5)     │
                    └─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    STATE UPDATE                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Response includes:                                          │
│  - title, content, optionA, optionB                         │
│  - newNotableEvent?: string                                 │
│  - inventoryToAdd?: string[]                                │
│  - inventoryToRemove?: string[]                             │
│  - charactersToAdd?: { name, status }[]                     │
│  - charactersToRemove?: string[]                            │
│  - charactersToUpdate?: { name, status }[]                  │
│  - locationUpdate?: string                                  │
│  - statusEffectsToAdd?: string[]                           │
│  - statusEffectsToRemove?: string[]                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   State Manager    │
                    │   (Persistence)    │
                    └─────────────────────┘
```

### Implementation Checklist

1. **Database Schema** (`shared/schema.ts`)
   - Add `story_state` table or JSONB column on `sessions`
   - Fields: `summary`, `chronicle` (array), `world_state` (JSON)

2. **AI Prompt** (`prompts/storyblock-instructions.ts`)
   - Add formatting for all four context components
   - Instruct model on when to emit `newNotableEvent`

3. **AI Response Schema** (`server/ai.ts`)
   - Extend `responseSchema` to include optional state delta fields

4. **State Manager** (`server/state-manager.ts`)
   - New module to apply state deltas to the database
   - Implement compression logic for Running Summary

5. **Replace RAG** (`server/rag.ts` → `server/state-manager.ts`)
   - `buildRAGContext` becomes `buildStoryContext`
   - Fetch from `story_state` instead of running reciprocal sequence math

---

## 4. Comparison: Old vs. New

| Aspect | Old RAG (Reciprocal Sequence) | New RAG (Stateful Chronicle) |
|--------|-------------------------------|------------------------------|
| **Context Type** | Positional sampling | Hybrid (positional + semantic + state) |
| **Token Budget** | Grows with story length | Fixed (~650 tokens) |
| **Item Tracking** | Implicit (may be forgotten) | Explicit JSON state |
| **Character Tracking** | Implicit | Explicit with status |
| **Event Memory** | Isolated blocks | Dense bullet list |
| **Causal Links** | Missing | Provided via micro-context clusters |
| **Setup/Resolution** | Single block | 3-block window |
| **Embeddings** | Not used | Not used (manual tracking) |
| **Scaling** | Breaks at ~300 blocks | Infinite |

---

## 5. Edge Cases & Mitigation

| Scenario | Mitigation |
|----------|------------|
| Model fails to emit state deltas | Default to no-op. State persists from previous block. |
| Model emits invalid state (e.g., remove item not in inventory) | Validate deltas before applying. Log warning, reject invalid. |
| Chronicle grows too long before compression can run | Hard limit: if chronicle.length > 20, force compression before next generation. |
| Session ends | Archive the `story_state` to a separate `story_history` table for analytics. |

---

## 6. Future Considerations (Post-MVP)

- **Semantic Search (Optional):** If the Chronicle grows too large, add keyword-based retrieval instead of vector embeddings.
- **User State Persistence:** Allow users to "bookmark" their inventory/character choices across sessions.
- **Analytics:** Track which notable events lead to the most engagement (voting, chat).
