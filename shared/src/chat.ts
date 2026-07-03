import { z } from "zod";
import { fieldInputSchema } from "./fields";
import { schemaOperationSchema } from "./fields";

/**
 * Chat 資料模型 + AI tool 參數型別(ai-chat-tools change)。
 *
 * 鐵則 #3:AI 互動一律 tool calling / structured output。這裡的 zod schema 是
 * 「解析 AI tool_use.input 的唯一入口」—— tool handler 一律先過對應 schema,
 * 不 parse 自由文字。tool 的 JSON schema(給 Claude 的 tools 定義)在 worker/src/ai/tools.ts,
 * 與這裡的 zod 對齊。
 */

// ───────────────────────── DB 列 / 對外形狀 ─────────────────────────

export const chatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export interface ChatSessionRow {
  id: string;
  workspace_id: string;
  user_id: string;
  context_collection_id: string | null;
  title: string | null;
  last_message_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ChatSession {
  id: string;
  context_collection_id: string | null;
  title: string | null;
  last_message_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ChatMessageRow {
  id: string;
  workspace_id: string;
  session_id: string;
  role: ChatRole;
  content: string;
  actions_json: string | null;
  created_at: number;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  actions: ChatAction[];
  created_at: number;
}

// ───────────────────────── actions_json 卡片 ─────────────────────────

/**
 * assistant 訊息裡的一張 tool 卡片。前端據 `type` 選對應元件渲染(非純文字)。
 * schema_operation 是提案(status 可被 accept/reject 更新);其餘為純告知。
 */
export type ChatAction = CreateCollectionAction | SchemaProposalAction | QueryRecordsAction;

export interface CreateCollectionAction {
  id: string;
  type: "create_collection";
  status: "created" | "error";
  collection_id?: string;
  name: string;
  slug?: string;
  message?: string; // error 時的錯誤說明
}

export interface SchemaProposalAction {
  id: string;
  type: "schema_operation";
  status: "pending" | "applied" | "rejected";
  collection_id: string;
  schema_version: number;
  operations: unknown[]; // SchemaOperation[](存原樣,套用時走 #2 端點驗證)
  reason: string;
}

export interface QueryResultRow {
  [fieldName: string]: string | number;
}

export interface QueryRecordsAction {
  id: string;
  type: "query_records";
  status: "ok" | "error";
  collection_id: string;
  total?: number;
  rows?: QueryResultRow[];
  message?: string;
}

// ───────────────────────── Chat API 請求 body ─────────────────────────

export const createChatSessionSchema = z.object({
  context_collection_id: z.string().nullable().optional(),
  title: z.string().trim().max(200).optional(),
});
export type CreateChatSessionInput = z.infer<typeof createChatSessionSchema>;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "訊息不能空白").max(4000, "訊息過長"),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** PATCH 提案卡片狀態(accept/reject 後由前端回寫)。 */
export const patchActionSchema = z.object({
  action_id: z.string(),
  status: z.enum(["applied", "rejected"]),
});
export type PatchActionInput = z.infer<typeof patchActionSchema>;

// ───────────────────────── AI tool 參數(structured output)─────────────────────────

/** create_collection:直接建立(不走 propose)。initial_fields 僅限 7 種型別(fieldInputSchema 強制)。 */
export const createCollectionToolSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().max(64).optional(),
  icon: z.string().trim().max(8).optional(),
  description: z.string().trim().max(500).optional(),
  initial_fields: z.array(fieldInputSchema).max(100).default([]),
});
export type CreateCollectionToolInput = z.infer<typeof createCollectionToolSchema>;

/** propose_schema_operations:只提案不寫 DB。帶基準 schema_version 供樂觀鎖。 */
export const proposeSchemaOperationsToolSchema = z.object({
  collection_id: z.string(),
  schema_version: z.number().int().nonnegative(),
  operations: z.array(schemaOperationSchema).min(1),
  reason: z.string().trim().min(1).max(1000),
});
export type ProposeSchemaOperationsToolInput = z.infer<typeof proposeSchemaOperationsToolSchema>;

/** query_records 的單一 filter。between 用 value + value_to。 */
export const queryFilterSchema = z.object({
  field_id: z.string(),
  op: z.enum(["eq", "gt", "lt", "contains", "between"]),
  value: z.union([z.string(), z.number()]),
  value_to: z.union([z.string(), z.number()]).optional(),
});
export type QueryFilter = z.infer<typeof queryFilterSchema>;

export const querySortSchema = z.object({
  field_id: z.string(),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

/** query_records:structured 查詢(走 #2 records 列表,經 scopedDb)。 */
export const queryRecordsToolSchema = z.object({
  collection_id: z.string(),
  filter: z.array(queryFilterSchema).optional(),
  sort: z.array(querySortSchema).optional(),
  limit: z.number().int().positive().max(50).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type QueryRecordsToolInput = z.infer<typeof queryRecordsToolSchema>;
