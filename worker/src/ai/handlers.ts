import {
  createCollectionToolSchema,
  proposeSchemaOperationsToolSchema,
  queryRecordsToolSchema,
  type ChatAction,
  type Field,
  type QueryFilter,
  type QueryResultRow,
} from "@ai-airtable/shared";
import type { ScopedDb, SelectOptions } from "../lib/db";
import { createCollection, loadCollectionRow, parseSchema } from "../lib/collections";
import { safeParseObject, type RecordRow } from "../lib/records";
import { SchemaOpError } from "../lib/schema-ops";
import { newActionId } from "../lib/ids";

/**
 * AI tool 執行 —— AI 是資料層之上的 client,寫入走 #2 既有邏輯(經 scopedDb)。
 *   - create_collection:直接建立(#2 createCollection)。
 *   - propose_schema_operations:只組提案卡片,**不寫 DB**(鐵則 #2)。真正套用走前端確認 → #2 POST /operations。
 *   - query_records:structured 查詢(#2 records),不灌 raw records。
 *
 * 每個 tool 回傳 { card(存 actions_json / 前端渲染), toolResult(回給 AI 的結構化結果) }。
 */
export interface ToolOutcome {
  card: ChatAction;
  toolResult: { content: string; isError: boolean };
}

export async function executeTool(
  db: ScopedDb,
  name: string,
  input: unknown,
): Promise<ToolOutcome> {
  switch (name) {
    case "create_collection":
      return handleCreateCollection(db, input);
    case "propose_schema_operations":
      return handlePropose(input);
    case "query_records":
      return handleQueryRecords(db, input);
    default:
      return errorOutcome(`未知的 tool:${name}`);
  }
}

function errorOutcome(message: string): ToolOutcome {
  // 用一張 query_records error 卡兜底顯示(極少發生);toolResult 讓 AI 也知道失敗。
  return {
    card: { id: newActionId(), type: "query_records", status: "error", collection_id: "", message },
    toolResult: { content: message, isError: true },
  };
}

async function handleCreateCollection(db: ScopedDb, input: unknown): Promise<ToolOutcome> {
  const parsed = createCollectionToolSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "create_collection 參數無效";
    return {
      card: {
        id: newActionId(),
        type: "create_collection",
        status: "error",
        name: "",
        message: msg,
      },
      toolResult: { content: msg, isError: true },
    };
  }
  try {
    const col = await createCollection(db, {
      name: parsed.data.name,
      icon: parsed.data.icon ?? null,
      description: parsed.data.description ?? null,
      fields: parsed.data.initial_fields,
    });
    return {
      card: {
        id: newActionId(),
        type: "create_collection",
        status: "created",
        collection_id: col.id,
        name: col.name,
        slug: col.slug,
      },
      toolResult: {
        content: JSON.stringify({
          success: true,
          collection_id: col.id,
          name: col.name,
          slug: col.slug,
          fields: col.schema.fields.map((f) => ({ name: f.name, type: f.type })),
        }),
        isError: false,
      },
    };
  } catch (e) {
    // 非法型別(如 currency)由 buildInitialSchema 拋 SchemaOpError。
    const msg = e instanceof SchemaOpError ? e.message : "建立 collection 失敗";
    return {
      card: {
        id: newActionId(),
        type: "create_collection",
        status: "error",
        name: parsed.data.name,
        message: msg,
      },
      toolResult: { content: msg, isError: true },
    };
  }
}

function handlePropose(input: unknown): ToolOutcome {
  const parsed = proposeSchemaOperationsToolSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "propose_schema_operations 參數無效";
    return errorOutcome(msg);
  }
  // 只組提案卡片,絕不寫 DB(鐵則 #2)。狀態 pending,套用由前端確認後走 #2 端點。
  return {
    card: {
      id: newActionId(),
      type: "schema_operation",
      status: "pending",
      collection_id: parsed.data.collection_id,
      schema_version: parsed.data.schema_version,
      operations: parsed.data.operations,
      reason: parsed.data.reason,
    },
    toolResult: {
      content: "提案已送出,等待使用者在介面上接受或拒絕。請簡短向使用者說明這個提案。",
      isError: false,
    },
  };
}

