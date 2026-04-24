import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, MessageCircle, Send, Plus, Loader2 } from 'lucide-react';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { MESSAGES_SIDEBAR_WIDTH, selectMessagesSidebarOpen, useUIMenuStore } from '../../../store/useUIMenuStore.js';
import { useChatStore, type Message, type Conversation } from '../../../store/useChatStore.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { MessageList } from '../../MessageList.js';
import { cn } from '../../../lib/utils.js';

function ChatView({ 
  messages, 
  isLoading, 
  isStreaming,
  onSendMessage,
}: { 
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  onSendMessage: (content: string) => void;
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !isLoading && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            Start a conversation with AI
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex flex-col gap-1 p-3 rounded-none text-sm',
              msg.role === 'user' 
                ? 'bg-primary/10 ml-4' 
                : 'bg-muted mr-4'
            )}
          >
            <span className="text-xs text-muted-foreground font-medium">
              {msg.role === 'user' ? 'You' : 'AI'}
            </span>
            <p className="whitespace-pre-wrap break-words">
              {msg.content}
              {msg.role === 'assistant' && !msg.isComplete && (
                <span className="inline-flex ml-1">
                  <span className="animate-pulse">▊</span>
                </span>
              )}
            </p>
          </div>
        ))}
        {isStreaming && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm ml-4">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-border/50">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask AI..."
            className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-none bg-background border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="shrink-0 p-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-none transition-colors"
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
      <button
        onClick={onCreate}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-primary/10 hover:bg-primary/20 rounded-none transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Conversation
      </button>
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

export function MessagesSidebar({ className }: { className?: string } = {}) {
  const messagesSidebarOpen = useUIMenuStore(selectMessagesSidebarOpen);
  const closeMessagesSidebar = useUIMenuStore((s) => s.closeMessagesSidebar);
  const events = usePipelineStore((s) => s.events);
  
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  
  const { 
    viewMode, 
    setViewMode,
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
    if (viewMode === 'chat' && activeProjectId) {
      fetchConversations(activeProjectId);
    }
  }, [viewMode, activeProjectId]);

  const handleSendMessage = async (content: string) => {
    if (!currentConversation && activeProjectId) {
      await createConversation(activeProjectId);
    }
    if (currentConversation) {
      await sendMessage(content);
    }
  };

  if (!messagesSidebarOpen) return null;

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
        width: MESSAGES_SIDEBAR_WIDTH,
        height: '100%',
        transformOrigin: 'right',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Messages</span>
        </div>
        <button
          type="button"
          onClick={closeMessagesSidebar}
          className="p-1 hover:opacity-100 opacity-70 hover:bg-accent rounded-none transition-colors"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>
      </div>

      <div className="flex border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={() => setViewMode('events')}
          className={cn(
            "flex-1 px-4 py-2 text-sm font-medium transition-colors",
            viewMode === 'events' 
              ? "bg-primary/10 text-foreground" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Events ({events.length})
        </button>
        <button
          type="button"
          onClick={() => setViewMode('chat')}
          className={cn(
            "flex-1 px-4 py-2 text-sm font-medium transition-colors",
            viewMode === 'chat' 
              ? "bg-primary/10 text-foreground" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Chat
        </button>
      </div>

      {viewMode === 'chat' && (
        <ConversationList
          conversations={conversations}
          currentConversation={currentConversation}
          onSelect={selectConversation}
          onCreate={() => activeProjectId && createConversation(activeProjectId)}
        />
      )}

      <div className="flex-1 overflow-hidden">
        {viewMode === 'events' ? (
          <MessageList events={events} />
        ) : (
          <ChatView
            messages={messages}
            isLoading={isLoading}
            isStreaming={isStreaming}
            onSendMessage={handleSendMessage}
          />
        )}
      </div>
    </motion.div>
  );
}