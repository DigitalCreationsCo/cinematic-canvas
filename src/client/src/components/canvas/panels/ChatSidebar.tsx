// ChatSidebar.tsx — updated to use the extensible MentionTextarea API

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { X, MessageCircle, Send, Square, Plus, Loader2, ArrowDownLeft, CornerDownLeft } from "lucide-react";

import { usePipelineStore } from "#client/store/usePipelineStore.js";
import {
  CHAT_SIDEBAR_WIDTH,
  selectChatSidebarOpen,
  useUIMenuStore,
} from "#client/store/useUIMenuStore.js";
import { useChatStore } from "#client/store/useChatStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";
import { cn } from "#client/lib/utils.js";
import { Button } from "#client/components/ui/button.js";
import { Conversation, Message } from "#shared/types/chat.types.js";
import {
  MentionTextarea,
  MentionTextareaHandle,
} from "#client/components/editor/mention/MentionTextArea.js";

function ChatView({
  projectId,
  messages,
  isLoading,
  isStreaming,
  streamChunk,
  queuedMessages,
  onSendMessage,
  onStopStreaming,
}: {
  projectId: string;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  streamChunk: string;
  queuedMessages: string[];
  onSendMessage: (content: string) => void;
  onStopStreaming: () => void;
}) {
  const inputRef = useRef<MentionTextareaHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;

  const { loadMessageHistory } = useChatStore();
  const chatInputFocusTrigger = useChatStore((s) => s.chatInputFocusTrigger);

  useEffect(() => {
    if (messages.length > 0 && !inputRef.current) {
      loadMessageHistory();
    }
  }, [messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (chatInputFocusTrigger > 0) {
      inputRef.current?.focus();
    }
  }, [chatInputFocusTrigger]);

  // ── Controlled input state ─────────────────────────────────────────────────
  // Plain-text value kept in React state; MentionTextarea syncs to it via its
  // `value` prop.  `onUpdate` fires after every keystroke (mirrors onChange).
  const [input, setInput] = useState("");

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput("");
  };

  // Typed as a div keyboard handler because MentionTextarea is a div host
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // Let the mention popover handle Enter when it is open (internal handler
      // fires first, so if a suggestion was selected this won't also submit).
      e.preventDefault();
      submit();
      return;
    }

    // History navigation — only when the input is empty so it doesn't
    // interfere with normal cursor movement.
    if (e.key === "ArrowUp" && !input) {
      e.preventDefault();
      const { messageHistory: hist, navigateHistory: nav } = useChatStore.getState();
      if (hist.length > 0) {
        nav("up");
        const newIndex = useChatStore.getState().historyIndex;
        setInput(hist[newIndex] ?? "");
      }
      return;
    }

    if (e.key === "ArrowDown" && !input) {
      e.preventDefault();
      const {
        messageHistory: hist,
        historyIndex,
        navigateHistory: nav,
      } = useChatStore.getState();
      if (hist.length > 0 && historyIndex >= 0) {
        nav("down");
        const newIndex = useChatStore.getState().historyIndex;
        setInput(newIndex >= 0 ? (hist[newIndex] ?? "") : "");
      }
    }
  };

  return (
    <div className={cn("flex flex-col h-full", !hasMessages && "justify-start")}>
      {/* ── Message list ─────────────────────────────────────────────────── */}
      <div className="overflow-y-auto px-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              msg.role === "ai" ? "rounded-lg" : "",
              "flex flex-col gap-1 p-3 text-sm select-text",
              msg.role === "ai" ? "bg-primary/10 ml-4" : "bg-transparent mr-4",
            )}
          >
            <span className="text-xs text-muted-foreground font-medium">
              {msg.role === "human" ? "You" : "Assistant"}
            </span>
            <p className="whitespace-pre-wrap break-words">
              {msg.content}
              {msg.role === "ai" && !msg.isComplete && (
                <span className="inline-flex ml-1">
                  <span className="animate-pulse">▊</span>
                </span>
              )}
            </p>
          </div>
        ))}

        {isStreaming && (
          <div className="flex flex-col gap-1 p-3 rounded-lg text-sm bg-primary/10 ml-4 select-text">
            <span className="text-xs text-muted-foreground font-medium">AI</span>
            <p className="whitespace-pre-wrap break-words">
              {streamChunk || (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Thinking...</span>
                </span>
              )}
              {streamChunk && <span className="inline-flex ml-0.5 animate-pulse">▊</span>}
            </p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Queued messages indicator ─────────────────────────────────────── */}
      {queuedMessages.length > 0 && (
        <div className="px-3 py-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-none">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>
              {queuedMessages.length === 1
                ? "1 message queued — will send when the current response finishes"
                : `${queuedMessages.length} messages queued — will send when the current response finishes`}
            </span>
          </div>
        </div>
      )}

      {/* ── Input row ────────────────────────────────────────────────────── */}
      {/*
        Avoid a <form> with onSubmit here: the contentEditable div inside
        MentionTextarea doesn't fire a submit event, so we handle sending
        entirely via the onKeyDown handler above and the button's onClick.
      */}
      <div className={cn("flex-1 p-3 pb-6 group", hasMessages && "mt-4")}>
        <div className="flex">
          <MentionTextarea
            data-testid="input-chat"
            ref={inputRef}
            value={input}
            onUpdate={setInput}
            projectId={projectId}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder={
              hasMessages
                ? "Ask AI. Use @ to mention your project."
                : "Chat with AI. Use @ to mention your project."
            }
            className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-l px-3 py-2 text-sm"
          />

          {isStreaming ? (
            <Button
              variant="outline"
              type="button"
              onClick={onStopStreaming}
              title="Stop generating"
              className="shrink-0 p-2 bg-destructive text-destructive-foreground rounded-r hover:bg-destructive/90  transition-colors"
            >
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              type="button"
              onClick={submit}
              disabled={!input.trim()}
              className="shrink-0 p-2 bg-foreground text-primary-foreground rounded-r hover:bg-primary/90 disabled:opacity-50  transition-opacity duration-100"
            >
              <CornerDownLeft className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationList({
  conversations,
  currentConversation,
  onSelect,
  onCreate,
}: {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="p-2 border-b border-border/50">
      <Button
        onClick={onCreate}
        size="sm"
        variant="ghost"
        className="w-full flex gap-2 px-3 py-2 text-sm rounded-none"
      >
        <Plus className="w-4 h-4" />
        New Conversation
      </Button>
      <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={cn(
              "w-full text-left px-3 py-2 text-sm truncate rounded-none transition-colors",
              currentConversation?.id === conv.id
                ? "bg-primary/20 text-foreground"
                : "hover:bg-muted text-muted-foreground",
            )}
          >
            {conv.title}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatSidebar({ className }: { className?: string } = {}) {
  const chatSidebarOpen = useUIMenuStore(selectChatSidebarOpen);
  const closeChatSidebar = useUIMenuStore((s) => s.closeChatSidebar);

  const activeProjectId = useProjectStore((s) => s.selectedProjectId);
  const streamChunk = useChatStore((s) => s.streamChunk);
  const queuedMessages = useChatStore((s) => s.queuedMessages);

  const {
    conversations,
    currentConversation,
    messages,
    isLoading,
    isStreaming,
    fetchConversations,
    createConversation,
    selectConversation,
    sendMessage,
    stopStreaming,
  } = useChatStore();

  useEffect(() => {
    if (activeProjectId) {
      fetchConversations(activeProjectId);
    }
  }, [activeProjectId]);

  const handleSendMessage = async (content: string) => {
    // Use the STORE value after createConversation, not the stale closure.
    // createConversation updates currentConversation in the store, but the
    // local `currentConversation` variable is captured at render time and
    // will still be null after the await.  We use getState() for the fresh value.
    if (!currentConversation && activeProjectId) {
      const newConv = await createConversation(activeProjectId);
      if (newConv) {
        await sendMessage(content);
      }
    } else if (currentConversation) {
      await sendMessage(content);
    }
  };

  if (!chatSidebarOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "absolute top-0 right-0 flex flex-col backdrop-blur-xl shadow-2xl z-20",
        "bg-panel/95 border-l border-panel-border overflow-hidden",
        "transition-all duration-200 ease-out",
        className,
      )}
      style={{
        width: CHAT_SIDEBAR_WIDTH,
        height: "100%",
        transformOrigin: "right",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Chat</span>
        </div>
        <button
          type="button"
          onClick={closeChatSidebar}
          className="p-1 hover:opacity-100 opacity-70 hover:bg-accent rounded-none transition-colors"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>
      </div>

      <ConversationList
        conversations={conversations}
        currentConversation={currentConversation}
        onSelect={selectConversation}
        onCreate={() => activeProjectId && createConversation(activeProjectId)}
      />

      <div className="flex-1 overflow-hidden">
        <ChatView
          projectId={activeProjectId!}
          messages={messages}
          isLoading={isLoading}
          isStreaming={isStreaming}
          streamChunk={streamChunk}
          queuedMessages={queuedMessages}
          onSendMessage={handleSendMessage}
          onStopStreaming={stopStreaming}
        />
      </div>
    </motion.div>
  );
}