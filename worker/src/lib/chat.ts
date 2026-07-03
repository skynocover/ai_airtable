import type {
  ChatAction,
  ChatMessage,
  ChatMessageRow,
  ChatSession,
  ChatSessionRow,
} from "@ai-airtable/shared";
import type { ScopedDb } from "./db";

/** 載入 session 列(經 scopedDb,自動限當前 workspace)。 */
export async function loadSession(db: ScopedDb, id: string): Promise<ChatSessionRow | null> {
  return db.first<ChatSessionRow>("chat_sessions", { where: "id = ?", params: [id] });
}

/** 載入 message 列(經 scopedDb,自動限當前 workspace)。 */
export async function loadMessage(db: ScopedDb, id: string): Promise<ChatMessageRow | null> {
  return db.first<ChatMessageRow>("chat_messages", { where: "id = ?", params: [id] });
}

export function toChatSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    context_collection_id: row.context_collection_id,
    title: row.title,
    last_message_at: row.last_message_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseActions(json: string | null): ChatAction[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as ChatAction[]) : [];
  } catch {
    return [];
  }
}

export function toChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    actions: parseActions(row.actions_json),
    created_at: row.created_at,
  };
}
