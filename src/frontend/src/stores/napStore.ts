import { create } from "zustand";
import type { MergePreviewState } from "@/types/nap";

/**
 * Zustand store for NAP (Narrative Addressing Protocol) draft state.
 *
 * This store holds the **frontend-only** merge preview state for the
 * currently active entity.  If the page is refreshed the preview is
 * gone — it is reconstructed from ``draftData`` (in the flow store)
 * and the latest commit (fetched from the ``diff`` endpoint).
 */
type NapStoreState = {
  /** The active merge preview, if any */
  mergePreview: MergePreviewState | null;

  /** Set or clear the merge preview */
  setMergePreview: (preview: MergePreviewState | null) => void;

  /** Record a single conflict resolution choice */
  setResolution: (path: string, value: unknown) => void;

  /** Clear all resolutions (when re-merging) */
  clearResolutions: () => void;

  /**
   * The current working draft manifest for the active NAP entity.
   * Undo/redo snapshots include this alongside nodes/edges.
   */
  draftManifest: Record<string, unknown> | null;

  /** Replace the entire draft manifest */
  setDraftManifest: (manifest: Record<string, unknown> | null) => void;

  /** Update a single path in the draft manifest */
  updateDraftPath: (path: string, value: unknown) => void;

  /** Reset the entire store (on flow change) */
  reset: () => void;
};

export const useNapStore = create<NapStoreState>((set) => ({
  mergePreview: null,
  draftManifest: null,

  setMergePreview: (preview) => set({ mergePreview: preview }),

  setResolution: (path, value) =>
    set((state) => {
      if (!state.mergePreview) return state;
      return {
        mergePreview: {
          ...state.mergePreview,
          resolutions: {
            ...state.mergePreview.resolutions,
            [path]: value,
          },
        },
      };
    }),

  clearResolutions: () =>
    set((state) => {
      if (!state.mergePreview) return state;
      return {
        mergePreview: {
          ...state.mergePreview,
          resolutions: {},
        },
      };
    }),

  setDraftManifest: (manifest) => set({ draftManifest: manifest }),

  updateDraftPath: (path, value) =>
    set((state) => {
      if (!state.draftManifest) return state;
      // Support dot-separated nested path updates
      const keys = path.split(".");
      const newManifest = { ...state.draftManifest };
      let current: Record<string, unknown> = newManifest;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current) || typeof current[key] !== "object") {
          current[key] = {};
        }
        current[key] = { ...(current[key] as Record<string, unknown>) };
        current = current[key] as Record<string, unknown>;
      }
      current[keys[keys.length - 1]] = value;
      return { draftManifest: newManifest };
    }),

  reset: () =>
    set({
      mergePreview: null,
      draftManifest: null,
    }),
}));

export default useNapStore;
