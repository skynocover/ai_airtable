import { Hono } from "hono";
import {
  API_ERROR_CODES,
  applyOperationsSchema,
  createCollectionSchema,
  createRecordSchema,
  encodeRecordData,
  updateCollectionSchema,
} from "@ai-airtable/shared";
import type { CollectionRow, Field } from "@ai-airtable/shared";
import type { AppBindings } from "../types";
import type { SelectOptions } from "../lib/db";
import { createCollection, loadCollectionRow, parseSchema, toCollection } from "../lib/collections";
import { safeParseObject, toRecordItem, type RecordRow } from "../lib/records";
import { applyOperations, SchemaOpError } from "../lib/schema-ops";
import { newRecordId, newSchemaOpId } from "../lib/ids";

export const collectionRoutes = new Hono<AppBindings>();

function validationError(message: string) {
  return { error: { code: API_ERROR_CODES.VALIDATION, message } } as const;
}
function notFound() {
  return { error: { code: API_ERROR_CODES.NOT_FOUND, message: "找不到此 collection" } } as const;
}
/** schema 樂觀鎖衝突回應(帶當前版本供 client refetch)。 */
function schemaConflict(currentVersion: number | null) {
  return {
    error: {
      code: API_ERROR_CODES.CONFLICT,
      message: "表格結構已被更新,請重新整理後再試",
      current_schema_version: currentVersion,
    },
  } as const;
}

/** POST /api/v1/collections — 建立 collection(初始化 snapshot + workspace 內唯一 slug)。 */
collectionRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(validationError(parsed.error.issues[0]?.message ?? "輸入無效"), 400);
  }

  const db = c.get("db");
  try {
    const col = await createCollection(db, parsed.data);
    return c.json(col, 201);
  } catch (e) {
    if (e instanceof SchemaOpError) return c.json(validationError(e.message), 400);
    if (e instanceof Error && e.message.includes("唯一的 slug")) {
      return c.json(validationError("無法產生唯一的 slug,請換個名稱"), 400);
    }
    throw e;
  }
});

/** GET /api/v1/collections — 當前 workspace 未刪除 collection 列表。 */
collectionRoutes.get("/", async (c) => {
  const db = c.get("db");
  const rows = await db.select<CollectionRow>("collections", {
    where: "deleted_at IS NULL",
    orderBy: "created_at desc",
  });
  return c.json({ collections: rows.map(toCollection) });
});

/** GET /api/v1/collections/:id — 單一 collection(含 schema)。 */
collectionRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const row = await loadCollectionRow(db, c.req.param("id"));
  if (!row) return c.json(notFound(), 404);
  return c.json(toCollection(row));
});

/** GET /api/v1/collections/:id/schema — 直接回 current_schema_json(不重算 operations)。 */
collectionRoutes.get("/:id/schema", async (c) => {
  const db = c.get("db");
  const row = await loadCollectionRow(db, c.req.param("id"));
  if (!row) return c.json(notFound(), 404);
  const col = toCollection(row);
  return c.json({ schema_version: col.schema_version, schema: col.schema });
});

/** GET /api/v1/collections/:id/operations — schema 變更 audit 歷史。 */
collectionRoutes.get("/:id/operations", async (c) => {
  const db = c.get("db");
  const row = await loadCollectionRow(db, c.req.param("id"));
  if (!row) return c.json(notFound(), 404);

  const ops = await db.select<{
    id: string;
    operation_json: string;
    applied_by: string;
    user_id: string;
    reason: string | null;
    applied_at: number;
  }>("schema_operations", {
    where: "collection_id = ?",
    params: [row.id],
    orderBy: "applied_at desc",
  });

  return c.json({
    operations: ops.map((o) => ({
      id: o.id,
      operation: JSON.parse(o.operation_json),
      applied_by: o.applied_by,
      user_id: o.user_id,
      reason: o.reason,
      applied_at: o.applied_at,
    })),
  });
});

/** PATCH /api/v1/collections/:id — 改 name / icon / description。 */
collectionRoutes.patch("/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = updateCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(validationError(parsed.error.issues[0]?.message ?? "輸入無效"), 400);
  }

  const db = c.get("db");
  const id = c.req.param("id");
  const row = await loadCollectionRow(db, id);
  if (!row) return c.json(notFound(), 404);

  const updates: Record<string, string | number | null> = { updated_at: Date.now() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.icon !== undefined) updates.icon = parsed.data.icon;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  await db.update("collections", updates, { where: "id = ?", params: [id] });
  const updated = await loadCollectionRow(db, id);
  return c.json(toCollection(updated!));
});