async function handleQueryRecords(db: ScopedDb, input: unknown): Promise<ToolOutcome> {
  const parsed = queryRecordsToolSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "query_records 參數無效";
    return errorOutcome(msg);
  }
  const q = parsed.data;
  const col = await loadCollectionRow(db, q.collection_id);
  if (!col) {
    return {
      card: {
        id: newActionId(),
        type: "query_records",
        status: "error",
        collection_id: q.collection_id,
        message: "找不到此 collection",
      },
      toolResult: { content: "找不到此 collection", isError: true },
    };
  }

  const fields = parseSchema(col.current_schema_json).fields;
  const options = buildQueryOptions(q.collection_id, fields, q);
  const rows = await db.select<RecordRow>("records", options);
  const total = await db.count("records", { where: options.where, params: options.params });

  const outRows: QueryResultRow[] = rows.map((r) => {
    const data = (safeParseObject(r.data_json) ?? {}) as Record<string, string | number>;
    const mapped: QueryResultRow = {};
    for (const f of fields) {
      if (data[f.id] !== undefined) mapped[f.name] = data[f.id];
    }
    return mapped;
  });

  return {
    card: {
      id: newActionId(),
      type: "query_records",
      status: "ok",
      collection_id: q.collection_id,
      total,
      rows: outRows,
    },
    // 只回摘要 + 有上限的 rows,不灌全部 raw records(隱私 + 成本)。
    toolResult: {
      content: JSON.stringify({ total, returned: outRows.length, records: outRows }),
      isError: false,
    },
  };
}

const REAL_COLUMNS = new Set(["created_at", "updated_at"]);

/**
 * 把 structured filter/sort 轉成 scopedDb select options。
 * - data_json 欄位:json_extract(data_json, ?)(path 走 bind);未知欄位忽略(不暴露內部)。
 * - created_at / updated_at:真實欄位;值接受 ISO 日期或毫秒。
 * 值一律走 params bind(scopedDb.assertSafeWhere 把關,不字串拼接)。
 */
function buildQueryOptions(
  collectionId: string,
  fields: Field[],
  q: {
    filter?: QueryFilter[];
    sort?: { field_id: string; direction: "asc" | "desc" }[];
    limit?: number;
    offset?: number;
  },
): SelectOptions {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const conds = ["collection_id = ?", "deleted_at IS NULL"];
  const params: (string | number)[] = [collectionId];

  for (const f of q.filter ?? []) {
    const isReal = REAL_COLUMNS.has(f.field_id);
    const field = byId.get(f.field_id);
    if (!isReal && !field) continue; // 未知欄位 → 忽略

    const target = isReal ? f.field_id : "json_extract(data_json, ?)";
    const pushPath = () => {
      if (!isReal) params.push(`$.${f.field_id}`);
    };
    const v = coerceValue(isReal, field, f.value);

    switch (f.op) {
      case "eq":
        conds.push(`${target} = ?`);
        pushPath();
        params.push(v);
        break;
      case "gt":
        conds.push(`${target} > ?`);
        pushPath();
        params.push(v);
        break;
      case "lt":
        conds.push(`${target} < ?`);
        pushPath();
        params.push(v);
        break;
      case "contains":
        conds.push(`${target} LIKE ?`);
        pushPath();
        params.push(`%${String(f.value)}%`);
        break;
      case "between": {
        if (f.value_to === undefined) break;
        const v2 = coerceValue(isReal, field, f.value_to);
        conds.push(`${target} BETWEEN ? AND ?`);
        pushPath();
        params.push(v, v2);
        break;
      }
    }
  }

  const options: SelectOptions = { where: conds.join(" AND "), params };

  // 排序:只採第一個 sort 條件(其餘 Phase 1 忽略)。
  const sort = q.sort?.[0];
  if (sort) {
    const dir = sort.direction === "desc" ? "desc" : "asc";
    if (REAL_COLUMNS.has(sort.field_id)) {
      options.orderBy = `${sort.field_id} ${dir}`;
    } else if (byId.has(sort.field_id)) {
      options.orderByJsonField = { fieldId: sort.field_id, direction: dir };
      options.orderBy = "created_at desc";
    } else {
      options.orderBy = "created_at desc";
    }
  } else {
    options.orderBy = "created_at desc";
  }

  options.limit = Math.min(q.limit ?? 20, 50);
  options.offset = Math.max(q.offset ?? 0, 0);
  return options;
}

/** created_at/updated_at:ISO 日期 → ms;number 欄位:數字字串 → number。其餘原樣。 */
function coerceValue(
  isReal: boolean,
  field: Field | undefined,
  value: string | number,
): string | number {
  if (isReal) {
    if (typeof value === "number") return value;
    const asNum = Number(value);
    if (Number.isFinite(asNum) && /^\d+$/.test(value.trim())) return asNum; // 已是 ms
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? value : ms;
  }
  if (field?.type === "number" && typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return value;
}
