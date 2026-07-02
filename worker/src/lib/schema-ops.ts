import {
  fieldSchema,
  type CollectionSchemaJson,
  type Field,
  type FieldInput,
  type SchemaOperation,
} from "@ai-airtable/shared";
import { newFieldId } from "./ids";

/**
 * Schema operation 引擎 —— 純函式,把單一 SchemaOperation apply 到 schema snapshot。
 *
 * 跨切片鐵則 #4(D1 唯一真相):`current_schema_json` 是 schema 的唯一真相。
 * 這裡是「snapshot 變換」的唯一實作:`(currentSchema, op) => newSchema`。
 * 系統**永不**在讀取時 reduce `schema_operations` 重算 —— operations log 只是 audit。
 *
 * 設計:fields 以陣列維持顯示順序,`order` 永遠等於陣列索引(每次變換後 reindex),
 * 故顯示/匯出只要照陣列順序即可,不需另外排序。
 */

/** apply 過程的驗證失敗(非法 operation);route 層映射為 400。 */
export class SchemaOpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaOpError";
  }
}

function reindex(fields: Field[]): Field[] {
  return fields.map((f, i) => ({ ...f, order: i }));
}

/** 把 add_field 的輸入正規化為完整 Field(補 id / order;經 zod 驗證 select options 等)。 */
function normalizeField(input: FieldInput, fallbackOrder: number): Field {
  const candidate = {
    ...input,
    id: input.id && input.id.trim() ? input.id : newFieldId(),
    required: input.required ?? false,
    order: input.order ?? fallbackOrder,
  };
  const parsed = fieldSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new SchemaOpError(parsed.error.issues[0]?.message ?? "欄位定義無效");
  }
  return parsed.data;
}

export function applyOperation(
  schema: CollectionSchemaJson,
  op: SchemaOperation,
): CollectionSchemaJson {
  const fields = [...schema.fields];

  switch (op.op) {
    case "add_field": {
      const field = normalizeField(op.field, fields.length);
      if (fields.some((f) => f.id === field.id)) {
        throw new SchemaOpError(`欄位 id 已存在:${field.id}`);
      }
      // at_order 指定插入位置(夾在 [0, length]),否則接在最後。
      const at =
        op.at_order != null ? Math.min(Math.max(op.at_order, 0), fields.length) : fields.length;
      fields.splice(at, 0, field);
      return { fields: reindex(fields) };
    }

    case "remove_field": {
      const idx = fields.findIndex((f) => f.id === op.field_id);
      if (idx === -1) throw new SchemaOpError(`找不到欄位:${op.field_id}`);
      fields.splice(idx, 1);
      // 注意:不動 records 的 data_json —— 既有資料保留(殘留 key 顯示/匯出時忽略)。
      return { fields: reindex(fields) };
    }

    case "rename_field": {
      const idx = fields.findIndex((f) => f.id === op.field_id);
      if (idx === -1) throw new SchemaOpError(`找不到欄位:${op.field_id}`);
      fields[idx] = { ...fields[idx], name: op.new_name };
      return { fields: reindex(fields) };
    }

    case "update_field_meta": {
      const idx = fields.findIndex((f) => f.id === op.field_id);
      if (idx === -1) throw new SchemaOpError(`找不到欄位:${op.field_id}`);
      // updates 已在 zod 排除 type / id(拒絕 change_field_type)。合併後重新驗證。
      const merged = { ...fields[idx], ...op.updates };
      const parsed = fieldSchema.safeParse(merged);
      if (!parsed.success) {
        throw new SchemaOpError(parsed.error.issues[0]?.message ?? "欄位更新無效");
      }
      fields[idx] = parsed.data;
      return { fields: reindex(fields) };
    }

    case "reorder_fields": {
      const existing = fields.map((f) => f.id);
      const next = op.field_ids;
      // 必須是既有欄位 id 的一個排列(不增不減)。
      if (
        next.length !== existing.length ||
        new Set(next).size !== next.length ||
        !next.every((id) => existing.includes(id))
      ) {
        throw new SchemaOpError("reorder_fields 必須是現有欄位 id 的完整排列");
      }
      const byId = new Map(fields.map((f) => [f.id, f]));
      const reordered = next.map((id) => byId.get(id)!);
      return { fields: reindex(reordered) };
    }

    default: {
      const _exhaustive: never = op;
      throw new SchemaOpError(`未知的 operation:${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** 依序 apply 多個 operations;任一失敗即拋出(呼叫端不寫入)。 */
export function applyOperations(
  schema: CollectionSchemaJson,
  ops: SchemaOperation[],
): CollectionSchemaJson {
  return ops.reduce((acc, op) => applyOperation(acc, op), schema);
}

/** 建立 collection 時把初始 fields 正規化成 snapshot。 */
export function buildInitialSchema(inputs: FieldInput[] | undefined): CollectionSchemaJson {
  const fields = (inputs ?? []).map((input, i) => normalizeField(input, i));
  // id 不可重複。
  const ids = new Set<string>();
  for (const f of fields) {
    if (ids.has(f.id)) throw new SchemaOpError(`欄位 id 重複:${f.id}`);
    ids.add(f.id);
  }
  return { fields: reindex(fields) };
}
