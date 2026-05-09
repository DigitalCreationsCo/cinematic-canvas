import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, MessageCircle, Send, Plus, Loader2 } from 'lucide-react';

import { usePipelineStore } from '#client/store/usePipelineStore.js';
import { CHAT_SIDEBAR_WIDTH, selectChatSidebarOpen, useUIMenuStore } from '#client/store/useUIMenuStore.js';
import { useChatStore } from '#client/store/useChatStore.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { cn } from '#client/lib/utils.js';
import { Button } from '#client/components/ui/button.js';
import { Conversation, Message } from '#shared/types/chat.types.js';

function ChatView({
  messages,
  isLoading,
  isStreaming,
  streamChunk,
  onSendMessage,
}: {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  streamChunk: string;
  onSendMessage: (content: string) => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;

  const { messageHistory, navigateHistory, loadMessageHistory } = useChatStore();
  const chatInputFocusTrigger = useChatStore((s) => s.chatInputFocusTrigger);

  useEffect(() => {
    if (messages.length > 0 && !inputRef.current) {
      loadMessageHistory();
    }
  }, [messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (chatInputFocusTrigger > 0) {
      inputRef.current?.focus();
    }
  }, [chatInputFocusTrigger]);

  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    } else if (e.key === 'ArrowUp' && !input) {
      e.preventDefault();
      const { messageHistory: hist, historyIndex, navigateHistory: nav } = useChatStore.getState();
      if (hist.length > 0) {
        nav('up');
        const newIndex = useChatStore.getState().historyIndex;
        setInput(hist[newIndex] || '');
      }
    } else if (e.key === 'ArrowDown' && !input) {
      e.preventDefault();
      const { messageHistory: hist, historyIndex, navigateHistory: nav } = useChatStore.getState();
      if (hist.length > 0 && historyIndex >= 0) {
        nav('down');
        const newIndex = useChatStore.getState().historyIndex;
        setInput(newIndex >= 0 ? hist[newIndex] : '');
      }
    }
  };

  return (
    <div className={cn("flex flex-col h-full", !hasMessages && "justify-start")}>
      <div className="overflow-y-auto px-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex flex-col gap-1 p-3 rounded-none text-sm',
              msg.role === 'ai'
                ? 'bg-primary/10 ml-4'
                : 'bg-muted mr-4'
            )}
          >
            <span className="text-xs text-muted-foreground font-medium">
              {msg.role === 'human' ? 'You' : 'AI'}
            </span>
            <p className="whitespace-pre-wrap break-words">
              {msg.content}
              {msg.role === 'ai' && !msg.isComplete && (
                <span className="inline-flex ml-1">
                  <span className="animate-pulse">▊</span>
                </span>
              )}
            </p>
          </div>
        ))}
        {isStreaming && (
          <div className="flex flex-col gap-1 p-3 rounded-none text-sm bg-primary/10 ml-4">
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

      <form onSubmit={handleSubmit} className={cn("flex-1 p-3 group", hasMessages && "mt-4")}>
        <div className="flex">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasMessages ? "Ask AI..." : "Start a conversation with the assistant"}
            className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-l bg-background border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="shrink-0 p-2 bg-primary text-primary-foreground rounded-r hover:bg-primary/90 disabled:opacity-50 rounded-none transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
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
              'w-full text-left px-3 py-2 text-sm truncate rounded-none transition-colors',
              currentConversation?.id === conv.id
                ? 'bg-primary/20 text-foreground'
                : 'hover:bg-muted text-muted-foreground'
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
        className
      )}
      style={{
        width: CHAT_SIDEBAR_WIDTH,
        height: '100%',
        transformOrigin: 'right',
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
          messages={messages}
          isLoading={isLoading}
          isStreaming={isStreaming}
          streamChunk={streamChunk}
          onSendMessage={handleSendMessage}
        />
      </div>
    </motion.div>
  );
}
