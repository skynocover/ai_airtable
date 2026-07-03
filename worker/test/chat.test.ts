import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import type { AppBindings } from "../src/types";
import { scopedDb } from "../src/lib/db";
import { chatRoutes } from "../src/routes/chat";
import { collectionRoutes } from "../src/routes/collections";
import { executeTool } from "../src/ai/handlers";
import { loadCollectionRow } from "../src/lib/collections";

/**
 * 覆蓋:chat session CRUD + 多租戶隔離、AI tool handler(create 直接建立 / 非法型別拒 /
 * propose 不寫 DB / query_records 走 created_at + 限 workspace + 不灌 raw records)。
 * 不含 SSE + Claude 呼叫(需外部 gateway)—— 那走手動/spike 驗證。
 */

const MIGRATION_0001 = new URL("../../migrations/0001_initial.sql", import.meta.url);
const MIGRATION_0002 = new URL("../../migrations/0002_collections_records.sql", import.meta.url);
const MIGRATION_0003 = new URL("../../migrations/0003_chat.sql", import.meta.url);

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
  app.route("/api/v1/chat", chatRoutes);
  app.route("/api/v1/collections", collectionRoutes);
  return app;
}

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = OFF;");
  sqlite.exec(readFileSync(MIGRATION_0001, "utf8"));
  sqlite.exec(readFileSync(MIGRATION_0002, "utf8"));
  sqlite.exec(readFileSync(MIGRATION_0003, "utf8"));
  const d1 = makeD1(sqlite);
  return { d1, app: makeApp(d1) };
}

function req(
  app: Hono<AppBindings>,
  method: string,
  path: string,
  opts?: { ws?: string; user?: string; body?: unknown },
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.ws) headers["x-test-ws"] = opts.ws;
  if (opts?.user) headers["x-test-user"] = opts.user;
  return app.request(
    path,
    {
      method,
      headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    },
    { DB: d1ForApp } as unknown as AppBindings["Bindings"],
  );
}

// DELETE 走 c.env.DB —— 用模組層變數把 d1 傳進去(每個 setup 重設)。
let d1ForApp: D1Database;

test("chat session:建立 / 列出 / 綁 context / 多租戶隔離", async () => {
  const { d1, app } = setup();
  d1ForApp = d1;

  // 先建一個 collection 當 context。
  const col = (await (
    await req(app, "POST", "/api/v1/collections", { body: { name: "客戶" } })
  ).json()) as any;

  const created = (await (
    await req(app, "POST", "/api/v1/chat/sessions", {
      body: { context_collection_id: col.id },
    })
  ).json()) as any;
  assert.ok(created.id.startsWith("chat_"));
  assert.equal(created.context_collection_id, col.id);

  const listA = (await (await req(app, "GET", "/api/v1/chat/sessions")).json()) as any;
  assert.equal(listA.sessions.length, 1);

  // ws_B 看不到 ws_A 的 session。
  const listB = (await (
    await req(app, "GET", "/api/v1/chat/sessions", { ws: "ws_B" })
  ).json()) as any;
  assert.equal(listB.sessions.length, 0);

  // ws_B 取 ws_A 的訊息 → 404(session 不在其 workspace)。
  const msgsB = await req(app, "GET", `/api/v1/chat/sessions/${created.id}/messages`, {
    ws: "ws_B",
  });
  assert.equal(msgsB.status, 404);

  // ws_A 取自己的訊息 → 空。
  const msgsA = (await (
    await req(app, "GET", `/api/v1/chat/sessions/${created.id}/messages`)
  ).json()) as any;
  assert.equal(msgsA.messages.length, 0);
  assert.equal(msgsA.session.context_collection_id, col.id);
});

