/**
 * Remote API client for the Portals FastAPI backend.
 *
 * Used for:
 *   - Authentication (GitHub OAuth login)
 *   - AI workflow orchestration (trigger + poll)
 *   - Repository HEAD polling (until SSE replaces it)
 *
 * NOT used for:
 *   - Asset storage (handled by Lore directly via nap-sdk)
 *   - Repository operations (handled by Lore locally)
 *   - Entity CRUD (handled by Lore locally via nap-sdk)
 */

import { API_BASE } from "../config";

// ─── Types ───

export interface SessionToken {
  token: string;
  expires_at: string;
  user: { id: string; name: string; email: string };
}

export interface HeadInfo {
  commit_hash: string;
  timestamp: string;
}

export interface WorkflowResult {
  workflow_id: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: Record<string, unknown>;
  error?: string;
}

// ─── Error ───

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ─── Client ───

function getToken(): string | null {
  return localStorage.getItem("portals:session_token");
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new ApiError(text, res.status);
  }

  return res.json();
}

// ─── Hooks ───

/**
 * Hook for FastAPI remote operations.
 */
export function useApi() {
  return {
    // ── Authentication ──

    /** Complete GitHub OAuth login. Call after GitHub redirects back. */
    githubCallback: (code: string): Promise<SessionToken> =>
      request("GET", `/api/v1/auth/github/callback?code=${code}`),

    /** Get a fresh GitHub installation token (for Lore remote auth). */
    getGitHubToken: (repoUri: string): Promise<{ token: string; expires_at: string }> =>
      request("GET", `/api/v1/auth/github/token?repo=${encodeURIComponent(repoUri)}`),

    // ── Repository HEAD polling ──

    /** Poll the remote HEAD for change detection. */
    pollHead: (repoUri: string): Promise<HeadInfo> =>
      request("GET", `/api/v1/repos/${encodeURIComponent(repoUri)}/head`),

    // ── AI Workflows ──

    /** Trigger an AI workflow. */
    triggerWorkflow: (
      workflowType: string,
      params: Record<string, unknown>,
    ): Promise<WorkflowResult> =>
      request("POST", "/api/v1/workflows/trigger", { type: workflowType, params }),

    /** Poll a running workflow for completion. */
    getWorkflowStatus: (workflowId: string): Promise<WorkflowResult> =>
      request("GET", `/api/v1/workflows/${workflowId}/status`),
  };
}
