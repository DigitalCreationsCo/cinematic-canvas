// src/client/src/components/canvas/nodes/SceneCreatorFields.tsx
//
// Render-fields component for the SceneCreator canvas node.
// Consumed as the `renderFields` prop in FormNodeConfig.
//
// AESTHETIC: "Director's Console" — dark industrial film-production feel with
// warm gold/amber accents, monospaced uppercase labels, and glass-morphism
// that matches the cinematic-canvas design language. The form feels like a
// clapperboard-meets-production-slate control panel.
//
// DESIGN DECISIONS:
//   • Stepped scene-counter (± buttons + slider) over raw text input —
//     invites playful tactile interaction and prevents out-of-range values.
//   • Segmented mode toggle (Scenes / Duration) uses gold (#c9a55a) for the
//     active state — a cinematic accent borrowed from the design tokens.
//   • Connected image thumbnails act as a live mood board — they wire into
//     useNodeStore + useAssetStore reactively so thumbnails appear/disappear
//     as edges are created or removed.
//   • The MentionTextArea picks up @mention suggestions from the project's
//     knowledge base, reusing the existing mention infrastructure.

import { useEffect, useMemo, useRef } from "react";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";
import { useAssetStore } from "#client/store/useAssetStore.js";
import { useSceneCreatorStore } from "#client/store/useSceneCreatorStore.js";
import { getAllBestAssets } from "#shared/utils/assets.utils.js";
import { Input } from "#client/components/ui/input.js";
import {
  MentionTextarea,
  type MentionTextareaHandle,
} from "#client/components/editor/mention/MentionTextArea.js";
import { cn } from "#client/lib/utils.js";
import { Image, Film, Clock, Layers, Minus, Plus } from "lucide-react";
import type { FormFieldRendererProps, FormNodeConfig, FormErrors } from "./FormNode.js";
import { HANDLE_IDS } from "#client/domain/canvas/NodeTypes.js";
import { NodeFactory } from "#client/domain/canvas/NodeFactory.js";
import { generateId } from "#shared/utils/id.js";
import { AssetRegistry } from "#shared/types/assets.types.js";
import type { Scene } from "#shared/types/workflow.types.js";
import { addNotification } from "#client/store/usePipelineStore.js";
import { generateScenesFromPrompt } from "#client/lib/api.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const MODE_OPTIONS = [
  { value: "scenes", label: "Scenes", icon: Film },
  { value: "duration", label: "Duration", icon: Clock },
] as const;

const MIN_SCENES = 1;
const MAX_SCENES = 50;

// ============================================================================
// COMPONENT
// ============================================================================

