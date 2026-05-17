import type { AssistantSuggestion } from "./assistant-panel.types";

export const ASSISTANT_TITLE = "Portals Assistant";

export const ASSISTANT_SESSION_STORAGE_KEY_PREFIX =
  "portals-assistant-session-";

export const ASSISTANT_PLACEHOLDERS = [
  "Create an agent component...",
  "Build a RAG pipeline...",
  "Create a web scraper component...",
  "Build a document parser...",
  "Ask me anything about Portals...",
];

export function getAssistantPlaceholder(): string {
  return ASSISTANT_PLACEHOLDERS[
    Math.floor(Math.random() * ASSISTANT_PLACEHOLDERS.length)
  ];
}

export const ASSISTANT_SESSIONS_STORAGE_KEY = "portals-assistant-sessions";
export const ASSISTANT_MAX_SESSIONS = 10;
export const ASSISTANT_SESSION_PREVIEW_LENGTH = 80;

export const ASSISTANT_WELCOME_TEXT = "Here's how I can help";

export const ASSISTANT_SUGGESTIONS: AssistantSuggestion[] = [
  {
    id: "build-agents",
    icon: "Sparkles",
    text: "Build agents and other components",
  },
  {
    id: "answer-questions",
    icon: "Sparkles",
    text: "Answer questions about Portals",
  },
];
