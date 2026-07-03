import { FIELD_TYPES } from "@ai-airtable/shared";
import type { ClaudeTool } from "./client";

/**
 * 三個 AI tool 的 JSON schema(給 Claude 的 tools 定義,對齊 PLAN.md §5.6.2)。
 * 與 shared/chat.ts 的 zod 對齊 —— handler 收到 tool_use.input 後一律用 zod 再驗一次(鐵則 #3)。
 * 截圖抽取(extract_from_screenshot)是 #4 範圍,本 change 不含。
 */

/** 單一欄位定義(create_collection 的 initial_fields / 提案 add_field 共用形狀)。 */
const fieldSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "既有欄位 id(僅改動既有欄位時給;新增可省略)" },
    name: { type: "string", description: "欄位顯示名稱" },
    type: {
      type: "string",
      enum: [...FIELD_TYPES],
      description: "欄位型別。金額用 number + currency 表達,沒有獨立 currency 型別。",
    },
    required: { type: "boolean" },
    options: {
      type: "array",
      items: { type: "string" },
      description: "select_single 的選項(select_single 必填)",
    },
    currency: { type: "string", description: "number 欄位的貨幣顯示,如 'TWD'" },
    ai_hint: { type: "string", description: "此欄位語意提示" },
  },
  required: ["name", "type"],
} as const;

/** 五種 schema operation(對齊 shared/fields.ts 的 schemaOperationSchema)。 */
const schemaOperationJsonSchema = {
  type: "object",
  description: "一個 schema 變更操作",
  properties: {
    op: {
      type: "string",
      enum: ["add_field", "remove_field", "rename_field", "update_field_meta", "reorder_fields"],
    },
    field: { ...fieldSchema, description: "add_field 用:新欄位定義" },
    at_order: { type: "integer", description: "add_field 用:插入位置(可省略,預設接在最後)" },
    field_id: { type: "string", description: "remove_field / rename_field / update_field_meta 用" },
    new_name: { type: "string", description: "rename_field 用:新名稱" },
    updates: {
      type: "object",
      description: "update_field_meta 用:要改的中繼資料(不可含 type/id)",
    },
    field_ids: {
      type: "array",
      items: { type: "string" },
      description: "reorder_fields 用:完整欄位 id 排列",
    },
  },
  required: ["op"],
} as const;

export const AI_TOOLS: ClaudeTool[] = [
  {
    name: "create_collection",
    description:
      "建立一個新的 Collection(資料表)。直接建立、立即生效(不需用戶確認),因為建的是空表無覆蓋風險。用於用戶想開新表時。initial_fields 僅能用 7 種型別。",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "資料表名稱" },
        slug: { type: "string", description: "url 友善代稱(可省略,系統會自動產生)" },
        icon: { type: "string", description: "emoji 圖示" },
        description: { type: "string" },
        initial_fields: {
          type: "array",
          items: fieldSchema,
          description: "初始欄位(建議 5-7 個合理欄位)",
        },
      },
      required: ["name", "initial_fields"],
    },
  },
  {
    name: "propose_schema_operations",
    description:
      "對『既有』Collection 提出 schema 變動『提案』(加/改/刪/重排欄位)。這只是提案,絕不直接套用 —— 用戶會在介面上接受或拒絕。必須帶當前 schema_version(從 system prompt 的當前 schema 取得)。",
    input_schema: {
      type: "object",
      properties: {
        collection_id: { type: "string" },
        schema_version: {
          type: "integer",
          description: "提案所基於的當前版本(system prompt 有提供)",
        },
        operations: { type: "array", items: schemaOperationJsonSchema, minItems: 1 },
        reason: { type: "string", description: "給用戶看的變更理由說明" },
      },
      required: ["collection_id", "schema_version", "operations", "reason"],
    },
  },
  {
    name: "query_records",
    description:
      "查詢某 Collection 的資料。用 structured filter/sort/limit 查,收到結果後用自然語言回覆用戶(例如筆數、最大值)。時間欄位用 created_at / updated_at(值給 ISO 日期 YYYY-MM-DD 或毫秒時間戳)。",
    input_schema: {
      type: "object",
      properties: {
        collection_id: { type: "string" },
        filter: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field_id: {
                type: "string",
                description: "欄位 id,或 'created_at' / 'updated_at'",
              },
              op: { type: "string", enum: ["eq", "gt", "lt", "contains", "between"] },
              value: { type: ["string", "number"] },
              value_to: { type: ["string", "number"], description: "between 的上界" },
            },
            required: ["field_id", "op", "value"],
          },
        },
        sort: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field_id: { type: "string" },
              direction: { type: "string", enum: ["asc", "desc"] },
            },
            required: ["field_id"],
          },
        },
        limit: { type: "integer", description: "回傳筆數上限(最多 50,預設 20)" },
        offset: { type: "integer" },
      },
      required: ["collection_id"],
    },
  },
];