export function SceneCreatorFields({
  entityId,
  fields,
  errors,
  hasAttemptedSubmit,
  requiredFields,
  onFieldChange,
}: FormFieldRendererProps) {
  const promptRef = useRef<MentionTextareaHandle>(null);

  // ── Reactive store subscriptions ──────────────────────────────────────
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const edges = useNodeStore((s) => s.edges);
  const nodes = useNodeStore((s) => s.nodes);
  const assetMap = useAssetStore((s) => s.assets);

  // Resolve connected image nodes into a live mood-board array.
  const connectedImages = useMemo(() => {
    return edges
      .filter((e) => e.target === entityId)
      .map((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source);
        if (!sourceNode || sourceNode.type !== "image") return null;
        const entityAssets = assetMap.get(sourceNode.data.entityId);
        const best = entityAssets ? getAllBestAssets(entityAssets) : null;
        return {
          nodeId: sourceNode.id,
          entityId: sourceNode.data.entityId,
          src: best?.image_file?.data ?? null,
        };
      })
      .filter((img): img is NonNullable<typeof img> => img !== null);
  }, [edges, nodes, assetMap, entityId]);

  // ── Derived field values ──────────────────────────────────────────────
  const mode = (fields.mode as "scenes" | "duration") || "scenes";
  const sceneCount = Math.min(
    MAX_SCENES,
    Math.max(MIN_SCENES, (fields.sceneCount as number) || 3),
  );
  const duration = (fields.duration as string) || "";
  const promptContent = (fields.prompt as string) || "";

  // ── Store mirroring ────────────────────────────────────────────────────
  // Mirror fields to the scene-creator store so the tool lifecycle hook can
  // reactively detect unsaved data and cache/restore form state.
  const setFieldsInStore = useSceneCreatorStore((s) => s.setFields);

  useEffect(() => {
    setFieldsInStore(fields);
  }, [fields, setFieldsInStore]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const adjustSceneCount = (delta: number) => {
    const next = Math.min(MAX_SCENES, Math.max(MIN_SCENES, sceneCount + delta));
    onFieldChange("sceneCount", next);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — Generation Mode (Scenes / Duration toggle)
          Segmented control styled like a film-production slate toggle.
          ════════════════════════════════════════════════════════════════ */}
      <section className="flex flex-col gap-1.5">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/70">
          Generation Mode
        </span>
        <div
          className="flex gap-px bg-muted/60 p-0.5"
          role="radiogroup"
          aria-label="Generation mode"
        >
          {MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = mode === opt.value;
            return (
              <button
                key={opt.value}
                role="radio"
                aria-checked={isActive}
                onClick={() => onFieldChange("mode", opt.value)}
                className={cn(
                  "nodrag flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all duration-75",
                  isActive
                    ? "bg-[#c9a55a] text-black font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
                )}
              >
                <Icon className="w-3 h-3" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — Scene Count or Duration input
          Conditional on the selected mode. Scene count uses a tactile
          stepped counter (± buttons + slider). Duration uses a timestamp
          input with MM:SS / HH:MM:SS format.
          ════════════════════════════════════════════════════════════════ */}
      <section className="flex flex-col gap-1.5">
        {mode === "scenes" ? (
          <>
            <label className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/70">
              Number of Scenes
            </label>

            {/* Stepped counter */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => adjustSceneCount(-1)}
                disabled={sceneCount <= MIN_SCENES}
                className={cn(
                  "nodrag h-9 w-9 flex items-center justify-center border border-border transition-colors text-sm",
                  "hover:border-foreground/40 disabled:opacity-30 disabled:cursor-not-allowed",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                )}
                aria-label="Decrease scene count"
              >
                <Minus className="w-3 h-3" />
              </button>

              <div className="flex-1 text-center">
                <span className="text-2xl font-mono tabular-nums tracking-tight">
                  {sceneCount}
                </span>
                <span className="text-[11px] text-muted-foreground/60 font-mono ml-1.5">
                  scenes
                </span>
              </div>

              <button
                onClick={() => adjustSceneCount(1)}
                disabled={sceneCount >= MAX_SCENES}
                className={cn(
                  "nodrag h-9 w-9 flex items-center justify-center border border-border transition-colors text-sm",
                  "hover:border-foreground/40 disabled:opacity-30 disabled:cursor-not-allowed",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                )}
                aria-label="Increase scene count"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {/* Range slider (accessibility + fine-tuning) */}
            <input
              type="range"
              min={MIN_SCENES}
              max={MAX_SCENES}
              value={sceneCount}
              onChange={(e) => onFieldChange("sceneCount", parseInt(e.target.value, 10))}
              className={cn(
                "nodrag w-full h-1.5 appearance-none bg-muted cursor-pointer mt-1",
                // WebKit thumb
                "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5",
                "[&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:bg-[#c9a55a]",
                "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black",
                "[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-75",
                "[&::-webkit-slider-thumb]:active:scale-125",
                // Firefox thumb
                "[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5",
                "[&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:bg-[#c9a55a]",
                "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-black",
              )}
              aria-label="Scene count slider"
            />
          </>
        ) : (
          <>
            <label className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/70">
              Total Duration
            </label>
            <div className="relative">
              <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 pointer-events-none" />
              <Input
                className="nodrag pl-8 font-mono tabular-nums text-sm"
                placeholder="e.g. 00:30 or 1:30:00"
                value={duration}
                onChange={(e) => onFieldChange("duration", e.target.value)}
                aria-invalid={Boolean(errors.duration)}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/50 ml-1">
              HH:MM:SS or MM:SS
            </span>
            {errors.duration && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {errors.duration}
              </p>
            )}
          </>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3 — Scene Progression Prompt
          Rich textarea with @mention support for referencing project entities
          (characters, locations, props) in the scene description.
          ════════════════════════════════════════════════════════════════ */}
      <section className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/70">
          Scene Progression Prompt
        </label>
        <div className={cn(errors.prompt && "ring-1 ring-destructive")}>
          <MentionTextarea
            ref={promptRef}
            projectId={selectedProjectId ?? ""}
            initialContent={promptContent}
            onUpdate={(html) => onFieldChange("prompt", html)}
            placeholder="Describe the progression of scenes… Use @ to mention characters, locations, or props"
            rows={6}
            className="nodrag text-sm"
          />
        </div>
        {errors.prompt && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {errors.prompt}
          </p>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4 — Visual References (Mood Board)
          Shows thumbnails of connected image nodes. When no images are
          connected, renders a drop zone hint with the node handle label.
          The handle itself is rendered by NodeShell via the targetHandle
          config — this section purely displays the connected state.
          ════════════════════════════════════════════════════════════════ */}
      <section className="flex flex-col gap-1.5">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/70">
          Visual References
        </span>
        <div
          className={cn(
            "min-h-[72px] transition-colors duration-75",
            connectedImages.length > 0
              ? "border border-border/60 p-2"
              : "border border-dashed border-border/40 p-3 hover:border-foreground/20",
          )}
        >
          {connectedImages.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {connectedImages.map((img) => (
                <div
                  key={img.nodeId}
                  className="relative group w-[68px] h-[68px] overflow-hidden border border-border/40"
                >
                  {img.src ? (
                    <img
                      src={img.src}
                      alt="Mood board reference"
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted/50">
                      <Image className="w-5 h-5 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-3 gap-1.5">
              <Layers className="w-5 h-5 text-muted-foreground/30" />
              <span className="text-[10px] font-mono text-muted-foreground/50 text-center leading-relaxed">
                Connect images via the input handle
                <br />
                to use as visual references
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// MINIMAL SCENE FACTORY
// ============================================================================

/**
 * Build a minimal valid Scene entity for the project store.
 *
 * All cinematography/lighting/audio fields get sensible defaults so the
 * SceneNode component can render without errors. The actual values will be
 * filled in when the LLM pipeline processes the scene.
 */
function createMinimalScene(params: {
  id: string;
  projectId: string;
  sceneIndex: number;
  name: string;
}): Scene {
  return {
    id: params.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    projectId: params.projectId,

    sceneIndex: params.sceneIndex,
    lighting: {
      quality: { hardness: "Soft", colorTemperature: "Neutral", intensity: "Medium" },
      motivatedSources: {
        primaryLight: "",
        fillLight: "",
        practicalLights: "",
        accentLight: "",
        lightBeams: "",
      },
      direction: { keyLightPosition: "", shadowDirection: "", contrastRatio: "" },
      atmosphere: { haze: "None" },
    },
    shotType: "Medium Shot",
    cameraAngle: "Eye Level",
    cameraMovement: "Static",
    transitionType: "Continuous",
    composition: {
      "Subject Placement": "Center",
      "Focal Point": "Center",
      "Depth Layers": "Midground",
      "Leading Lines": "None",
      Headroom: "Standard",
      "Look Room": "None",
    },

    startTime: params.sceneIndex * 5,
    endTime: (params.sceneIndex + 1) * 5,
    duration: 5,
    type: "lyrical",
    lyrics: "",
    musicalDescription: "",
    musicChange: "None",
    intensity: "medium",
    mood: "neutral",
    tempo: "moderate",
    audioEvidence: "",
    transientImpact: "soft",

    name: params.name,
    description: "",
    audioSync: "Mood Sync",

    characterReferenceIds: [],
    locationReferenceId: "",
    continuityNotes: [],
    characterIds: [],
    locationId: params.id, // self-reference placeholder until user assigns one

    status: "pending",
    progressMessage: "",

    guidanceLevel: null,

    assets: AssetRegistry.parse({}),
  };
}

// ============================================================================
// CONFIG FACTORY
// ============================================================================

/**
 * Build a FormNodeConfig pre-configured for the SceneCreator canvas node.
 *
 * Usage:
 *   const node = {
 *     type: 'scene-creator',
 *     data: {
 *       entityId: generateId(),
 *       ...,
 *       formConfig: createSceneCreatorConfig({ onSuccess }),
 *     },
 *   };
 *
 * @param opts.onSuccess — Called after a successful submit (e.g. to clear
 *   the cache and deactivate the tool in the lifecycle hook).
 */
export function createSceneCreatorConfig(opts?: {
  onSuccess?: () => void;
}): FormNodeConfig {
  return {
    label: "Scene Creator",
    icon: <Film className="w-4 h-4" />,

    // ── Node handles ──────────────────────────────────────────────────
    targetHandle: {
      id: HANDLE_IDS.sceneCreator.imageInput,
      colorClass: "!bg-[#c9a55a] !border-gray-900",
      title: "Connect images as mood-board references",
    },
    sourceHandle: {
      id: HANDLE_IDS.sceneCreator.output,
      colorClass: "!bg-[#c9a55a]/60 !border-gray-900",
      title: "Output created scene frames",
    },

    // ── Form fields renderer ───────────────────────────────────────────
    renderFields: SceneCreatorFields,

    // ── Validation ─────────────────────────────────────────────────────
    validate: (fields: Record<string, unknown>): FormErrors => {
      const errors: FormErrors = {};
      const mode = fields.mode as string;

      if (mode === "scenes") {
        const count = fields.sceneCount as number;
        if (!count || count < 1 || !Number.isFinite(count)) {
          errors.sceneCount = "At least 1 scene is required";
        } else if (count > MAX_SCENES) {
          errors.sceneCount = `Maximum ${MAX_SCENES} scenes`;
        }
      } else if (mode === "duration") {
        const dur = (fields.duration as string) || "";
        if (!dur.trim()) {
          errors.duration = "Duration is required";
        } else if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(dur.trim())) {
          errors.duration = "Use format MM:SS or HH:MM:SS";
        }
      }

      // Strip HTML tags from MentionTextArea content for emptiness check
      const prompt = (fields.prompt as string) || "";
      const stripped = prompt
        .replace(/<[^>]*>/g, "")
        .replace(/\u200B/g, "")
        .trim();
      if (!stripped) {
        errors.prompt = "A prompt is required";
      }

      return errors;
    },

    requiredFields: ["prompt"],

    // ── Submit handler ─────────────────────────────────────────────────
    onSubmit: async (fields: Record<string, unknown>) => {
      const projectId = useProjectStore.getState().selectedProjectId;
      if (!projectId) {
        addNotification({
          id: generateId(),
          type: "error",
          message: "No project selected. Please select a project first.",
          timestamp: new Date(),
        });
        return;
      }

      const mode = fields.mode as string;
      const prompt = (fields.prompt as string) || "";
      const stripped = prompt.replace(/<[^>]*>/g, "").trim();

      const sceneCount =
        mode === "scenes"
          ? Math.min(MAX_SCENES, Math.max(MIN_SCENES, (fields.sceneCount as number) || 1))
          : 3; // default count when using duration mode
      // TODO defer sceneCount to the model when it creates scenes to fill duration

      const duration = mode === "duration" ? (fields.duration as string) : undefined;

      const nodeStore = useNodeStore.getState();
      const projectStore = useProjectStore.getState();

      // ── Try pipeline API (async batch generation via LLM) ──────────
      // If the pipeline is available, scenes will arrive via SSE
      // ENTITY_CREATED events. Fall back to client-side creation if the
      // API call fails (e.g. no backend connection).
      let pipelineQueued = false;

      // Create placeholder scenes immediately so the user sees results on
      // the canvas without waiting for the pipeline. If the pipeline is
      // active, these will be enriched by ENTITY_UPDATED events.
      const sceneIds: string[] = Array.from({ length: sceneCount }, () => generateId());

      try {
        await generateScenesFromPrompt({
          sceneFields: { id: sceneIds[0], description: stripped },
          sceneIds,
          sceneCount,
          duration,
          projectId,
        });
        pipelineQueued = true;
      } catch (_pipelineErr) {
        console.warn(
          "[SceneCreator] Pipeline API unavailable — falling back to client-side scene creation.",
          _pipelineErr,
        );
      }

      try {
        for (let i = 0; i < sceneIds.length; i++) {
          const id = sceneIds[i];
          // 1. Add the scene entity to the project store
          const scene = createMinimalScene({
            id,
            projectId,
            sceneIndex: i,
            name: `Scene ${i + 1}`,
          });
          projectStore.addScene(scene);

          // 2. Create a corresponding canvas node
          const canvasNode = NodeFactory.createNode({
            type: "scene",
            entityId: id,
            contextId: projectId,
            contextType: "project",
            posCanvas: {
              x: 200 + Math.random() * 400,
              y: 100 + Math.random() * 300,
            },
            scope: "project",
            label: `Scene ${i + 1}`,
          });
          nodeStore.addNode(canvasNode);
        }

        // Show success toast (different message for pipeline vs. local)
        addNotification({
          id: generateId(),
          type: "success",
          message: pipelineQueued
            ? `Queued ${sceneIds.length} scene${sceneIds.length !== 1 ? "s" : ""} for AI generation`
            : `Created ${sceneIds.length} scene${sceneIds.length !== 1 ? "s" : ""} from prompt: "${stripped.slice(0, 60)}${stripped.length > 60 ? "…" : ""}"`,
          timestamp: new Date(),
        });
      } catch (err) {
        console.error("[SceneCreator] Failed to create scenes:", err);
        addNotification({
          id: generateId(),
          type: "error",
          message: `Failed to create scenes: ${(err as Error)?.message || "Unknown error"}`,
          timestamp: new Date(),
        });
        return; // Don't call onSuccess — keep the node open so user can retry
      }

      // Notify the lifecycle manager so it can clear the cache and
      // deactivate the tool.
      opts?.onSuccess?.();
    },

    submitLabel: "Generate Scenes",
    initialValues: {
      mode: "scenes",
      sceneCount: 3,
      duration: "",
      prompt: "",
    },
  };
}
