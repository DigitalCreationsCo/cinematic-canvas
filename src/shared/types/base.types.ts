// shared/types/base.types.ts
import { z } from "zod";
import { generateId } from "#shared/utils/id.js";

// ============================================================================
// CORE PRIMITIVES (No dependencies)
// ============================================================================

export const coerceDate = z.preprocess(
  (val: string | number | Date): Date => (typeof val === "string" || typeof val === "number" ? new Date(val) : val),
  z.date()
).default(() => new Date());

export const InsertIdentityBase = z.object({
  id: z.uuid({ "version": "v7" }).default(() => (generateId())).describe("Unique identifier (uuid)"),
  createdAt: coerceDate,
  updatedAt: coerceDate,
});

export const IdentityBase = z.object({
  id: z.uuid({ "version": "v7" }).nonempty().nonoptional().describe("Unique identifier (uuid)"),
  createdAt: coerceDate,
  updatedAt: coerceDate,
});

export const ProjectRef = z.object({
  projectId: z.uuid({ "version": "v7" }).nonempty().nonoptional().describe("Pipeline project id"),
});

export const TeamRef = z.object({
  teamId: z.uuid({ "version": "v7" }).nonempty().nonoptional().describe("Team ID"),
});
export const WorldRef = z.object({
  worldId: z.uuid({ "version": "v7" })
    .nullish()
    .transform((val) => val ?? undefined)
    .describe("World ID"),
});
export const WorkflowRef = z.object({
  workflowId: z.uuid({ "version": "v7" }).nullable()
    .transform((val) => val ?? undefined)
    .optional()
    .describe("Workflow ID"),
});
export const UserRef = z.object({
  userId: z.uuid().nonempty().nonoptional().describe("User ID"),
});

export const UploadResult = z.object({
  gcsUri: z.string(),
  publicUri: z.string(),
  mimeType: z.string(),
});
export type UploadResult = z.infer<typeof UploadResult>;

// ============================================================================
// VALID DURATIONS
// ============================================================================

export const VALID_DURATIONS = [6, 8] as const;

export function roundToValidDuration(duration: number): ValidDurations {
  if (typeof duration !== 'number' || isNaN(duration)) {
    throw new Error("Invalid input: duration must be a valid number.");
  }

  const validDurations = VALID_DURATIONS;
  let closest: ValidDurations = validDurations[0];
  let minDiff = Math.abs(duration - validDurations[0]);

  for (let i = 1; i < validDurations.length; i++) {
    const diff = Math.abs(duration - validDurations[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closest = validDurations[i];
    }
  }
  return closest;
}

export const ValidDurations = z.preprocess((val) => roundToValidDuration(Number(val)), z.union(VALID_DURATIONS.map(duration => z.literal(duration)) as z.ZodLiteral<number>[])).describe("Valid segment duration in seconds");
export type ValidDurations = typeof VALID_DURATIONS[number];

export function isValidDuration(duration: number): duration is ValidDurations {
  return VALID_DURATIONS.includes(duration as ValidDurations);
};