// src/client/src/store/middleware/uiPreferencesPersistence.ts
// Persists transient canvas UI state that should survive page refreshes

import type { ToolPanelSection, LayoutMode } from "#client/store/useCanvasUIStore.js";

export interface UIPreferencesState {
  isDark: boolean;
  layoutMode: LayoutMode;
  snapToGrid: boolean;
  autoLayout: boolean;
  openToolSections: ToolPanelSection[];
  screenplay: string;
  notes: string;
}

const LS_KEY = "cinematic_canvas_ui_prefs";

const DEFAULTS: UIPreferencesState = {
  isDark: true,
  layoutMode: "freeform",
  snapToGrid: true,
  autoLayout: true,
  openToolSections: ["characters", "locations"],
  screenplay: "",
  notes: "",
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: Partial<UIPreferencesState> | null = null;
const DEBOUNCE_MS = 300;

export function hydrateUIPreferences(): UIPreferencesState {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (!stored) return { ...DEFAULTS };

    const parsed = JSON.parse(stored) as Partial<UIPreferencesState>;
    return {
      ...DEFAULTS,
      ...parsed,
      openToolSections: Array.isArray(parsed.openToolSections) ? parsed.openToolSections : DEFAULTS.openToolSections,
    };
  } catch {
    localStorage.removeItem(LS_KEY);
    return { ...DEFAULTS };
  }
}

export function persistUIPreference(partial: Partial<UIPreferencesState>): void {
  pendingState = { ...pendingState, ...partial };

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (pendingState) {
      writeToStorage(pendingState);
      pendingState = null;
    }
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

export function flushUIPreferences(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (pendingState) {
    writeToStorage(pendingState);
    pendingState = null;
  }
}

export function clearUIPreferences(): void {
  flushUIPreferences();
  localStorage.removeItem(LS_KEY);
}

export function getUIPreference<K extends keyof UIPreferencesState>(key: K): UIPreferencesState[K] {
  const state = hydrateUIPreferences();
  return state[key];
}

function writeToStorage(partial: Partial<UIPreferencesState>): void {
  try {
    let existing: Partial<UIPreferencesState> = {};
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      try {
        existing = JSON.parse(stored);
      } catch {
        existing = {};
      }
    }

    const merged = { ...existing, ...partial };
    localStorage.setItem(LS_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn("[uiPreferencesPersistence] Failed to write to localStorage:", err);
  }
}
