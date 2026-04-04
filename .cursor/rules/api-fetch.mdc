---
trigger: glob
globs: src/client/src
---

# apiFetch Reference

File: src/client/src/lib/api.ts
Overview
apiFetch is a thin wrapper around the native fetch API that handles authentication, team context, and standardized error handling for all client-side API calls.
Function Signature
async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<any>
Key Behaviors
Behavior	Implementation
Base URL	Prepends VITE_API_BASE_URL (or /api fallback) to endpoint
Content-Type	Always sets Content-Type: application/json
Team isolation	Injects x-team-id header when getActiveTeamId() returns a value
Auth	Injects Authorization: Bearer <token> from Supabase session
Error handling	Parses { error: string } from response body; throws Error on non-2xx
Response	Returns parsed JSON; throws on failure (no return value on error)
Variants
Function	Purpose
apiFetch	Default — JSON bodies, GET/POST/PATCH
apiFetchMultipart	File uploads via FormData (audio, images)
---
Gotchas
1. Errors throw — no ok: false to handle
// ❌ This won't work — apiFetch throws on non-2xx
const data = await apiFetch('/something');
if (!data.ok) { ... }
// ✅ Check for errors with try/catch
try {
  await apiFetch('/something');
} catch (err) {
  console.error(err.message); // "Server error" or "API Request failed: ..."
}
2. Response body is silently ignored on non-ok
// ❌ If the server returns { error: "Not found", details: {...} }
// you only get the string "Not found" in the thrown Error
const errorData = await response.json().catch(() => ({}));
throw new Error(errorData.error || ...);
If you need structured error details (status codes, field errors), apiFetch doesn't expose them — consider wrapping it or creating a variant.
3. Auth context is read at call time
// ❌ getActiveTeamId() and supabase session are called every invocation
const teamId = getActiveTeamId();
const { session } = await supabase.auth.getSession();
If the user switches teams mid-session, subsequent calls will pick up the new team ID automatically — but this means no request-level isolation if you need the original team context.
4. Content-Type is always application/json
// ❌ Will break — apiFetch overwrites Content-Type
await apiFetch('/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'multipart/form-data' },
  body: formData,
});
// ✅ Use apiFetchMultipart for file uploads
apiFetchMultipart(endpoint, formData);
5. No timeout by default
apiFetch relies on the browser's default fetch timeout (which is effectively none). Long-running requests will hang indefinitely. Use an AbortController if you need timeouts.
6. No retry logic
Failed requests are not retried — if the server returns a transient error (503, network glitch), the caller must implement retry logic.
7. patchEntities intentionally ignores response
// The response body is discarded — state is updated via SSE events
export const patchEntities = async (body: BatchEntityUpdateRequest): Promise<void> => {
  await apiFetch(api.entities.patch(), { ... });
  // Returns void, not the updated entities
};
8. Environment variable naming
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
//                    ^
//                  VITE_ prefix required for Vite
If VITE_API_BASE_URL is unset, requests go to /api/<endpoint> — which works in dev/prod when the server proxies /api to itself.