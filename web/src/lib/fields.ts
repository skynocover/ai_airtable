import type { Field, RecordValue } from "@ai-airtable/shared";

/**
 * 依 field type 與 §2.4 儲存值,產生顯示字串。
 * number + currency → Intl.NumberFormat 貨幣格式;其餘原樣顯示。底層值不變。
 */
export function formatFieldValue(field: Field, value: RecordValue | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  if (field.type === "number" && field.currency) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n)) {
      try {
        return new Intl.NumberFormat("zh-TW", {
          style: "currency",
          currency: field.currency,
        }).format(n);
      } catch {
        return String(value);
      }
    }
  }
  return String(value);
}

export type FieldInputKind = "text" | "number" | "date" | "select" | "email";

/** field type → inline edit / 新增表單該用的 input 種類。 */
export function inputKindForField(field: Field): FieldInputKind {
  switch (field.type) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "select_single":
      return "select";
    case "email":
      return "email";
    default:
      return "text"; // short_text / long_text / phone
  }
}

/** input kind → HTML `<input type>`(select 以 <select> 另行渲染,不會走到這)。 */
export function htmlInputType(kind: FieldInputKind): "text" | "number" | "date" | "email" {
  switch (kind) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "email":
      return "email";
    default:
      return "text";
  }
}
