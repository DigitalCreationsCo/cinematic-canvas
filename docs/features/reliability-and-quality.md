# Reliability & Quality

## Overview

Cinematic Canvas uses a multi-layered approach to ensure high-quality generation and system reliability. This includes a **Human-in-the-Loop Retry Architecture**, **Automated Quality Evaluation**, and **Domain-Specific Generation Rules**.

## 1. Automated Quality Evaluation

Every generated asset (frame, scene, video) undergoes automated scrutiny by a dedicated **Quality Control Agent**.

### Evaluation Criteria
The agent evaluates content against five dimensions:
1.  **Narrative Fidelity**: Does it match the script?
2.  **Character Consistency**: Do characters look like their reference images?
3.  **Technical Quality**: Is the image sharp, well-lit, and artifact-free?
4.  **Emotional Authenticity**: Does the mood match the scene?
5.  **Continuity**: Does it match the previous shot?

### Issue Grading
*   **CRITICAL**: Unusable (e.g., character warping, semantic misunderstanding).
*   **MAJOR**: Significant defects (e.g., wrong character count).
*   **MINOR**: Acceptable with tweaks (e.g., slight background mismatch).

---

## 2. Adaptive Retry Mechanism

When quality issues are detected, the system does **not** simply retry blindly. It attempts to **fix the prompt** based on the specific failure.

### The Correction Loop
1.  **Analyze**: The Quality Agent identifies *why* the generation failed (e.g., "Missing Character B").
2.  **Construct**: A new, more explicit prompt is created (e.g., "Add Character B to the left foreground").
3.  **Constraint**: Negative constraints are added to prevent repeating the error.
4.  **Retry**: The generation is re-run with the improved prompt.

> **Note**: Retries are "additive". We add detail to clarify, rather than removing detail which might lose context.

### Retry Configuration
*   **Max Retries**: Default is 3 attempts.
*   **Thresholds**: A score of >0.90 is auto-accepted. >0.75 is considered major failure.

---

## 3. Human-in-the-Loop Control (`retryLlmCall`)

For critical AI operations, we use a `retryLlmCall` utility that integrates with **LangGraph Interrupts**.

### How it works
If an LLM call fails (or triggers a safety filter), the workflow **pauses**.
1.  The failure is exposed as an **Interrupt**.
2.  A human operator (or the user via UI) can inspect the **Safety Parameters** (prompt, seed, model).
3.  The operator can **edit valid parameters** and `RESUME` the workflow.

This ensures that expensive or sensitive operations don't fail silently or burn budget on bad loops.

---

## 4. Domain-Specific Generation Rules

To improve first-shot success, the system automatically detects the "Domain" of the script and applies pre-set rules.

**Examples**:
*   **Surfing Domain**: Adds rules about water physics, board positioning, and wave terminology.
*   **Medical Domain**: Adds rules about sterile environments and equipment accuracy.
*   **Urban Domain**: Enforces architectural consistency.

These rules are injected into the system prompt *before* generation begins, acting as guardrails for the model.
