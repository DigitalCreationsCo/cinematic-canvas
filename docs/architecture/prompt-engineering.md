---
title: Prompt Engineering
description: Role-based prompt architecture (Director, Cinematographer, Gaffer, etc.) and meta-prompting.
keywords: ["prompt engineering", "roles", "meta-prompting", "director", "cinematographer", "gaffer"]
---


# Role-Based Prompt Architecture

## Overview

The Cinematic Framework uses a **role-based prompt architecture** that mirrors a real film production crew. Each role has specialized expertise and contributes specific specifications at different points in the video generation workflow.

### Benefits

*   **Composability**: Prompts are modular building blocks. Combine different roles for different generation points.
*   **Traceability**: Quality issues trace to specific departments. Know exactly which prompt to fix.
*   **Efficiency**: Only failing departments revise on retry. Reduced token usage by avoiding redundant information.
*   **Clarity**: Each role has single responsibility. No conflicting instructions.

## Film Production Roles

### 🎬 DIRECTOR (Creative Vision)
*   **File**: `pipeline/prompts/role-director.ts`
*   **Responsibility**: Defines the overall creative vision, narrative intent, emotional arc, and scene beat structure.
*   **Usage**: Initial context generation, Storyboard expansion.

### 📷 CINEMATOGRAPHER (Visuals)
*   **File**: `pipeline/prompts/role-cinematographer.prompt.ts`
*   **Responsibility**: Manages shot composition, camera movement, and framing.
*   **Key Outputs**: Shot type (ECU, MCU, Wide), Camera Angle (High/Low/Dutch), Movement (Dolly/Pan/Tilt).
*   **Usage**: Storyboard enrichment, Frame generation.

### 💡 GAFFER (Lighting)
*   **File**: `pipeline/prompts/role-gaffer.ts`
*   **Responsibility**: Designs lighting quality, motivated sources, and atmosphere.
*   **Key Outputs**: Light quality (Soft/Hard), Color temperature, Motivated sources, Voluptuous fog/haze.
*   **Usage**: Storyboard enrichment, Frame generation.

### 📋 SCRIPT SUPERVISOR (Continuity)
*   **File**: `pipeline/prompts/role-script-supervisor.ts`
*   **Responsibility**: Maintains visual continuity for characters, locations, and props across the entire workflow. Relies heavily on the [Temporal State System](./state-management.md#4-temporal-state--continuity).
*   **Usage**: Frame generation, Scene generation.

### 👔 COSTUME & MAKEUP (Characters)
*   **File**: `pipeline/prompts/role-costume-makeup.ts`
*   **Responsibility**: Defines character appearance details.
*   **Usage**: Character Reference Sheet generation.

### 🎨 PRODUCTION DESIGNER (Locations)
*   **File**: `pipeline/prompts/role-set-designer.ts`
*   **Responsibility**: Specific environment, architecture, and atmospheric conditions.
*   **Usage**: Location Reference Sheet generation.

### 🎭 FIRST AD (Safety & Feasibility)
*   **File**: `pipeline/prompts/role-first-ad.ts`
*   **Responsibility**: Safety compliance, prompt sanitization, technical feasibility.
*   **Usage**: Pre-generation safety check.

### 🎞️ QUALITY CONTROL SUPERVISOR (Evaluation)
*   **File**: `pipeline/prompts/role-quality-control.ts`
*   **Responsibility**: Evaluating generated assets and providing department-specific feedback.
*   **Usage**: Quality Loop.

## Prompt Composition System

The `pipeline/prompts/prompt-composer.ts` module manages how these roles are combined for specific tasks.

### 1. Storyboard Enrichment
*   **Goal**: Create detailed scenes from a basic script.
*   **Composition**: `Director` + `Cinematographer` + `Gaffer`

### 2. Frame Generation (Start/End Keys)
*   **Goal**: Generate consistent keyframes for video generation.
*   **Composition**: `Cinematographer` + `Gaffer` + `Script Supervisor` + `Costume` + `Production Designer`

### 3. Scene Video Generation (Meta-Prompting)
*   **Goal**: Generate the final video clip.
*   **Process**:
    1.  Collect specs from all roles.
    2.  Construct a **Meta-Prompt** instruction for a reasoning LLM.
    3.  The LLM synthesizes these inputs into a single, cohesive video generation prompt optimized for the target model (e.g., LTX-Video).
    4.  **First AD** sanitizes the output for safety.

## Workflow Integration

| Phase | Action | Roles Involved |
| :--- | :--- | :--- |
| **Pre-Production** | Creative Expansion | **Director** |
| | Storyboard Enrichment | **Director**, **Cinematographer**, **Gaffer** |
| **Assets** | Character Refs | **Costume & Makeup** |
| | Location Refs | **Production Designer** |
| **Production** | Keyframe Gen | **Cinematographer**, **Gaffer**, **Script Supervisor** |
| | Video Gen | **All Roles** (via Meta-Prompt) |
| **Quality** | Evaluation | **Quality Control Supervisor** |
