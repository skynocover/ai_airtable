import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  API_ERROR_CODES,
  createChatSessionSchema,
  patchActionSchema,
  sendMessageSchema,
  type ChatAction,
  type ChatMessageRow,
  type ChatSessionRow,
  type Collection,
  type CollectionRow,
} from "@ai-airtable/shared";
import type { AppBindings } from "../types";
import { globalDb, type ScopedDb } from "../lib/db";
import { toCollection } from "../lib/collections";
import { loadMessage, loadSession, toChatMessage, toChatSession } from "../lib/chat";
import { newChatMessageId, newChatSessionId } from "../lib/ids";
import { buildSystemPrompt } from "../ai/prompts";
import { AI_TOOLS } from "../ai/tools";
import { executeTool } from "../ai/handlers";
import { streamTurn, type AnthropicMessage, type ContentBlock } from "../ai/client";

export const chatRoutes = new Hono<AppBindings>();

/** chat 歷史帶進 context 的最近則數上限(避免 context 無限增長燒 token)。 */
const HISTORY_LIMIT = 20;
/** tool loop 最多輪數(防呆)。 */
const MAX_TURNS = 5;

function notFound() {
  return { error: { code: API_ERROR_CODES.NOT_FOUND, message: "找不到此對話" } } as const;
}
function validationError(message: string) {
  return { error: { code: API_ERROR_CODES.VALIDATION, message } } as const;
}

// ───────────────────────── Sessions CRUD ─────────────────────────

/** GET /api/v1/chat/sessions — 當前 workspace/user 的 session 列表。 */
chatRoutes.get("/sessions", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const rows = await db.select<ChatSessionRow>("chat_sessions", {
    where: "user_id = ?",
    params: [userId],
    orderBy: "last_message_at desc, created_at desc",
  });
  return c.json({ sessions: rows.map(toChatSession) });
});

/** POST /api/v1/chat/sessions — 建立 session(綁定當前 workspace/user、可選 context collection）。 */
chatRoutes.post("/sessions", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createChatSessionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(validationError(parsed.error.issues[0]?.message ?? "輸入無效"), 400);
  }
  const db = c.get("db");
  const userId = c.get("userId");
  const id = newChatSessionId();
  const now = Date.now();
  await db.insert("chat_sessions", {
    id,
    user_id: userId,
    context_collection_id: parsed.data.context_collection_id ?? null,
    title: parsed.data.title ?? null,
    last_message_at: null,
    created_at: now,
    updated_at: now,
  });
  const row = await loadSession(db, id);
  return c.json(toChatSession(row!), 201);
});

/** DELETE /api/v1/chat/sessions/:id — 刪除 session(及其訊息)。 */
chatRoutes.delete("/sessions/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const session = await loadSession(db, id);
  if (!session) return c.json(notFound(), 404);
  // chat 不在軟刪範圍(鐵則 #7 針對 collections/records)—— 用原生 delete,仍以 workspace_id 限當前 workspace。
  await c.env.DB.prepare("DELETE FROM chat_messages WHERE session_id = ? AND workspace_id = ?")
    .bind(id, db.workspaceId)
    .run();
  await c.env.DB.prepare("DELETE FROM chat_sessions WHERE id = ? AND workspace_id = ?")
    .bind(id, db.workspaceId)
    .run();
  return c.json({ ok: true });
});

/** GET /api/v1/chat/sessions/:id/messages — 歷史訊息(含 actions)。 */
chatRoutes.get("/sessions/:id/messages", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const session = await loadSession(db, id);
  if (!session) return c.json(notFound(), 404);
  const rows = await db.select<ChatMessageRow>("chat_messages", {
    where: "session_id = ?",
    params: [id],
    orderBy: "created_at asc",
  });
  return c.json({
    session: toChatSession(session),
    messages: rows.map(toChatMessage),
  });
});

/** PATCH /api/v1/chat/messages/:id — 更新提案卡片狀態(前端 accept/reject 後回寫)。 */
chatRoutes.patch("/messages/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = patchActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(validationError(parsed.error.issues[0]?.message ?? "輸入無效"), 400);
  }
  const db = c.get("db");
  const id = c.req.param("id");
  const row = await loadMessage(db, id);
  if (!row) return c.json(notFound(), 404);

  const actions: ChatAction[] = row.actions_json ? JSON.parse(row.actions_json) : [];
  const action = actions.find((a) => a.id === parsed.data.action_id);
  if (!action || action.type !== "schema_operation") {
    return c.json(notFound(), 404);
  }
  action.status = parsed.data.status;
  await db.update(
    "chat_messages",
    { actions_json: JSON.stringify(actions) },
    { where: "id = ?", params: [id] },
  );
  return c.json({ ok: true, actions });
});

// ───────────────────────── 發送訊息(SSE)─────────────────────────

