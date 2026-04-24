import { z } from 'zod';
import { router, protectedProcedure, teamProcedure } from './trpc.js';
import { chatService } from '../services/chat-service.js';
import { generateId } from '../utils/id.js';
import { TRPCError } from '@trpc/server';
import { eq, and, desc } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { db } from '../db/index.js';
import { IEventBus } from '#shared/messaging/event-bus.types.js';

export function createChatRouter({ eventBus }: { eventBus: IEventBus }) {
  return router({
    create: teamProcedure
      .input(z.object({
        projectId: z.string(),
        title: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const userId = ctx.user?.id;
          const conversation = await chatService.createConversation(
            input.projectId,
            userId,
            input.title
          );

          if (eventBus) {
            // used to push conversations to all connected clients
            await eventBus.publishPipelineEvent({
              type: 'CHAT_CONVERSATION',
              projectId: input.projectId,
              teamId: ctx.teamId || '',
              userId: userId || '',
              timestamp: new Date().toISOString(),
              payload: {
                conversationId: conversation.id,
                title: conversation.title,
                action: 'created',
              },
            });
          }

          return { conversation };
        } catch (err) {
          console.error('[ChatRouter] Failed to create conversation:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create conversation.' });
        }
      }),

    list: teamProcedure
      .input(z.object({
        projectId: z.string(),
        limit: z.number().int().positive().max(100).default(50),
      }))
      .query(async ({ input }) => {
        try {
          const conversations = await chatService.getConversationsForProject(input.projectId, input.limit);
          return { conversations };
        } catch (err) {
          console.error('[ChatRouter] Failed to list conversations:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list conversations.' });
        }
      }),

    get: teamProcedure
      .input(z.object({
        conversationId: z.string(),
      }))
      .query(async ({ input }) => {
        try {
          const conversation = await chatService.getConversation(input.conversationId);
          if (!conversation) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' });
          }
          const messages = await chatService.getMessages(input.conversationId);
          return { conversation, messages };
        } catch (err) {
          if (err instanceof TRPCError) throw err;
          console.error('[ChatRouter] Failed to get conversation:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get conversation.' });
        }
      }),

    update: teamProcedure
      .input(z.object({
        conversationId: z.string(),
        title: z.string().optional(),
        contextSummary: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const updates: { title?: string; contextSummary?: string } = {};
          if (input.title) updates.title = input.title;
          if (input.contextSummary) updates.contextSummary = input.contextSummary;

          const conversation = await chatService.updateConversation(input.conversationId, updates);
          if (!conversation) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' });
          }

          if (eventBus) {
            // used to push conversations to all connected clients
            await eventBus.publishPipelineEvent({
              type: 'CHAT_CONVERSATION',
              projectId: conversation.projectId,
              teamId: ctx.teamId || '',
              userId: ctx.user?.id || '',
              timestamp: new Date().toISOString(),
              payload: {
                conversationId: conversation.id,
                title: conversation.title,
                action: 'updated',
              },
            });
          }

          return { conversation };
        } catch (err) {
          if (err instanceof TRPCError) throw err;
          console.error('[ChatRouter] Failed to update conversation:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update conversation.' });
        }
      }),

    delete: teamProcedure
      .input(z.object({
        conversationId: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          await chatService.deleteConversation(input.conversationId);
          return { success: true };
        } catch (err) {
          console.error('[ChatRouter] Failed to delete conversation:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete conversation.' });
        }
      }),

    send: teamProcedure
      .input(z.object({
        conversationId: z.string(),
        content: z.string().min(1).max(10000),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const userId = ctx.user?.id;

          const userMessage = await chatService.addMessage(
            input.conversationId,
            'user',
            input.content,
            userId
          );

          if (eventBus) {
            // used to push messages to all connected clients
            await eventBus.publishPipelineEvent({
              type: 'CHAT_MESSAGE',
              projectId: '',
              teamId: ctx.teamId || '',
              userId: userId || '',
              timestamp: new Date().toISOString(),
              payload: {
                conversationId: input.conversationId,
                messageId: userMessage.id,
                role: 'user',
                content: input.content,
              },
            });
          }

          return {
            message: userMessage,
            conversationId: input.conversationId,
          };
        } catch (err) {
          console.error('[ChatRouter] Failed to send message:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send message.' });
        }
      }),

    messages: teamProcedure
      .input(z.object({
        conversationId: z.string(),
        limit: z.number().int().positive().max(200).default(100),
      }))
      .query(async ({ input }) => {
        try {
          const messages = await chatService.getMessages(input.conversationId, input.limit);
          return { messages };
        } catch (err) {
          console.error('[ChatRouter] Failed to get messages:', err);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get messages.' });
        }
      }),
  });
}

export type ChatRouter = ReturnType<typeof createChatRouter>;