test("create_collection tool:直接建立、綁當前 workspace", async () => {
  const { d1 } = setup();
  const db = scopedDb(d1, "ws_A");
  const outcome = await executeTool(db, "create_collection", {
    name: "報名表",
    initial_fields: [
      { name: "姓名", type: "short_text" },
      { name: "預算", type: "number", currency: "TWD" },
    ],
  });
  assert.equal(outcome.card.type, "create_collection");
  assert.equal(outcome.card.status, "created");
  const colId = (outcome.card as any).collection_id;
  assert.ok(colId.startsWith("col_"));

  // 真的建立、且在 ws_A;ws_B 查不到。
  assert.ok(await loadCollectionRow(db, colId));
  assert.equal(await loadCollectionRow(scopedDb(d1, "ws_B"), colId), null);
});

test("create_collection tool:非法型別(currency)被拒", async () => {
  const { d1 } = setup();
  const db = scopedDb(d1, "ws_A");
  const outcome = await executeTool(db, "create_collection", {
    name: "壞表",
    initial_fields: [{ name: "金額", type: "currency" }],
  });
  assert.equal(outcome.card.status, "error");
  assert.equal(outcome.toolResult.isError, true);
});

test("propose_schema_operations tool:只提案、不改 schema/version", async () => {
  const { d1 } = setup();
  const db = scopedDb(d1, "ws_A");
  const col = await executeTool(db, "create_collection", {
    name: "表",
    initial_fields: [{ name: "名稱", type: "short_text" }],
  });
  const colId = (col.card as any).collection_id;
  const before = await loadCollectionRow(db, colId);

  const outcome = await executeTool(db, "propose_schema_operations", {
    collection_id: colId,
    schema_version: 1,
    operations: [{ op: "add_field", field: { name: "電話", type: "phone" } }],
    reason: "加電話欄位",
  });
  assert.equal(outcome.card.type, "schema_operation");
  assert.equal(outcome.card.status, "pending");

  // current_schema_json / schema_version 完全不變(鐵則 #2:propose 不寫 DB)。
  const after = await loadCollectionRow(db, colId);
  assert.equal(after!.schema_version, before!.schema_version);
  assert.equal(after!.current_schema_json, before!.current_schema_json);
});

test("query_records tool:created_at filter、限 workspace、回摘要不灌 raw", async () => {
  const { d1 } = setup();
  const db = scopedDb(d1, "ws_A");
  const col = await executeTool(db, "create_collection", {
    name: "訂單",
    initial_fields: [{ name: "金額", type: "number", currency: "TWD" }],
  });
  const colId = (col.card as any).collection_id;
  const amtId = (await loadCollectionRow(db, colId))!;
  const schema = JSON.parse(amtId.current_schema_json);
  const fieldId = schema.fields[0].id;

  // 塞兩筆(created_at 皆為現在)。
  const now = Date.now();
  for (const [rid, v] of [
    ["rec_1", 100],
    ["rec_2", 900],
  ] as const) {
    await db.insert("records", {
      id: rid,
      collection_id: colId,
      data_json: JSON.stringify({ [fieldId]: v }),
      source: "manual",
      source_metadata_json: null,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  // 「上週以來」→ created_at >= 7 天前;兩筆都符合,依金額 desc 排序。
  const weekAgo = new Date(now - 7 * 86400_000).toISOString().slice(0, 10);
  const outcome = await executeTool(db, "query_records", {
    collection_id: colId,
    filter: [{ field_id: "created_at", op: "gt", value: weekAgo }],
    sort: [{ field_id: fieldId, direction: "desc" }],
  });
  assert.equal(outcome.card.status, "ok");
  assert.equal((outcome.card as any).total, 2);
  const rows = (outcome.card as any).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["金額"], 900, "應依金額數值序 desc");

  // toolResult 是結構化摘要(有 total),不是整包 raw record 列。
  const summary = JSON.parse(outcome.toolResult.content);
  assert.equal(summary.total, 2);

  // ws_B 查同一 collection → 找不到(不跨租戶)。
  const outcomeB = await executeTool(scopedDb(d1, "ws_B"), "query_records", {
    collection_id: colId,
  });
  assert.equal(outcomeB.card.status, "error");
});