/**
 * POST /api/v1/chat/sessions/:id/messages
 * 持久化 user 訊息 → 呼叫 AI(帶 tools,tool loop）→ SSE 串流 text/action → 持久化 assistant 訊息。
 * SSE 事件:text {delta} / action {card} / error {message} / done {message_id}。
 */
chatRoutes.post("/sessions/:id/messages", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(validationError(parsed.error.issues[0]?.message ?? "輸入無效"), 400);
  }
  const db = c.get("db");
  const env = c.env;
  const workspaceId = c.get("workspaceId");
  const sessionId = c.req.param("id");
  const session = await loadSession(db, sessionId);
  if (!session) return c.json(notFound(), 404);

  const userText = parsed.data.content;
  const now = Date.now();

  // 1. 持久化 user 訊息。
  const userMsgId = newChatMessageId();
  await db.insert("chat_messages", {
    id: userMsgId,
    session_id: sessionId,
    role: "user",
    content: userText,
    actions_json: null,
    created_at: now,
  });

  // 2. system prompt:workspace collections 簡介 + 當前綁定 collection 完整 schema。
  const colRows = await db.select<CollectionRow>("collections", {
    where: "deleted_at IS NULL",
    orderBy: "created_at desc",
  });
  const collections: Collection[] = colRows.map(toCollection);
  const context = session.context_collection_id
    ? (collections.find((col) => col.id === session.context_collection_id) ?? null)
    : null;
  const system = buildSystemPrompt({ collections, context, nowIso: new Date(now).toISOString() });

  // 3. 歷史(最近 N 則,含剛存的 user 訊息);只帶 role/text。
  const anthMessages = await buildHistory(db, sessionId);

  return streamSSE(c, async (stream) => {
    const cards: ChatAction[] = [];
    const assistantMsgId = newChatMessageId();
    let fullText = "";
    let inTok = 0;
    let outTok = 0;
    let persisted = false;

    const persistAssistant = async () => {
      if (persisted) return;
      persisted = true;
      const content = fullText.trim() || "(已處理你的請求)";
      const doneAt = Date.now();
      await db.insert("chat_messages", {
        id: assistantMsgId,
        session_id: sessionId,
        role: "assistant",
        content,
        actions_json: cards.length ? JSON.stringify(cards) : null,
        created_at: doneAt,
      });
      await db.update(
        "chat_sessions",
        {
          last_message_at: doneAt,
          updated_at: doneAt,
          ...(session.title ? {} : { title: userText.slice(0, 40) }),
        },
        { where: "id = ?", params: [sessionId] },
      );
      // token 用量記錄(供 #6;本 change 不限制)。
      if (inTok + outTok > 0) {
        await globalDb(env.DB).addAiTokensUsed(workspaceId, inTok + outTok);
      }
    };

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const result = await streamTurn(
          env,
          { system, messages: anthMessages, tools: AI_TOOLS },
          async (delta) => {
            await stream.writeSSE({ event: "text", data: JSON.stringify({ delta }) });
          },
        );
        if (result.text) fullText += (fullText ? "\n" : "") + result.text;
        inTok += result.usage.input_tokens;
        outTok += result.usage.output_tokens;
        anthMessages.push({ role: "assistant", content: result.content });

        if (result.stopReason !== "tool_use" || result.toolUses.length === 0) break;

        // 執行 tool，收集卡片與 tool_result。
        const toolResults: ContentBlock[] = [];
        for (const use of result.toolUses) {
          const outcome = await executeTool(db, use.name, use.input);
          cards.push(outcome.card);
          await stream.writeSSE({ event: "action", data: JSON.stringify({ card: outcome.card }) });
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: outcome.toolResult.content,
            is_error: outcome.toolResult.isError,
          });
        }
        anthMessages.push({ role: "user", content: toolResults });
      }

      await persistAssistant();
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ message_id: assistantMsgId }),
      });
    } catch (e) {
      // 中斷:以已完成內容持久化(前端可重載歷史),回報錯誤。
      await persistAssistant().catch(() => {});
      const message = e instanceof Error ? e.message : "AI 處理失敗,請稍後再試";
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message }) });
    }
  });
});

/** 讀最近 N 則訊息 → Anthropic messages(只帶 role/text;確保以 user 開頭)。 */
async function buildHistory(db: ScopedDb, sessionId: string): Promise<AnthropicMessage[]> {
  const rows = await db.select<ChatMessageRow>("chat_messages", {
    where: "session_id = ?",
    params: [sessionId],
    orderBy: "created_at desc",
    limit: HISTORY_LIMIT,
  });
  // 取回是新→舊,反轉成舊→新。
  const ordered = rows.reverse();
  const msgs: AnthropicMessage[] = ordered.map((r) => ({
    role: r.role,
    content: r.content || "(空白)",
  }));
  // Anthropic 要求首則為 user:砍掉開頭的 assistant。
  while (msgs.length && msgs[0].role === "assistant") msgs.shift();
  return msgs;
}
