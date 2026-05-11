import { create } from 'zustand';
import { trpcClient as api } from '#client/lib/trpc.js';
import { addToHistory, getHistory } from '#client/services/chatMessageHistory.js';
import { generateId } from '#shared/utils/id.js';
import { Conversation, Message as IMessage } from '#shared/types/chat.types.js';


interface Message extends IMessage {
  pendingId?: string;
}

interface ChatState {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  streamChunk: string;
  viewMode: 'events' | 'chat';
  messageHistory: string[];
  historyIndex: number;
  /** Incremented to trigger focus on the chat input from external components */
  chatInputFocusTrigger: number;

  /** Messages queued while the agent is streaming — concatenated and sent when the stream completes */
  queuedMessages: string[];

  setViewMode: (mode: 'events' | 'chat') => void;
  fetchConversations: (projectId: string) => Promise<void>;
  createConversation: (projectId: string, title?: string) => Promise<Conversation>;
  selectConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => Promise<void>;
  processQueue: () => Promise<void>;
  clearCurrentConversation: () => void;
  appendMessage: (content: string) => void;
  removePendingMessage: (pendingId: string) => void;
  loadMessageHistory: () => Promise<void>;
  navigateHistory: (direction: 'up' | 'down') => void;
  focusChatInput: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  streamChunk: '',
  viewMode: 'events',
  messageHistory: [],
  historyIndex: -1,
  chatInputFocusTrigger: 0,
  queuedMessages: [],

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
        conversations: [result.conversation as Conversation, ...state.conversations],
        currentConversation: result.conversation as Conversation,
        messages: [],
        isLoading: false,
        viewMode: 'chat',
      }));
      return result.conversation as Conversation;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  selectConversation: async (conversationId) => {
    set({ isLoading: true, queuedMessages: [], isStreaming: false, streamChunk: '' });
    try {
      const result = await api.chat.get.query({ conversationId });
      set({
        currentConversation: result.conversation as Conversation,
        messages: result.messages as Message[],
        isLoading: false,
        viewMode: 'chat',
      });
      get().loadMessageHistory();
    } catch (error) {
      console.error('Failed to select conversation:', error);
      set({ isLoading: false });
    }
  },

  sendMessage: async (content) => {
    const { currentConversation, isStreaming } = get();
    if (!currentConversation) return;

    // If the agent is currently streaming, queue the message for later
    if (isStreaming) {
      await addToHistory(currentConversation.id, content);
      set((state) => ({
        queuedMessages: [...state.queuedMessages, content],
      }));
      return;
    }

    const pendingId = generateId();
    set({ isStreaming: true, streamChunk: '' });
    get().appendMessage(content, pendingId);
    await addToHistory(currentConversation.id, content);

    try {
      const result = await api.chat.send.mutate({
        conversationId: currentConversation.id,
        content,
      });

      // Replace the optimistic pending message with the server-confirmed one
      set((state) => ({
        messages: state.messages.map(m =>
          m.pendingId === pendingId
            ? { ...result.message, id: result.message.id } as Message
            : m
        ).filter(m => !m.pendingId || m.id !== pendingId),
        // NOTE: isStreaming stays true — the SSE handler (usePipelineEvents)
        // will set it to false when the AI response stream completes.
      }));
    } catch (error) {
      console.error('Failed to send message:', error);
      set((state) => ({
        messages: state.messages.filter(m => m.pendingId !== pendingId),
        isStreaming: false,
      }));
    }
  },

  stopStreaming: async () => {
    const { currentConversation } = get();
    if (!currentConversation) return;

    // Clear the message queue — user explicitly wants to stop everything
    set({ queuedMessages: [] });

    try {
      await api.chat.stop.mutate({
        conversationId: currentConversation.id,
      });
    } catch (error) {
      console.error('Failed to stop streaming:', error);
    }
  },

  processQueue: async () => {
    const { queuedMessages } = get();
    if (queuedMessages.length === 0) return;

    const concatenated = queuedMessages.join('\n\n');
    set({ queuedMessages: [] });
    // isStreaming is already false at this point (the SSE handler just cleared it),
    // so sendMessage will go through the normal flow rather than re-queueing.
    await get().sendMessage(concatenated);
  },

  appendMessage: (content, pendingId?: string) => {
    const { currentConversation } = get();
    if (!currentConversation) return;

    const id = pendingId || generateId();
    const now = new Date();
    const optimisticMessage: Message = {
      id,
      conversationId: currentConversation.id,
      userId: '',
      role: 'human',
      content,
      isComplete: false,
      tokenCount: 0,
      metadata: {},
      createdAt: now,
      pendingId: id,
    };

    set((state) => ({
      messages: [...state.messages, optimisticMessage],
    }));
  },

  removePendingMessage: (pendingId) => {
    set((state) => ({
      messages: state.messages.filter(m => m.pendingId !== pendingId),
    }));
  },

  loadMessageHistory: async () => {
    const { currentConversation, messageHistory } = get();
    if (!currentConversation || messageHistory.length > 0) return;

    try {
      const history = await getHistory(currentConversation.id);
      set({ messageHistory: history.map(h => h.content) });
    } catch (error) {
      console.error('Failed to load message history:', error);
    }
  },

  navigateHistory: (direction) => {
    const { messageHistory, historyIndex, currentConversation } = get();
    if (!currentConversation || messageHistory.length === 0) return;

    let newIndex: number;
    if (direction === 'up') {
      newIndex = historyIndex >= messageHistory.length - 1 ? messageHistory.length - 1 : historyIndex + 1;
    } else {
      newIndex = historyIndex <= 0 ? -1 : historyIndex - 1;
    }
    set({ historyIndex: newIndex });
  },

  focusChatInput: () => {
    set((state) => ({ chatInputFocusTrigger: state.chatInputFocusTrigger + 1 }));
  },

  clearCurrentConversation: () => {
    set({
      currentConversation: null,
      messages: [],
      streamChunk: '',
      messageHistory: [],
      historyIndex: -1,
      queuedMessages: [],
      isStreaming: false,
    });
  },
}));