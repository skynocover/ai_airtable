import { test } from "node:test";
import assert from "node:assert/strict";
import type { CollectionSchemaJson, SchemaOperation } from "@ai-airtable/shared";
import {
  applyOperation,
  applyOperations,
  buildInitialSchema,
  SchemaOpError,
} from "../src/lib/schema-ops";

/** 對應 schema-operations spec:5 種 operation apply 到 snapshot、拒絕 change_field_type 等。 */

function base(): CollectionSchemaJson {
  return {
    fields: [
      { id: "fld_name", name: "姓名", type: "short_text", required: true, order: 0 },
      {
        id: "fld_budget",
        name: "預算",
        type: "number",
        required: false,
        order: 1,
        currency: "TWD",
      },
    ],
  };
}

test("add_field 寫入 snapshot 並依 at_order 插入", () => {
  const op: SchemaOperation = {
    op: "add_field",
    field: { id: "fld_phone", name: "電話", type: "phone" },
    at_order: 1,
  };
  const next = applyOperation(base(), op);
  assert.equal(next.fields.length, 3);
  assert.equal(next.fields[1].id, "fld_phone");
  // order reindex 為陣列索引。
  assert.deepEqual(
    next.fields.map((f) => f.order),
    [0, 1, 2],
  );
});

test("add_field 無 id 時自動生成 fld_ 前綴", () => {
  const next = applyOperation(base(), {
    op: "add_field",
    field: { name: "備註", type: "long_text" },
  });
  const added = next.fields[next.fields.length - 1];
  assert.ok(added.id.startsWith("fld_"), `應自動生成 id: ${added.id}`);
});

test("remove_field 從 snapshot 移除(不影響 records 資料)", () => {
  const next = applyOperation(base(), { op: "remove_field", field_id: "fld_budget" });
  assert.deepEqual(
    next.fields.map((f) => f.id),
    ["fld_name"],
  );
});

test("rename_field 改名", () => {
  const next = applyOperation(base(), {
    op: "rename_field",
    field_id: "fld_name",
    new_name: "客戶姓名",
  });
  assert.equal(next.fields[0].name, "客戶姓名");
});

test("update_field_meta 改 required / currency,但不可改 type", () => {
  const next = applyOperation(base(), {
    op: "update_field_meta",
    field_id: "fld_budget",
    updates: { required: true, currency: "USD" },
  });
  assert.equal(next.fields[1].required, true);
  assert.equal(next.fields[1].currency, "USD");
  assert.equal(next.fields[1].type, "number", "type 不應被改動");
});

test("reorder_fields 重排;非排列則拒絕", () => {
  const next = applyOperation(base(), {
    op: "reorder_fields",
    field_ids: ["fld_budget", "fld_name"],
  });
  assert.deepEqual(
    next.fields.map((f) => f.id),
    ["fld_budget", "fld_name"],
  );
  assert.throws(
    () => applyOperation(base(), { op: "reorder_fields", field_ids: ["fld_budget"] }),
    SchemaOpError,
  );
});

test("add_field select_single 無 options 被拒", () => {
  assert.throws(
    () =>
      applyOperation(base(), { op: "add_field", field: { name: "類別", type: "select_single" } }),
    SchemaOpError,
  );
});

test("操作不存在的欄位被拒", () => {
  assert.throws(
    () => applyOperation(base(), { op: "remove_field", field_id: "fld_x" }),
    SchemaOpError,
  );
  assert.throws(
    () => applyOperation(base(), { op: "rename_field", field_id: "fld_x", new_name: "y" }),
    SchemaOpError,
  );
});

test("applyOperations 依序套用多個 op", () => {
  const ops: SchemaOperation[] = [
    { op: "add_field", field: { id: "fld_email", name: "Email", type: "email" } },
    { op: "remove_field", field_id: "fld_budget" },
  ];
  const next = applyOperations(base(), ops);
  assert.deepEqual(
    next.fields.map((f) => f.id),
    ["fld_name", "fld_email"],
  );
});

test("buildInitialSchema 正規化初始欄位並 reindex", () => {
  const schema = buildInitialSchema([
    { name: "姓名", type: "short_text", required: true },
    { name: "類別", type: "select_single", options: ["A", "B"] },
  ]);
  assert.equal(schema.fields.length, 2);
  assert.deepEqual(
    schema.fields.map((f) => f.order),
    [0, 1],
  );
  assert.ok(schema.fields.every((f) => f.id.startsWith("fld_")));
});