/** DELETE /api/v1/collections/:id — 軟刪除(設 deleted_at)。 */
collectionRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const changes = await db.update(
    "collections",
    { deleted_at: Date.now(), updated_at: Date.now() },
    { where: "id = ? AND deleted_at IS NULL", params: [id] },
  );
  if (changes === 0) return c.json(notFound(), 404);
  return c.json({ ok: true });
});

/**
 * POST /api/v1/collections/:id/operations — schema 寫入的唯一入口 + 樂觀鎖。
 * 單一邏輯流程:檢查版本 → apply 到 snapshot → schema_version +1 → 寫 audit log。
 */
collectionRoutes.post("/:id/operations", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = applyOperationsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(validationError(parsed.error.issues[0]?.message ?? "輸入無效"), 400);
  }

  const db = c.get("db");
  const userId = c.get("userId");
  const id = c.req.param("id");
  const row = await loadCollectionRow(db, id);
  if (!row) return c.json(notFound(), 404);

  // 樂觀鎖:client 帶的基準版本須與當前相符,否則代表已被其他操作改過 → 要求 refetch。
  if (parsed.data.schema_version !== row.schema_version) {
    return c.json(schemaConflict(row.schema_version), 409);
  }

  // apply 到 snapshot(純函式);任一 operation 非法 → 400,snapshot 不變。
  let newSchema;
  try {
    newSchema = applyOperations(parseSchema(row.current_schema_json), parsed.data.operations);
  } catch (e) {
    if (e instanceof SchemaOpError) return c.json(validationError(e.message), 400);
    throw e;
  }

  const nextVersion = row.schema_version + 1;
  const now = Date.now();
  // WHERE schema_version = 基準:擋掉「讀到寫之間」的併發改動。affected=0 → 版本衝突。
  const changes = await db.update(
    "collections",
    {
      current_schema_json: JSON.stringify(newSchema),
      schema_version: nextVersion,
      updated_at: now,
    },
    { where: "id = ? AND schema_version = ?", params: [id, parsed.data.schema_version] },
  );
  if (changes === 0) {
    const fresh = await loadCollectionRow(db, id);
    return c.json(schemaConflict(fresh?.schema_version ?? null), 409);
  }

  // append audit log:每個 operation 一筆(applied_by = 'user')。
  for (const op of parsed.data.operations) {
    await db.insert("schema_operations", {
      id: newSchemaOpId(),
      collection_id: id,
      operation_json: JSON.stringify(op),
      applied_by: "user",
      user_id: userId,
      reason: null,
      applied_at: now,
    });
  }

  const updated = await loadCollectionRow(db, id);
  return c.json(toCollection(updated!));
});

// ───────────────────────── Records(collection-scoped)─────────────────────────

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * 解析列表 query params,組成 scopedDb select options。文件化格式:
 *   - `sort`   = `<field>:<asc|desc>`;field 為 field_id(走 json_extract,number 數值序)
 *                或 `created_at` / `updated_at`(真實欄位)。預設 `created_at:desc`。
 *   - `filter` = `<field_id>:<value>`;對 data_json 欄位做等值比對。
 *   - `limit`  = 1..200(預設 50);`offset` >= 0(預設 0)。
 * 未知 / 非當前 schema 的 field 一律忽略(不報錯),避免暴露內部欄位。
 */
