import {
  collectionSchemaJsonSchema,
  type Collection,
  type CollectionRow,
  type CollectionSchemaJson,
  type FieldInput,
} from "@ai-airtable/shared";
import { isUniqueViolation, type ScopedDb } from "./db";
import { buildInitialSchema } from "./schema-ops";
import { RESERVED_SLUGS, newCollectionId, randomSuffix, slugifyBase } from "./ids";

export interface CreateCollectionInput {
  name: string;
  icon?: string | null;
  description?: string | null;
  fields?: FieldInput[];
}

/**
 * 建立 collection 的唯一邏輯(schema 唯一入口)—— route(手動)與 AI create_collection tool 共用。
 * slug 唯一性交給 DB 約束兜底(UNIQUE(workspace_id, slug)):撞號或撞保留字 → 換尾碼重試。
 * `buildInitialSchema` 會拒絕非法欄位型別(如 currency)並拋 SchemaOpError,由呼叫端映射錯誤。
 */
export async function createCollection(
  db: ScopedDb,
  input: CreateCollectionInput,
): Promise<Collection> {
  const schema = buildInitialSchema(input.fields);
  const now = Date.now();
  const base = slugifyBase(input.name);
  const schemaJson = JSON.stringify(schema);

  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = attempt === 0 && !RESERVED_SLUGS.has(base) ? base : `${base}-${randomSuffix()}`;
    const id = newCollectionId();
    try {
      await db.insert("collections", {
        id,
        name: input.name,
        slug,
        icon: input.icon ?? null,
        description: input.description ?? null,
        schema_version: 1,
        current_schema_json: schemaJson,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      });
      const row = await loadCollectionRow(db, id);
      return toCollection(row!);
    } catch (e) {
      if (isUniqueViolation(e, "slug")) continue; // 撞 slug → 重試
      throw e;
    }
  }
  throw new Error("無法產生唯一的 slug");
}

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
