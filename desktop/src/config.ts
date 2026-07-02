/**
 * Portals Desktop — application configuration.
 *
 * The API base URL is seeded from the Tauri managed state at build time
 * and can be overridden at runtime via localStorage for development.
 */

export const API_BASE =
  localStorage.getItem("portals:api_base") ??
  // Injected by Tauri build; falls back to localhost for development.
  (import.meta.env.DEV
    ? "http://localhost:8000"
    : "https://api.portals.app");
