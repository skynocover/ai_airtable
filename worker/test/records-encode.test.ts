import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeField, encodeRecordData, patchRecordData, type Field } from "@ai-airtable/shared";

/**
 * 對應 schema-operations spec §2.4 的儲存格式 scenarios:
 *   - number 存 JSON number、phone 保留前導 0、空值不存 key、select 非法值留空。
 */

function field(partial: Partial<Field> & Pick<Field, "id" | "type">): Field {
  return {
    name: partial.id,
    required: false,
    order: 0,
    ...partial,
  } as Field;
}

test("short_text / long_text 存為字串", () => {
  assert.deepEqual(encodeField(field({ id: "fld_a", type: "short_text" }), "王大明"), {
    status: "set",
    value: "王大明",
  });
});

test("number 存為 JSON number(非字串、不含符號)", () => {
  const f = field({ id: "fld_n", type: "number" });
  assert.deepEqual(encodeField(f, 50000), { status: "set", value: 50000 });
  // 數字字串會被轉成 number。
  assert.deepEqual(encodeField(f, "50000"), { status: "set", value: 50000 });
  // 非數字 → error。
  assert.equal(encodeField(f, "abc").status, "error");
});

test("number 違反 min/max → error", () => {
  const f = field({ id: "fld_n", type: "number", min: 0, max: 100 });
  assert.equal(encodeField(f, -1).status, "error");
  assert.equal(encodeField(f, 101).status, "error");
  assert.deepEqual(encodeField(f, 50), { status: "set", value: 50 });
});

test("phone 存為字串並保留前導 0", () => {
  const f = field({ id: "fld_p", type: "phone" });
  assert.deepEqual(encodeField(f, "0912345678"), { status: "set", value: "0912345678" });
  // 即使傳入 number 也轉成字串(避免前導 0 遺失,雖然 JSON 不會這樣傳)。
  assert.deepEqual(encodeField(f, "+886912345678"), { status: "set", value: "+886912345678" });
});

test("date 須為 YYYY-MM-DD", () => {
  const f = field({ id: "fld_d", type: "date" });
  assert.deepEqual(encodeField(f, "2026-05-25"), { status: "set", value: "2026-05-25" });
  assert.equal(encodeField(f, "2026/05/25").status, "error");
  assert.equal(encodeField(f, "2026-13-40").status, "error");
});

test("email 須為有效格式", () => {
  const f = field({ id: "fld_e", type: "email" });
  assert.deepEqual(encodeField(f, "a@b.com"), { status: "set", value: "a@b.com" });
  assert.equal(encodeField(f, "notanemail").status, "error");
});

test("select_single 非法值留空(skip,不報錯)", () => {
  const f = field({ id: "fld_s", type: "select_single", options: ["設計", "工程"] });
  assert.deepEqual(encodeField(f, "設計"), { status: "set", value: "設計" });
  assert.deepEqual(encodeField(f, "行銷"), { status: "skip" });
});

test("空值 → skip(sparse,不存 key)", () => {
  const f = field({ id: "fld_a", type: "short_text" });
  assert.deepEqual(encodeField(f, ""), { status: "skip" });
  assert.deepEqual(encodeField(f, "   "), { status: "skip" });
  assert.deepEqual(encodeField(f, null), { status: "skip" });
  assert.deepEqual(encodeField(f, undefined), { status: "skip" });
});

test("encodeRecordData 產出 sparse data_json,缺必填則 error", () => {
  const fields: Field[] = [
    field({ id: "fld_name", type: "short_text", required: true }),
    field({ id: "fld_budget", type: "number", currency: "TWD" }),
    field({ id: "fld_note", type: "long_text" }),
  ];
  const ok = encodeRecordData(fields, { fld_name: "王大明", fld_budget: 50000 });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.data, { fld_name: "王大明", fld_budget: 50000 });
  assert.ok(!("fld_note" in ok.data), "空欄位不應產生 key");

  const missing = encodeRecordData(fields, { fld_budget: 50000 });
  assert.equal(missing.errors.length, 1, "缺必填 fld_name 應報錯");
});

test("patchRecordData:set 取代、清空移除 key、忽略殘留 key", () => {
  const fields: Field[] = [field({ id: "fld_a", type: "short_text" })];
  const r = patchRecordData(fields, { fld_a: "新值", fld_orphan: "x" });
  assert.deepEqual(r.set, { fld_a: "新值" });
  assert.deepEqual(r.remove, []);

  const cleared = patchRecordData(fields, { fld_a: "" });
  assert.deepEqual(cleared.remove, ["fld_a"]);
  assert.deepEqual(cleared.set, {});
});
