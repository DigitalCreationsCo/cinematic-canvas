// Base types (foundation - no dependencies)
export * from "./base.types.js";

// Primitive domain types (depend only on base)
export * from "./cinematography.types.js";
export * from "./assets.types.js";
export * from "./storage.types.js";
export * from "./quality.types.js";

// Audio types (depends on base + cinematography)
export * from "./audio.types.js";

// Domain entity attributes (depend on base + primitives)
export * from "./character.types.js";
export * from "./location.types.js";
export * from "./scene.types.js";
export * from "./metadata.types.js";
export * from "./mention.types.js";

// Database entities (depend on domain attributes + schema)
export * from "./entity.types.js";
export * from "./job.types.js";

// Workflow types (aggregate layer - depends on entities)
export * from "./workflow.types.js";

// Editable types (depend on domain types)
export * from "./editable.types.js";

// Pipeline types (top layer - depends on project)
export * from "./pipeline.types.js";

// Scene-as-Code ledger types (SAC)
export * from "./sac.types.js";

// Canvas node types (for xyflow)
export * from "./canvas.types.js";
