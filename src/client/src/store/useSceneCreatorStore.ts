// src/client/src/store/useSceneCreatorStore.ts
//
// Lightweight Zustand store that mirrors the SceneCreatorNode's form fields
// so the tool lifecycle hook can reactively check for unsaved data without
// reaching inside FormNode's local state.
//
// Form data is also persisted to sessionStorage so it survives accidental
// node closes or browser refreshes — same pattern as NewEntityModal.

import { create } from "zustand";

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_KEY = "scene-creator-form-data";

// ============================================================================
// TYPES
// ============================================================================

export interface SceneCreatorState {
  /** The entityId of the active SceneCreatorNode on the canvas (or null). */
  nodeId: string | null;
  /** Current form field values. */
  fields: Record<string, unknown>;
  /** True when at least one field has a non-empty value. */
  hasUnsavedData: boolean;

  // ── Actions ─────────────────────────────────────────────────────────────
  setNodeId: (id: string | null) => void;
  setFields: (fields: Record<string, unknown>) => void;
  clearCache: () => void;
  reset: () => void;
}

// ============================================================================
// STORE
// ============================================================================

export const useSceneCreatorStore = create<SceneCreatorState>((set) => ({
  nodeId: null,
  fields: {},
  hasUnsavedData: false,

  setNodeId: (id) => set({ nodeId: id }),

  setFields: (fields) => {
    const hasUnsavedData = Object.values(fields).some(
      (val) => val !== undefined && val !== null && val !== "",
    );
    set({ fields, hasUnsavedData });

    // Persist to sessionStorage (silently ignore quota errors)
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(fields));
    } catch {
      /* quota exceeded or storage unavailable */
    }
  },

  clearCache: () => {
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      /* silently ignore */
    }
  },

  reset: () => {
    set({ nodeId: null, fields: {}, hasUnsavedData: false });
  },
}));

// ============================================================================
// STATIC HELPERS (used outside React components)
// ============================================================================

/**
 * Read cached form fields from sessionStorage.
 * Used when creating the SceneCreatorNode to restore previous state.
 */
export function loadCachedSceneCreatorFields(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
