import { z } from "zod";
import type { Field } from "./fields";

/**
 * §2.4 欄位值的儲存格式 —— 寫入 / 讀取 / 顯示零轉換。
 * `records.data_json` 是 `{ [field_id]: value }` 的 sparse 物件:空值不存 key。
 *
 *   | type                       | data_json 存法              | 範例
 *   | short_text / long_text     | string                      | "王大明"
 *   | number(含金額)            | JSON number(無逗號/符號)   | 50000
 *   | select_single              | option label 字串           | "設計"(須為 options 之一,否則留空)
 *   | date                       | ISO 字串 YYYY-MM-DD         | "2026-05-25"
 *   | email                      | 驗證過的字串                | "a@b.com"
 *   | phone                      | string(永不存 number)      | "0912345678"(保留前導 0 / +886)
 */

/** data_json 中允許的值型別:string 或 JSON number。 */
export type RecordValue = string | number;

/** 一個欄位的編碼結果:set 寫入該值、skip 不存 key(sparse)、error 驗證失敗。 */
export type EncodeFieldResult =
  | { status: "set"; value: RecordValue }
  | { status: "skip" }
  | { status: "error"; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmpty(raw: unknown): boolean {
  return raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
}

/**
 * 依 field type 把單一原始輸入值編碼為 §2.4 儲存表示。
 * - 空值 → skip(sparse,不存 key)。
 * - select_single 非法值 → skip(留空,不視為錯誤)。
 * - 其餘型別不符 → error。
 */
export function encodeField(field: Field, raw: unknown): EncodeFieldResult {
  if (isEmpty(raw)) return { status: "skip" };

  switch (field.type) {
    case "short_text":
    case "long_text":
      return { status: "set", value: String(raw) };

    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) {
        return { status: "error", message: `「${field.name}」必須是數字` };
      }
      if (field.min != null && n < field.min) {
        return { status: "error", message: `「${field.name}」不得小於 ${field.min}` };
      }
      if (field.max != null && n > field.max) {
        return { status: "error", message: `「${field.name}」不得大於 ${field.max}` };
      }
      return { status: "set", value: n };
    }

    case "select_single": {
      const v = String(raw);
      // 非法值留空(不存 key),不報錯。
      if (!field.options || !field.options.includes(v)) return { status: "skip" };
      return { status: "set", value: v };
    }

    case "date": {
      const v = String(raw).trim();
      if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
        return { status: "error", message: `「${field.name}」必須是 YYYY-MM-DD 格式的日期` };
      }
      return { status: "set", value: v };
    }

    case "email": {
      const v = String(raw).trim();
      if (!EMAIL_RE.test(v)) {
        return { status: "error", message: `「${field.name}」不是有效的 email` };
      }
      return { status: "set", value: v };
    }

    case "phone":
      // 永遠存字串,保留前導 0 與 +886;不做格式正規化。
      return { status: "set", value: String(raw).trim() };

    default: {
      const _exhaustive: never = field.type;
      return { status: "error", message: `未知欄位型別:${String(_exhaustive)}` };
    }
  }
}

export interface EncodeError {
  field_id: string;
  message: string;
}

export interface EncodeResult {
  data: Record<string, RecordValue>;
  errors: EncodeError[];
}

/**
 * 建立 record:依當前 schema 對所有欄位編碼成 sparse data_json。
 * required 欄位缺值 → error。
 */
export function encodeRecordData(fields: Field[], input: Record<string, unknown>): EncodeResult {
  const data: Record<string, RecordValue> = {};
  const errors: EncodeError[] = [];

  for (const field of fields) {
    const result = encodeField(field, input[field.id]);
    if (result.status === "error") {
      errors.push({ field_id: field.id, message: result.message });
    } else if (result.status === "set") {
      data[field.id] = result.value;
    } else if (field.required) {
      // skip 且為必填 → 缺值錯誤。
      errors.push({ field_id: field.id, message: `「${field.name}」為必填` });
    }
  }

  return { data, errors };
}

/**
 * 部分更新(inline edit):只處理 input 中出現的 field_id。
 * - set → 寫入(取代既有值)。
 * - skip(清空)→ 移除該 key(維持 sparse)。
 * 回傳要更新的值與要刪除的 key 清單,套用在既有 data_json 之上。
 */
export interface PatchResult {
  set: Record<string, RecordValue>;
  remove: string[];
  errors: EncodeError[];
}

export function patchRecordData(fields: Field[], input: Record<string, unknown>): PatchResult {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const set: Record<string, RecordValue> = {};
  const remove: string[] = [];
  const errors: EncodeError[] = [];

  for (const fieldId of Object.keys(input)) {
    const field = byId.get(fieldId);
    if (!field) continue; // 不在當前 schema 的 key 忽略(殘留 key 不可被任意寫入)
    const result = encodeField(field, input[fieldId]);
    if (result.status === "error") {
      errors.push({ field_id: fieldId, message: result.message });
    } else if (result.status === "set") {
      set[fieldId] = result.value;
    } else if (field.required) {
      // skip(清空)且為必填 → 拒絕,與 encodeRecordData 一致(必填不可被清空)。
      errors.push({ field_id: fieldId, message: `「${field.name}」為必填` });
    } else {
      remove.push(fieldId);
    }
  }

  return { set, remove, errors };
}

/** Record 對外回傳形狀(data_json 已解析)。 */
export interface RecordItem {
  id: string;
  collection_id: string;
  data: Record<string, RecordValue>;
  source: string;
  source_metadata: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
}

/** `POST /api/v1/collections/:id/records` 請求 body:依 field_id 提供值。 */
export const createRecordSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export type CreateRecordInput = z.infer<typeof createRecordSchema>;

/** `PATCH /api/v1/records/:id` 請求 body。 */
export const updateRecordSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;
