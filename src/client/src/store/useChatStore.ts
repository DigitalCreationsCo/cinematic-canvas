import { create } from 'zustand';
import { trpcClient as api } from '../lib/trpc.js';

export interface Conversation {
  id: string;
  projectId: string;
  userId: string | null;
  title: string;
  contextSummary: string | null;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isComplete: boolean;
  tokenCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface ChatState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  streamChunk: string;
  viewMode: 'events' | 'chat';

  setViewMode: (mode: 'events' | 'chat') => void;
  fetchConversations: (projectId: string) => Promise<void>;
  createConversation: (projectId: string, title?: string) => Promise<Conversation>;
  selectConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  clearCurrentConversation: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  streamChunk: '',
  viewMode: 'events',

  setViewMode: (mode) => set({ viewMode: mode }),

  fetchConversations: async (projectId) => {
    set({ isLoading: true });
    try {
      const result = await api.chat.list.query({ projectId });
      set({ conversations: result.conversations, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      set({ isLoading: false });
    }
  },

  createConversation: async (projectId, title) => {
    set({ isLoading: true });
    try {
      const result = await api.chat.create.mutate({ projectId, title });
      set((state) => ({
        conversations: [result.conversation, ...state.conversations],
        currentConversation: result.conversation,
        messages: [],
        isLoading: false,
        viewMode: 'chat',
      }));
      return result.conversation;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  selectConversation: async (conversationId) => {
    set({ isLoading: true });
    try {
      const result = await api.chat.get.query({ conversationId });
      set({ 
        currentConversation: result.conversation, 
        messages: result.messages, 
        isLoading: false,
        viewMode: 'chat',
      });
    } catch (error) {
      console.error('Failed to select conversation:', error);
      set({ isLoading: false });
    }
  },

  sendMessage: async (content) => {
    const { currentConversation } = get();
    if (!currentConversation) return;

    set({ isStreaming: true, streamChunk: '' });
    
    try {
      const result = await api.chat.send.mutate({
        conversationId: currentConversation.id,
        content,
      });

      set((state) => ({
        messages: [...state.messages, result.message],
        streamChunk: '',
      }));
    } catch (error) {
      console.error('Failed to send message:', error);
      set({ isStreaming: false });
    }
  },

  clearCurrentConversation: () => {
    set({ 
      currentConversation: null, 
      messages: [], 
      streamChunk: '' 
    });
  },
}));