import { Hono } from "hono";
import { API_ERROR_CODES, patchRecordData, updateRecordSchema } from "@ai-airtable/shared";
import type { RecordValue } from "@ai-airtable/shared";
import type { AppBindings } from "../types";
import { loadCollectionRow, parseSchema } from "../lib/collections";
import { loadRecordRow, safeParseObject, toRecordItem } from "../lib/records";

export const recordRoutes = new Hono<AppBindings>();

function notFound() {
  return { error: { code: API_ERROR_CODES.NOT_FOUND, message: "找不到此資料列" } } as const;
}
function validationError(message: string) {
  return { error: { code: API_ERROR_CODES.VALIDATION, message } } as const;
}

/** GET /api/v1/records/:id — 取得單筆(未刪除)。 */
recordRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const row = await loadRecordRow(db, c.req.param("id"));
  if (!row) return c.json(notFound(), 404);
  return c.json(toRecordItem(row));
});

/** PATCH /api/v1/records/:id — inline edit(部分欄位,維持 sparse 與 §2.4)。 */
recordRoutes.patch("/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = updateRecordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(validationError(parsed.error.issues[0]?.message ?? "輸入無效"), 400);
  }

  const db = c.get("db");
  const id = c.req.param("id");
  const row = await loadRecordRow(db, id);
  if (!row) return c.json(notFound(), 404);

  // 用 record 所屬 collection 的當前 schema 驗證/編碼(殘留 key 會被忽略)。
  const col = await loadCollectionRow(db, row.collection_id);
  if (!col) return c.json(notFound(), 404);
  const schema = parseSchema(col.current_schema_json);

  const { set, remove, errors } = patchRecordData(schema.fields, parsed.data.data);
  if (errors.length > 0) {
    return c.json(validationError(errors[0].message), 400);
  }

  // 合併進既有 data_json:set 取代、remove 清掉 key(維持 sparse)。
  const current = (safeParseObject(row.data_json) ?? {}) as Record<string, RecordValue>;
  for (const [k, v] of Object.entries(set)) current[k] = v;
  for (const k of remove) delete current[k];

  await db.update(
    "records",
    { data_json: JSON.stringify(current), updated_at: Date.now() },
    { where: "id = ?", params: [id] },
  );

  const updated = await loadRecordRow(db, id);
  return c.json(toRecordItem(updated!));
});

/** DELETE /api/v1/records/:id — 軟刪除。 */
recordRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const changes = await db.update(
    "records",
    { deleted_at: Date.now(), updated_at: Date.now() },
    { where: "id = ? AND deleted_at IS NULL", params: [id] },
  );
  if (changes === 0) return c.json(notFound(), 404);
  return c.json({ ok: true });
});
