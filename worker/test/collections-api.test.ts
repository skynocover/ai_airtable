import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import type { AppBindings } from "../src/types";
import { scopedDb } from "../src/lib/db";
import { collectionRoutes } from "../src/routes/collections";
import { recordRoutes } from "../src/routes/records";

/**
 * Route 級整合測試:用 node:sqlite 跑真實 SQL(載入 0002 migration),
 * 以 x-test-ws / x-test-user header 模擬多租戶 context(略過真實 auth)。
 * 覆蓋:collection CRUD + 隔離、operations 樂觀鎖 + audit、records CRUD + 排序 + 匯出。
 */

const MIGRATION_0001 = new URL("../../migrations/0001_initial.sql", import.meta.url);
const MIGRATION_0002 = new URL("../../migrations/0002_collections_records.sql", import.meta.url);

function makeD1(sqlite: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const stmt = {
        bind(...p: unknown[]) {
          params = p;
          return stmt;
        },
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...(params as never[])) as T[], success: true };
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
        },
        async run() {
          const r = sqlite.prepare(sql).run(...(params as never[]));
          return { success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function makeApp(d1: D1Database) {
  const app = new Hono<AppBindings>();
  app.use("*", async (c, next) => {
    const ws = c.req.header("x-test-ws") ?? "ws_A";
    const user = c.req.header("x-test-user") ?? "user_1";
    c.set("workspaceId", ws);
    c.set("userId", user);
    c.set("db", scopedDb(d1, ws));
    await next();
  });
  app.route("/api/v1/collections", collectionRoutes);
  app.route("/api/v1/records", recordRoutes);
  return app;
}

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  // 不 seed users/workspaces;關閉 FK 強制以便獨立測 collections/records 邏輯。
  sqlite.exec("PRAGMA foreign_keys = OFF;");
  sqlite.exec(readFileSync(MIGRATION_0001, "utf8"));
  sqlite.exec(readFileSync(MIGRATION_0002, "utf8"));
  const d1 = makeD1(sqlite);
  const app = makeApp(d1);
  return { app, sqlite };
}

function req(
  app: Hono<AppBindings>,
  method: string,
  path: string,
  opts?: { ws?: string; body?: unknown },
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.ws) headers["x-test-ws"] = opts.ws;
  return app.request(path, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function createCollection(app: Hono<AppBindings>, body: unknown, ws?: string) {
  const res = await req(app, "POST", "/api/v1/collections", { body, ws });
  return res;
}

test("建立 collection + 列表 + 取得(含 schema)", async () => {
  const { app } = setup();
  const res = await createCollection(app, {
    name: "客戶名單",
    icon: "📇",
    fields: [
      { name: "姓名", type: "short_text", required: true },
      { name: "預算", type: "number", currency: "TWD" },
    ],
  });
  assert.equal(res.status, 201);
  const col = (await res.json()) as any;
  assert.ok(col.id.startsWith("col_"));
  assert.equal(col.schema_version, 1);
  assert.equal(col.schema.fields.length, 2);
  assert.equal(col.schema.fields[0].order, 0);

  const listRes = await req(app, "GET", "/api/v1/collections");
  const list = (await listRes.json()) as any;
  assert.equal(list.collections.length, 1);

  const getRes = await req(app, "GET", `/api/v1/collections/${col.id}`);
  assert.equal(getRes.status, 200);
});

test("slug 在 workspace 內唯一(同名第二個加後綴)", async () => {
  const { app } = setup();
  const a = (await (await createCollection(app, { name: "資料表" })).json()) as any;
  const b = (await (await createCollection(app, { name: "資料表" })).json()) as any;
  assert.notEqual(a.slug, b.slug, "同名 collection 應有不同 slug");
});

test("多租戶隔離:ws_B 看不到也取不到 ws_A 的 collection", async () => {
  const { app } = setup();
  const col = (await (await createCollection(app, { name: "A 的表" }, "ws_A")).json()) as any;

  const listB = (await (
    await req(app, "GET", "/api/v1/collections", { ws: "ws_B" })
  ).json()) as any;
  assert.equal(listB.collections.length, 0, "ws_B 列表不應含 ws_A 的 collection");

  const getB = await req(app, "GET", `/api/v1/collections/${col.id}`, { ws: "ws_B" });
  assert.equal(getB.status, 404, "ws_B 取 ws_A 的 collection 應回 404");
});

test("PATCH 改名 / DELETE 軟刪除", async () => {
  const { app } = setup();
  const col = (await (await createCollection(app, { name: "原名" })).json()) as any;

  const patched = (await (
    await req(app, "PATCH", `/api/v1/collections/${col.id}`, { body: { name: "新名" } })
  ).json()) as any;
  assert.equal(patched.name, "新名");

  const del = await req(app, "DELETE", `/api/v1/collections/${col.id}`);
  assert.equal(del.status, 200);
  const list = (await (await req(app, "GET", "/api/v1/collections")).json()) as any;
  assert.equal(list.collections.length, 0, "軟刪除後不應出現在列表");
});

test("operations:版本相符成功、+1、寫 audit;版本衝突 409 且 snapshot 不變", async () => {
  const { app } = setup();
  const col = (await (await createCollection(app, { name: "表" })).json()) as any;

  const ok = await req(app, "POST", `/api/v1/collections/${col.id}/operations`, {
    body: {
      schema_version: 1,
      operations: [{ op: "add_field", field: { name: "電話", type: "phone" } }],
    },
  });
  assert.equal(ok.status, 200);
  const updated = (await ok.json()) as any;
  assert.equal(updated.schema_version, 2);
  assert.equal(updated.schema.fields.length, 1);

  // audit log 有紀錄。
  const ops = (await (
    await req(app, "GET", `/api/v1/collections/${col.id}/operations`)
  ).json()) as any;
  assert.equal(ops.operations.length, 1);
  assert.equal(ops.operations[0].applied_by, "user");

  // 版本衝突:用過時的 schema_version=1。
  const conflict = await req(app, "POST", `/api/v1/collections/${col.id}/operations`, {
    body: {
      schema_version: 1,
      operations: [{ op: "add_field", field: { name: "備註", type: "long_text" } }],
    },
  });
  assert.equal(conflict.status, 409);
  const fresh = (await (
    await req(app, "GET", `/api/v1/collections/${col.id}/schema`)
  ).json()) as any;
  assert.equal(fresh.schema_version, 2, "衝突後 snapshot/version 不變");
  assert.equal(fresh.schema.fields.length, 1);
});

test("operations:拒絕 change_field_type(更新含 type 被擋)", async () => {
  const { app } = setup();
  const col = (await (
    await createCollection(app, { name: "表", fields: [{ name: "數量", type: "number" }] })
  ).json()) as any;
  const fieldId = col.schema.fields[0].id;
  const res = await req(app, "POST", `/api/v1/collections/${col.id}/operations`, {
    body: {
      schema_version: 1,
      operations: [{ op: "update_field_meta", field_id: fieldId, updates: { type: "short_text" } }],
    },
  });
  assert.equal(res.status, 400, "帶 type 的 update_field_meta 應被拒");
});

test("records:新增、列表(不跨 ws)、軟刪除不出現、number 數值排序", async () => {
  const { app } = setup();
  const col = (await (
    await createCollection(app, {
      name: "預算表",
      fields: [
        { name: "名稱", type: "short_text" },
        { name: "金額", type: "number", currency: "TWD" },
      ],
    })
  ).json()) as any;
  const nameId = col.schema.fields[0].id;
  const amtId = col.schema.fields[1].id;

  // 三筆,金額 9 / 100 / 50 —— 字典序會把 "100" 排在 "50" 前,數值序則 100 最大。
  for (const [n, a] of [
    ["甲", 9],
    ["乙", 100],
    ["丙", 50],
  ] as const) {
    const r = await req(app, "POST", `/api/v1/collections/${col.id}/records`, {
      body: { data: { [nameId]: n, [amtId]: a } },
    });
    assert.equal(r.status, 201);
  }

  const list = (await (
    await req(app, "GET", `/api/v1/collections/${col.id}/records?sort=${amtId}:desc`)
  ).json()) as any;
  assert.equal(list.total, 3);
  assert.deepEqual(
    list.records.map((rec: any) => rec.data[amtId]),
    [100, 50, 9],
    "number 應為數值序(非字典序)",
  );
  // number 存為 JSON number。
  assert.equal(typeof list.records[0].data[amtId], "number");

  // 跨租戶:ws_B 看不到。
  const listB = (await (
    await req(app, "GET", `/api/v1/collections/${col.id}/records`, { ws: "ws_B" })
  ).json()) as any;
  // ws_B 取 ws_A 的 collection 應 404(loadCollectionRow 查不到)。
  assert.ok(listB.error || (listB.records && listB.records.length === 0));

  // 軟刪除一筆 → 不出現在列表。
  const recId = list.records[0].id;
  const del = await req(app, "DELETE", `/api/v1/records/${recId}`);
  assert.equal(del.status, 200);
  const after = (await (
    await req(app, "GET", `/api/v1/collections/${col.id}/records`)
  ).json()) as any;
  assert.equal(after.total, 2, "軟刪除後 total 應為 2");
});

test("records:inline edit(PATCH 維持 sparse)", async () => {
  const { app } = setup();
  const col = (await (
    await createCollection(app, { name: "表", fields: [{ name: "備註", type: "short_text" }] })
  ).json()) as any;
  const fid = col.schema.fields[0].id;
  const rec = (await (
    await req(app, "POST", `/api/v1/collections/${col.id}/records`, {
      body: { data: { [fid]: "舊" } },
    })
  ).json()) as any;

  const patched = (await (
    await req(app, "PATCH", `/api/v1/records/${rec.id}`, { body: { data: { [fid]: "新" } } })
  ).json()) as any;
  assert.equal(patched.data[fid], "新");

  // 清空 → 移除 key(sparse)。
  const cleared = (await (
    await req(app, "PATCH", `/api/v1/records/${rec.id}`, { body: { data: { [fid]: "" } } })
  ).json()) as any;
  assert.ok(!(fid in cleared.data), "清空後不應有該 key");
});

test("CSV 匯出:含 BOM、表頭為欄位名、範圍限當前 collection", async () => {
  const { app } = setup();
  const col = (await (
    await createCollection(app, {
      name: "匯出表",
      fields: [
        { name: "姓名", type: "short_text" },
        { name: "金額", type: "number", currency: "TWD" },
      ],
    })
  ).json()) as any;
  const [nameId, amtId] = col.schema.fields.map((f: any) => f.id);
  await req(app, "POST", `/api/v1/collections/${col.id}/records`, {
    body: { data: { [nameId]: "王大明", [amtId]: 50000 } },
  });

  const res = await req(app, "POST", `/api/v1/collections/${col.id}/records/export`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
  // 以原始 bytes 驗 BOM(text() 解碼會吃掉前導 BOM)。
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([bytes[0], bytes[1], bytes[2]], [0xef, 0xbb, 0xbf], "應有 UTF-8 BOM");
  const text = new TextDecoder("utf-8").decode(bytes);
  assert.match(text, /姓名,金額/, "表頭為欄位名");
  assert.match(text, /王大明,50000/, "金額為原始數字(無貨幣符號)");

  // ws_B 匯出 ws_A 的 collection → 404。
  const resB = await req(app, "POST", `/api/v1/collections/${col.id}/records/export`, {
    ws: "ws_B",
  });
  assert.equal(resB.status, 404);
});
