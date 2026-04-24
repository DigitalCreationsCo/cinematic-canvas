import type { EntityUnion, GenerateEntity } from "#shared/types/index.js";
export type GenerateEntitiesPayload = GenerateEntity<EntityUnion>[] | {
    entities: GenerateEntity<EntityUnion>[];
};
/**
 * Accept both the current array payload and the legacy wrapped payload shape.
 * This keeps queued jobs and older publishers compatible while ensuring the
 * worker always sees the same entity array contract.
 */
export declare function normalizeGenerateEntitiesPayload(payload: GenerateEntitiesPayload): GenerateEntity<EntityUnion>[];
//# sourceMappingURL=generate-entities-payload.d.ts.map