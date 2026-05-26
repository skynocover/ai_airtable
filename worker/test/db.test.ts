import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { scopedDb, isUniqueViolation } from "../src/lib/db";
import type { WorkspaceScopedTable } from "../src/lib/db";

/**
 * 對應 project-foundation spec 的隔離 scenario:
 *   - 透過 scopedDb 查詢自動帶 workspace_id
 *   - 跨租戶讀取被隔離(ws_A 查不到 ws_B)
 *
 * 用 Node 內建 node:sqlite 跑真實 SQL,並以小型 adapter 對齊 scopedDb 期望的 D1 介面。
 * 同時記錄送出的 SQL,驗證每條 workspace-scoped 查詢都帶 `workspace_id = ?`。
 */

const TABLE = "records" as WorkspaceScopedTable;

function makeD1(sqlite: DatabaseSync, sqlLog: string[]) {
  return {
    prepare(sql: string) {
      sqlLog.push(sql);
      let params: unknown[] = [];
      const stmt = {
        bind(...p: unknown[]) {
          params = p;
          return stmt;
        },
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...(params as never[])) as T[] };
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
        },
        async run() {
          return sqlite.prepare(sql).run(...(params as never[]));
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function seed() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE records (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT)`);
  sqlite.exec(`INSERT INTO records (id, workspace_id, name) VALUES
    ('a1', 'ws_A', 'Alice row 1'),
    ('a2', 'ws_A', 'Alice row 2'),
    ('b1', 'ws_B', 'Bob row 1')`);
  return sqlite;
}

test("scopedDb 自動注入 workspace_id 且隔離跨租戶讀取", async () => {
  const sqlite = seed();
  const sqlLog: string[] = [];
  const d1 = makeD1(sqlite, sqlLog);

  const rowsA = await scopedDb(d1, "ws_A").select<{ id: string; workspace_id: string }>(TABLE);
  assert.equal(rowsA.length, 2, "ws_A 應只看到自己的 2 筆");
  assert.ok(
    rowsA.every((r) => r.workspace_id === "ws_A"),
    "不應出現其他 workspace 的列",
  );

  const rowsB = await scopedDb(d1, "ws_B").select<{ id: string }>(TABLE);
  assert.equal(rowsB.length, 1, "ws_B 應只看到自己的 1 筆");

  // 產生的 SQL 必須帶 workspace_id 條件
  assert.ok(
    sqlLog.every((sql) => !sql.startsWith("SELECT") || sql.includes("workspace_id = ?")),
    "每條 SELECT 都必須含 workspace_id = ?",
  );
});

test("scopedDb.select 套用額外條件時仍 AND 上 workspace_id", async () => {
  const sqlite = seed();
  const sqlLog: string[] = [];
  const d1 = makeD1(sqlite, sqlLog);

  const rows = await scopedDb(d1, "ws_A").select<{ id: string }>(TABLE, {
    where: "name = ?",
    params: ["Alice row 1"],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "a1");

  const lastSql = sqlLog[sqlLog.length - 1];
  assert.ok(
    lastSql.includes("(name = ?) AND workspace_id = ?"),
    `SQL 應同時帶兩個條件: ${lastSql}`,
  );
});

test("scopedDb.select 的 limit/offset 走 bind 參數(不字串內插)", async () => {
  const sqlite = seed();
  const sqlLog: string[] = [];
  const d1 = makeD1(sqlite, sqlLog);

  const rows = await scopedDb(d1, "ws_A").select<{ id: string }>(TABLE, {
    orderBy: "id asc",
    limit: 1,
    offset: 1,
  });
  assert.equal(rows.length, 1);
  const sql = sqlLog[sqlLog.length - 1];
  assert.ok(sql.includes("LIMIT ?") && sql.includes("OFFSET ?"), `應使用 bind 佔位符: ${sql}`);
  assert.ok(!/LIMIT\s+\d/.test(sql), "limit 不應被內插為字面值");
});

test("scopedDb.select 拒絕非法 orderBy 與非整數 limit", async () => {
  const sqlite = seed();
  const d1 = makeD1(sqlite, []);
  const db = scopedDb(d1, "ws_A");

  await assert.rejects(() => db.select(TABLE, { orderBy: "id; DROP TABLE records" }));
  await assert.rejects(() => db.select(TABLE, { limit: 1.5 }));
  await assert.rejects(() => db.select(TABLE, { limit: -1 }));
});

test("scopedDb.select 的 where 拒絕引號/分號/註解(防值被拼進 SQL)", async () => {
  const sqlite = seed();
  const d1 = makeD1(sqlite, []);
  const db = scopedDb(d1, "ws_A");

  // 把使用者輸入拼進 where 的典型誤用,應當場炸掉而非默默注入。
  await assert.rejects(() => db.select(TABLE, { where: "name = 'Alice row 1'" }), /不安全的 where/);
  await assert.rejects(
    () => db.select(TABLE, { where: "1=1; DROP TABLE records" }),
    /不安全的 where/,
  );
  await assert.rejects(
    () => db.select(TABLE, { where: "name = ? -- x", params: ["x"] }),
    /不安全的 where/,
  );
  await assert.rejects(() => db.first(TABLE, { where: "name = '\" OR 1=1" }), /不安全的 where/);

  // 正當的常數條件(值走 params)不應被誤擋。
  await assert.doesNotReject(() =>
    db.select(TABLE, { where: "name = ?", params: ["Alice row 1"] }),
  );
});

test("scopedDb.insert 自動補上當前 workspace_id", async () => {
  const sqlite = seed();
  const d1 = makeD1(sqlite, []);

  await scopedDb(d1, "ws_A").insert(TABLE, { id: "a3", name: "Alice row 3" });

  const row = sqlite.prepare(`SELECT workspace_id FROM records WHERE id = 'a3'`).get() as {
    workspace_id: string;
  };
  assert.equal(row.workspace_id, "ws_A", "插入的列應自動帶上 ws_A");
});

test("scopedDb.first 套用 orderBy 取得期望的那一筆(而非任意順序)", async () => {
  const sqlite = seed();
  const d1 = makeD1(sqlite, []);
  const db = scopedDb(d1, "ws_A");

  const firstDesc = await db.first<{ id: string }>(TABLE, { orderBy: "id desc" });
  assert.equal(firstDesc?.id, "a2", "id desc 應取 a2");

  const firstAsc = await db.first<{ id: string }>(TABLE, { orderBy: "id asc" });
  assert.equal(firstAsc?.id, "a1", "id asc 應取 a1");
});

test("scopedDb.first 的 orderBy 同樣經過白名單防注入", async () => {
  const sqlite = seed();
  const d1 = makeD1(sqlite, []);
  const db = scopedDb(d1, "ws_A");

  await assert.rejects(() => db.first(TABLE, { orderBy: "id; DROP TABLE records" }));
});

test("isUniqueViolation 精準分辨欄位(子字串不誤判)", () => {
  const ownerErr = new Error("UNIQUE constraint failed: workspaces.owner_id");
  const slugErr = new Error("UNIQUE constraint failed: workspaces.slug");
  const multiErr = new Error("UNIQUE constraint failed: workspaces.owner_id, workspaces.slug");

  assert.equal(isUniqueViolation(ownerErr), true, "任何 UNIQUE 違反皆為 true");
  assert.equal(isUniqueViolation(ownerErr, "owner_id"), true);
  assert.equal(isUniqueViolation(ownerErr, "slug"), false, "owner_id 違反不應被當成 slug");
  // `id` 是 `owner_id` 的子字串,但不該因此誤判。
  assert.equal(isUniqueViolation(ownerErr, "id"), false, "子字串不應誤判");
  assert.equal(isUniqueViolation(slugErr, "slug"), true);
  assert.equal(isUniqueViolation(multiErr, "slug"), true, "多欄位訊息中含 slug 應為 true");
  assert.equal(isUniqueViolation(new Error("some other error"), "slug"), false);
});
