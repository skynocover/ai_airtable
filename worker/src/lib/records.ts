import type { RecordItem, RecordValue } from "@ai-airtable/shared";
import type { ScopedDb } from "./db";

export interface RecordRow {
  id: string;
  collection_id: string;
  workspace_id: string;
  data_json: string;
  source: string;
  source_metadata_json: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

/** 載入未軟刪除的 record 列(經 scopedDb,自動限當前 workspace)。 */
export async function loadRecordRow(db: ScopedDb, id: string): Promise<RecordRow | null> {
  return db.first<RecordRow>("records", {
    where: "id = ? AND deleted_at IS NULL",
    params: [id],
  });
}

/** 安全解析 JSON 物件字串;非物件 / 解析失敗 → null。 */
export function safeParseObject(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** DB 列 → 對外 RecordItem(data_json / source_metadata_json 解析為物件)。 */
export function toRecordItem(row: RecordRow): RecordItem {
  return {
    id: row.id,
    collection_id: row.collection_id,
    data: (safeParseObject(row.data_json) ?? {}) as Record<string, RecordValue>,
    source: row.source,
    source_metadata: safeParseObject(row.source_metadata_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
