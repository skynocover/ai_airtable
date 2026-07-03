import type { Collection } from "@ai-airtable/shared";

/**
 * System prompt 組裝(對齊 PLAN.md §5.6.1):
 *   產品上下文 + workspace 所有 collections 簡介 + 當前綁定 collection 的完整 schema + tool 使用規則。
 * 截圖抽取格式指令不在此 change(留 #4)—— 本 prompt 聚焦 schema 操作與查詢。
 */
export function buildSystemPrompt(opts: {
  collections: Collection[];
  context: Collection | null;
  nowIso: string;
}): string {
  const { collections, context, nowIso } = opts;

  const lines: string[] = [];
  lines.push(
    "你是「AI 資料工作台」的助理,協助使用者用對話建立與整理資料表(Collection)。",
    "產品規則(務必遵守):",
    "- 建新表:用 create_collection,直接建立、立即生效。",
    "- 改既有表的欄位結構(加/改/刪/重排):一律用 propose_schema_operations 提『提案』,由使用者在介面確認,你不能直接改。",
    "- 查資料:用 query_records(structured filter/sort),拿到結果後用自然語言回答;不要自己編造數字。",
    "- 欄位只有 7 種型別:short_text, long_text, number, select_single, date, email, phone。金額用 number + currency(如 TWD),沒有獨立 currency 型別。",
    "- 本階段對話不能新增/編輯 record 資料,只能查資料與建/改 schema。",
    `目前時間:${nowIso}(查詢相對時間如「上週」時據此計算)。`,
    "",
  );

  if (collections.length === 0) {
    lines.push("目前 workspace 還沒有任何 Collection。");
  } else {
    lines.push("目前 workspace 的 Collections:");
    for (const c of collections) {
      lines.push(`- ${c.name}(id: ${c.id}, ${c.schema.fields.length} 個欄位）`);
    }
  }
  lines.push("");

  if (context) {
    lines.push(
      `當前對話綁定的 Collection:「${context.name}」(id: ${context.id})`,
      `schema_version: ${context.schema_version}(propose_schema_operations 需帶此版本）`,
      "欄位:",
    );
    if (context.schema.fields.length === 0) {
      lines.push("(尚無欄位)");
    } else {
      for (const f of context.schema.fields) {
        const bits = [`type=${f.type}`];
        if (f.required) bits.push("required");
        if (f.currency) bits.push(`currency=${f.currency}`);
        if (f.options?.length) bits.push(`options=[${f.options.join(", ")}]`);
        if (f.ai_hint) bits.push(`hint=${f.ai_hint}`);
        lines.push(`- ${f.name}(id: ${f.id}, ${bits.join(", ")})`);
      }
    }
  } else {
    lines.push("當前對話未綁定特定 Collection。若要改/查某表,先確認是哪一個。");
  }

  return lines.join("\n");
}
