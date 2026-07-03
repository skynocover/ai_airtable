import type { Env } from "../types";

/**
 * AI Gateway client —— 所有 Claude 呼叫的唯一出口(鐵則 #3)。
 *
 * 走 Cloudflare AI Gateway(統一 log / 成本 / rate limit / 快取),Anthropic key 走 Worker secret。
 * 在 Workers 上 AI Gateway 本質是「換一個 URL」,而我們需要對 SSE 串流做原始轉發(→ 瀏覽器)
 * 兼服務端解析(→ 持久化 + tool_use),故直接以 fetch 呼叫 Anthropic Messages API,不引入 SDK。
 *
 * 模型:Claude Sonnet(CLAUDE.md 指定;含 vision,vision 留給 #4)。thinking 關閉 —— chat tool-calling
 * 不需延伸推理,關閉可簡化串流、壓低 token(利於 #6 配額)。
 *
 * 不訓練:AI Gateway + Anthropic 商用 API 預設不用於訓練(Week 0 spike 已確認),無需在請求帶額外設定。
 */

const MODEL = "claude-sonnet-5";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;

/** 由 env 組出 AI Gateway 的 Anthropic messages endpoint;未設定即拋錯(絕不 silent 繞過 gateway)。 */
function messagesUrl(env: Env): string {
  if (env.AI_GATEWAY_BASE_URL) {
    return `${env.AI_GATEWAY_BASE_URL.replace(/\/$/, "")}/v1/messages`;
  }
  const account = env.AI_GATEWAY_ACCOUNT_ID;
  const name = env.AI_GATEWAY_NAME;
  if (!account || !name) {
    throw new Error(
      "AI Gateway 未設定:需要 AI_GATEWAY_ACCOUNT_ID + AI_GATEWAY_NAME(或 AI_GATEWAY_BASE_URL)",
    );
  }
  return `https://gateway.ai.cloudflare.com/v1/${account}/${name}/anthropic/v1/messages`;
}

// ───────────────────────── 型別 ─────────────────────────

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Anthropic content block(我們用到的幾種)。 */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface TurnResult {
  stopReason: string;
  /** 這一輪 assistant 產生的文字。 */
  text: string;
  /** assistant 的 content blocks(原樣,供接續下一輪 messages)。 */
  content: ContentBlock[];
  toolUses: ToolUse[];
  usage: Usage;
}

export interface StreamTurnParams {
  system: string;
  messages: AnthropicMessage[];
  tools: ClaudeTool[];
}

/**
 * 送出一次 Claude 呼叫(串流),把文字 delta 交給 onText 即時輸出,
 * 回傳組裝好的 content blocks / tool_use / usage(供 tool loop 與持久化)。
 */
export async function streamTurn(
  env: Env,
  params: StreamTurnParams,
  onText: (delta: string) => void | Promise<void>,
): Promise<TurnResult> {
  const res = await fetch(messagesUrl(env), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "disabled" },
      system: params.system,
      messages: params.messages,
      tools: params.tools,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI Gateway 呼叫失敗(${res.status}):${detail.slice(0, 500)}`);
  }

  // 組裝中的 content blocks(依 index)。tool_use 的 input 以 partial_json 累加後 parse。
  const blocks: ContentBlock[] = [];
  const toolJson: Record<number, string> = {};
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };
  let stopReason = "end_turn";

  for await (const evt of parseSse(res.body)) {
    switch (evt.type) {
      case "message_start":
        usage.input_tokens = evt.message?.usage?.input_tokens ?? 0;
        break;
      case "content_block_start": {
        const cb = evt.content_block;
        if (cb?.type === "text") {
          blocks[evt.index!] = { type: "text", text: "" };
        } else if (cb?.type === "tool_use") {
          blocks[evt.index!] = { type: "tool_use", id: cb.id, name: cb.name, input: {} };
          toolJson[evt.index!] = "";
        }
        break;
      }
      case "content_block_delta": {
        const d = evt.delta;
        const block = blocks[evt.index!];
        if (d?.type === "text_delta" && block?.type === "text") {
          block.text += d.text;
          await onText(d.text);
        } else if (d?.type === "input_json_delta") {
          toolJson[evt.index!] = (toolJson[evt.index!] ?? "") + (d.partial_json ?? "");
        }
        break;
      }
      case "content_block_stop": {
        const block = blocks[evt.index!];
        if (block?.type === "tool_use") {
          const raw = toolJson[evt.index!] ?? "";
          block.input = raw ? safeJson(raw) : {};
        }
        break;
      }
      case "message_delta":
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
        if (evt.usage?.output_tokens != null) usage.output_tokens = evt.usage.output_tokens;
        break;
    }
  }

  const content = blocks.filter(Boolean);
  const text = content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  const toolUses = content
    .filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));

  return { stopReason, text, content, toolUses, usage };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ───────────────────────── SSE 解析 ─────────────────────────

interface SseEvent {
  type: string;
  index?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** 把 Anthropic SSE ReadableStream 解析成事件流(以空行分隔的 `data:` JSON)。 */
async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    // SSE 事件以空行(\n\n)分隔。
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of chunk.split("\n")) {
        const trimmed = line.trimStart();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        try {
          yield JSON.parse(data) as SseEvent;
        } catch {
          // 忽略非 JSON 的 keep-alive 等
        }
      }
    }
  }
}
