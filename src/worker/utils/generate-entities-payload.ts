import type { GenerateEntitiesPayload, GenerateEntity } from "../../shared/types/editable.types.js";

/**
 * Accept both the current array payload and the legacy wrapped payload shape.
 * This keeps queued jobs and older publishers compatible while ensuring the
 * worker always sees the same entity array contract.
 */
export function normalizeGenerateEntitiesPayload(
  payload: GenerateEntitiesPayload,
): GenerateEntity<unknown>[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.entities)) {
    return payload.entities;
  }

  throw new Error("Invalid GENERATE_ENTITIES payload: expected entity array.");
}
