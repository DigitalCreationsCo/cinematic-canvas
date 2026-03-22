// shared/types/sac_types.ts
// Scene-as-Code (SAC) Ledger System types
// These types define the versioned git-backed world/project ledger format.

// ============================================================================
// SAC COMMIT
// ============================================================================

export interface SacCommit {
  sha: string;
  message: string;
  timestamp: string;
  author: string;
}

// ============================================================================
// SAC LICENSE DEFINITION
// ============================================================================

/**
 * Defines what a licensee is permitted to do with a world's entities.
 *
 * Tier examples:
 *   read-only:  allowUpstreamPR=false — fork allowed, no PRs back
 *   derivative: allowUpstreamPR=true, allowedPREntityTypes=['character','location','prop']
 *   full-collab: allowUpstreamPR=true, allowedPREntityTypes=null (all types)
 */
export interface SacLicenseDefinition {
  slug: string;                           // e.g. 'read-only', 'derivative', 'full-collab'
  allowUpstreamPR: boolean;
  allowedPREntityTypes: ('character' | 'location' | 'prop')[] | null; // null = all allowed
  allowSublicense: boolean;
  attributionRequired: boolean;
  royaltyNote?: string;                   // metadata only, not app-enforced
  entityRestrictions: string[];           // referenceIds of off-limits entities
}

// ============================================================================
// SAC LEDGER
// ============================================================================

/**
 * The root .sac ledger file committed to the world git repo.
 * Contains references (referenceIds) to entity ledger files — NOT the full
 * attribute objects — so that diffs are granular per entity.
 */
export interface SacLedger {
  version: string;                        // semver e.g. '1.0.0'
  worldMetadata: {
    title: string;
    logline: string;
    style: string;
    mood: string;
    colorPalette: string[];
    tags: string[];
  };
  creatorInfo: {
    ownerId: string;
    ownerName: string;
    teamId: string;
  };
  licenseDefinitions: SacLicenseDefinition[];
  characterLedgers: string[];             // referenceIds of character ledger files
  locationLedgers: string[];             // referenceIds of location ledger files
  propLedgers: string[];                  // referenceIds of prop ledger files
  generationRules: string[];
}
