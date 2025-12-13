import { Command } from "@shared/pubsub-types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

interface StartPipelineArgs {
  projectId: string;
  audioUrl: string;
  creativePrompt: string;
}

export async function startPipeline(args: StartPipelineArgs): Promise<{ projectId: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/video/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to start pipeline.");
  }

  return response.json();
}

interface StopPipelineArgs {
  projectId: string;
}

export async function stopPipeline(args: StopPipelineArgs): Promise<{ projectId: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/video/stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to stop pipeline.");
  }

  return response.json();
}

interface RetrySceneArgs {
    projectId: string;
    sceneId: string;
}

export async function retryScene(args: RetrySceneArgs): Promise<{ projectId: string; message: string }> {
    const response = await fetch(`${API_BASE_URL}/video/${args.projectId}/retry-scene`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to retry scene.");
    }

    return response.json();
}
