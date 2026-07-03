import type { ChatAction, ChatMessage, ChatSession } from "@ai-airtable/shared";
import { ApiError } from "./api";

/**
 * Chat API + SSE 串流。send 走 fetch 讀 ReadableStream,解析我方 SSE 事件:
 *   text {delta} / action {card} / error {message} / done {message_id}。
 */

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (res.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "unauthorized", "請先登入");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? "error",
      body?.error?.message ?? "發生錯誤",
    );
  }
  return (await res.json()) as T;
}

export interface SendHandlers {
  onText: (delta: string) => void;
  onAction: (card: ChatAction) => void;
  onError: (message: string) => void;
  onDone: (messageId: string) => void;
}

export const chatApi = {
  listSessions: () =>
    json<{ sessions: ChatSession[] }>("/api/v1/chat/sessions").then((r) => r.sessions),

  createSession: (contextCollectionId: string | null) =>
    json<ChatSession>("/api/v1/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ context_collection_id: contextCollectionId }),
    }),

  deleteSession: (id: string) =>
    json<{ ok: true }>(`/api/v1/chat/sessions/${id}`, { method: "DELETE" }),

  getMessages: (id: string) =>
    json<{ session: ChatSession; messages: ChatMessage[] }>(`/api/v1/chat/sessions/${id}/messages`),

  /** accept/reject 提案後回寫卡片狀態。 */
  patchAction: (messageId: string, actionId: string, status: "applied" | "rejected") =>
    json<{ ok: true; actions: ChatAction[] }>(`/api/v1/chat/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ action_id: actionId, status }),
    }),

  /** 發送訊息並串流回應。 */
  async send(sessionId: string, content: string, h: SendHandlers): Promise<void> {
    const res = await fetch(`/api/v1/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok || !res.body) {
      h.onError("AI 處理失敗,請稍後再試");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        dispatchEvent(chunk, h);
      }
    }
  },
};

/** 解析一個 SSE event 區塊(event: X / data: {...})。 */
function dispatchEvent(chunk: string, h: SendHandlers): void {
  let event = "message";
  let data = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }
  switch (event) {
    case "text":
      h.onText(String(payload.delta ?? ""));
      break;
    case "action":
      h.onAction(payload.card as ChatAction);
      break;
    case "error":
      h.onError(String(payload.message ?? "AI 處理失敗"));
      break;
    case "done":
      h.onDone(String(payload.message_id ?? ""));
      break;
  }
}
