import {
  collectionSchemaJsonSchema,
  type Collection,
  type CollectionRow,
  type CollectionSchemaJson,
} from "@ai-airtable/shared";
import type { ScopedDb } from "./db";

/** 載入未軟刪除的 collection 列(經 scopedDb,故自動限當前 workspace)。 */
export async function loadCollectionRow(db: ScopedDb, id: string): Promise<CollectionRow | null> {
  return db.first<CollectionRow>("collections", {
    where: "id = ? AND deleted_at IS NULL",
    params: [id],
  });
}

/** 解析 `current_schema_json`;格式異常時退回空 schema(不讓壞資料整列噴錯)。 */
export function parseSchema(json: string): CollectionSchemaJson {
  try {
    const parsed = collectionSchemaJsonSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : { fields: [] };
  } catch {
    return { fields: [] };
  }
}

/** DB 列 → 對外 Collection(schema 解析為物件)。 */
export function toCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    description: row.description,
    schema_version: row.schema_version,
    schema: parseSchema(row.current_schema_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