function buildListOptions(
  collectionId: string,
  fields: Field[],
  query: Record<string, string | undefined>,
): SelectOptions {
  const fieldIds = new Set(fields.map((f) => f.id));
  const conds = ["collection_id = ?", "deleted_at IS NULL"];
  const params: (string | number)[] = [collectionId];

  // filter:等值比對(僅限當前 schema 內欄位)。
  const filter = query.filter;
  if (filter) {
    const idx = filter.indexOf(":");
    if (idx > 0) {
      const fieldId = filter.slice(0, idx);
      const value = filter.slice(idx + 1);
      if (fieldIds.has(fieldId)) {
        conds.push("json_extract(data_json, ?) = ?");
        params.push(`$.${fieldId}`, value);
      }
    }
  }

  const options: SelectOptions = { where: conds.join(" AND "), params };

  // sort:預設 created_at desc。
  let sortField = "created_at";
  let sortDir: "asc" | "desc" = "desc";
  const sort = query.sort;
  if (sort) {
    const idx = sort.indexOf(":");
    const f = idx > 0 ? sort.slice(0, idx) : sort;
    const d = idx > 0 ? sort.slice(idx + 1) : "asc";
    sortDir = d === "desc" ? "desc" : "asc";
    if (f === "created_at" || f === "updated_at") {
      sortField = f;
    } else if (fieldIds.has(f)) {
      // data_json 欄位 → json_extract 排序(number 數值序);次排序 created_at 維持穩定。
      options.orderByJsonField = { fieldId: f, direction: sortDir };
      options.orderBy = "created_at desc";
      sortField = "";
    } else {
      sortField = "created_at"; // 未知欄位 → 退回預設
    }
  }
  if (sortField) options.orderBy = `${sortField} ${sortDir}`;

  // 分頁。
  const limit = Math.min(Math.max(parseInt(query.limit ?? "", 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(query.offset ?? "", 10) || 0, 0);
  options.limit = limit;
  options.offset = offset;
  return options;
}

/** POST /api/v1/collections/:id/records — 手動新增 record(§2.4 編碼、source=manual)。 */
collectionRoutes.post("/:id/records", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createRecordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(validationError(parsed.error.issues[0]?.message ?? "輸入無效"), 400);
  }

  const db = c.get("db");
  const id = c.req.param("id");
  const row = await loadCollectionRow(db, id);
  if (!row) return c.json(notFound(), 404);

  const schema = parseSchema(row.current_schema_json);
  const { data, errors } = encodeRecordData(schema.fields, parsed.data.data);
  if (errors.length > 0) {
    return c.json(validationError(errors[0].message), 400);
  }

  const now = Date.now();
  const recordId = newRecordId();
  await db.insert("records", {
    id: recordId,
    collection_id: id,
    data_json: JSON.stringify(data),
    source: "manual",
    source_metadata_json: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  });

  const created = await db.first<RecordRow>("records", { where: "id = ?", params: [recordId] });
  return c.json(toRecordItem(created!), 201);
});

/** GET /api/v1/collections/:id/records — 列表(filter/sort/limit/offset,回 total)。 */
collectionRoutes.get("/:id/records", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const row = await loadCollectionRow(db, id);
  if (!row) return c.json(notFound(), 404);

  const schema = parseSchema(row.current_schema_json);
  const query = c.req.query();
  const options = buildListOptions(id, schema.fields, query);

  const rows = await db.select<RecordRow>("records", options);
  // total 用相同 where/params(不含排序/分頁)。
  const total = await db.count("records", { where: options.where, params: options.params });

  return c.json({
    records: rows.map(toRecordItem),
    total,
    limit: options.limit,
    offset: options.offset,
  });
});

/** CSV 欄位值轉義(含逗號/引號/換行則加引號並重複引號)。 */
function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  let s = String(value);
  // 防公式注入:= + - @ 或 tab/CR 開頭的值,在 Excel/Sheets 會被當公式執行 → 前綴單引號。
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** POST /api/v1/collections/:id/records/export — 匯出未刪除 records 為 CSV(UTF-8 BOM)。 */
collectionRoutes.post("/:id/records/export", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const row = await loadCollectionRow(db, id);
  if (!row) return c.json(notFound(), 404);

  const schema = parseSchema(row.current_schema_json);
  const fields = schema.fields; // 依當前 schema 順序;殘留(已刪)欄位的 key 不在此 → 不匯出。
  const rows = await db.select<RecordRow>("records", {
    where: "collection_id = ? AND deleted_at IS NULL",
    params: [id],
    orderBy: "created_at desc",
  });

  const header = fields.map((f) => csvCell(f.name)).join(",");
  const lines = rows.map((r) => {
    // §2.4 原始值:number 為數字(無貨幣符號),其餘為字串。
    const data = safeParseObject(r.data_json) ?? {};
    return fields.map((f) => csvCell(data[f.id])).join(",");
  });

  // UTF-8 BOM(﻿)確保 Excel 正確辨識繁中。
  const csv = "﻿" + [header, ...lines].join("\r\n") + "\r\n";
  const filename = encodeURIComponent(`${row.slug || "export"}.csv`);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
});
