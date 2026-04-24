import { Dexie, type Table } from 'dexie';
import { generateId } from '#shared/utils/id.js';

const DB_NAME = 'cinematic-canvas-chat';
const STORE_NAME = 'messageHistory';
const MAX_HISTORY = 20;

export interface ChatMessageHistory {
  id: string;
  conversationId: string;
  content: string;
  createdAt: Date;
}

class ChatDB extends Dexie {
  messageHistory!: Table<ChatMessageHistory, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      messageHistory: 'id, conversationId, createdAt',
    });
  }
}

const db = new ChatDB();

export async function addToHistory(conversationId: string, content: string): Promise<void> {
  const id = generateId();
  await db.messageHistory.add({
    id,
    conversationId,
    content,
    createdAt: new Date(),
  });

  const all = await db.messageHistory.where('conversationId').equals(conversationId).reverse().sortBy('createdAt');
  if (all.length > MAX_HISTORY) {
    const toDelete = all.slice(MAX_HISTORY).map(m => m.id);
    await db.messageHistory.bulkDelete(toDelete);
  }
}

export async function getHistory(conversationId: string, limit = MAX_HISTORY): Promise<ChatMessageHistory[]> {
  const all = await db.messageHistory.where('conversationId').equals(conversationId).reverse().sortBy('createdAt');
  return all.slice(0, limit);
}

export async function clearHistory(conversationId: string): Promise<void> {
  await db.messageHistory.where('conversationId').equals(conversationId).delete();
}

export async function getAllHistory(): Promise<ChatMessageHistory[]> {
  return db.messageHistory.orderBy('createdAt').reverse().toArray();
}