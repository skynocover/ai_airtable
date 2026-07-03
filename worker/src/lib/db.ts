/**
 * D1 存取層 —— 跨切片鐵則 #1 的落地。
 *
 * 兩條、且僅有兩條對外通道:
 *   - `globalDb(db)`   —— 非 workspace-scoped 的 bootstrap 表(users / workspaces 以 owner/id 查)。
 *   - `scopedDb(db, workspaceId)` —— 所有 workspace-scoped 表的唯一入口,自動注入 workspace_id。
 *
 * Route handler 只會從 context 拿到 `scopedDb` 實例(見 middleware/context.ts),
 * 永遠拿不到裸 D1 binding。因此「查 workspace-scoped 表卻不帶 workspace_id」
 * 在型別與架構上都不可能 —— select/insert/... 一律由 wrapper 補上 `WHERE workspace_id = ?`。
 */

import type { Workspace } from "@ai-airtable/shared";

/**
 * workspace-scoped 表的封閉清單。只有列在這裡的表能經 `scopedDb` 存取。
 * collections / records 等表由後續 change 的 migration 建立,但型別在此先行宣告,
 * 以保證任何 workspace-scoped 存取都走 scopedDb 且帶 workspace_id。
 */
export const WORKSPACE_SCOPED_TABLES = [
  "collections",
  "records",
  "schema_operations",
  "inputs",
  "form_submissions",
  "screenshot_jobs",
  "chat_sessions",
  "chat_messages",
] as const;

export type WorkspaceScopedTable = (typeof WORKSPACE_SCOPED_TABLES)[number];

type Bindable = string | number | null;

export interface SelectOptions {
  /**
   * 額外條件(不含 workspace_id;由 wrapper 自動 AND 上)。例:`"deleted_at IS NULL"`。
   *
   * ⚠️ 鐵則:`where` 是 SQL 片段、**只能放常數/欄位/運算子與 `?` 佔位符**,
   * 所有「值」一律走 `params` bind,絕不字串拼接使用者輸入。
   * 由 `assertSafeWhere` 在執行期把關(拒絕引號、分號、註解),
   * 讓「不小心把使用者輸入拼進 where」當場炸掉而非默默注入。
   */
  where?: string;
  params?: Bindable[];
  orderBy?: string;
  /**
   * 依 `data_json` 內某欄位排序(records 專用)。因 number 存 JSON number,
   * `json_extract` 的數值比較正確(非字典序)。`fieldId` 經白名單驗證,
   * path(`$.<fieldId>`)走 bind 不內插。與 `orderBy` 並存時,此項為主排序。
   */
  orderByJsonField?: { fieldId: string; direction: "asc" | "desc" };
  limit?: number;
  offset?: number;
}

export interface ScopedDb {
  readonly workspaceId: string;
  /** 查 workspace-scoped 表;自動帶 `WHERE ... AND workspace_id = ?`。 */
  select<T = Record<string, unknown>>(
    table: WorkspaceScopedTable,
    options?: SelectOptions,
  ): Promise<T[]>;
  /** 查單筆;同樣自動帶 workspace_id。 */
  first<T = Record<string, unknown>>(
    table: WorkspaceScopedTable,
    options?: SelectOptions,
  ): Promise<T | null>;
  /** 計數(同樣自動帶 workspace_id);供列表回傳 total 用。 */
  count(table: WorkspaceScopedTable, options?: SelectOptions): Promise<number>;
  /** 寫入;自動補 workspace_id 欄位,呼叫端不需(也不該)自己帶。 */
  insert(table: WorkspaceScopedTable, data: Record<string, Bindable>): Promise<void>;
  /**
   * 更新;自動 AND 上 `workspace_id`。回傳受影響列數(供樂觀鎖判斷:0 = 版本衝突/不存在)。
   * `options.where` / `params` 用法同 select(值一律走 params bind)。
   */
  update(
    table: WorkspaceScopedTable,
    data: Record<string, Bindable>,
    options?: SelectOptions,
  ): Promise<number>;
}

/** 驗證 data_json 欄位 id(防 json path 注入);只允許 `fld_` 前綴的安全字元。 */
const SAFE_FIELD_ID = /^fld_[a-z0-9_]+$/i;
function assertSafeFieldId(fieldId: string): string {
  if (!SAFE_FIELD_ID.test(fieldId)) {
    throw new Error(`不安全的 field id:${fieldId}`);
  }
  return fieldId;
}

/**
 * `where` 是直接內插進 SQL 的片段(scopedDb 的唯一原始 SQL 入口),故必須把關:
 * 拒絕字串字面值(引號)、語句分隔(分號)與 SQL 註解標記 —— 這些是「使用者輸入
 * 被拼進 where」的特徵。合法值一律走 `params` bind,所以正當的常數條件
 * (`"deleted_at IS NULL"`、`"name = ?"`)不含這些字元,不會誤擋。
 *
 * 注意:這擋的是「值被拼進 SQL」的常見誤用;它無法阻止呼叫端硬拼出
 * 不含引號的惡意片段,根本防線仍是「值走 params、where 只放常數」的契約。
 */
const UNSAFE_WHERE = /['";]|--|\/\*/;
function assertSafeWhere(where: string): string {
  if (UNSAFE_WHERE.test(where)) {
    throw new Error(`不安全的 where(值請走 params bind,勿拼接):${where}`);
  }
  return where;
}

function buildWhere(
  workspaceId: string,
  options?: SelectOptions,
): { clause: string; params: Bindable[] } {
  const extra = options?.where?.trim();
  const clause = extra ? `(${assertSafeWhere(extra)}) AND workspace_id = ?` : `workspace_id = ?`;
  const params = [...(options?.params ?? []), workspaceId];
  return { clause, params };
}

/**
 * `orderBy` 是字串內插進 SQL(無法 bind 識別字),故必須白名單化:
 * 只允許 `col [ASC|DESC]`,可逗號分隔多欄。其餘一律拒絕,防注入。
 */
const SAFE_ORDER_BY =
  /^[a-z_][a-z0-9_]*(\s+(asc|desc))?(\s*,\s*[a-z_][a-z0-9_]*(\s+(asc|desc))?)*$/i;
function assertSafeOrderBy(orderBy: string): string {
  if (!SAFE_ORDER_BY.test(orderBy.trim())) {
    throw new Error(`不安全的 orderBy:${orderBy}`);
  }
  return orderBy.trim();
}

function toBoundInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} 必須為非負整數,收到:${value}`);
  }
  return value;
}

/**
 * 判斷錯誤是否為 SQLite UNIQUE 約束違反;可選 `column` 進一步分辨是哪一欄
 * (D1 錯誤訊息含 `UNIQUE constraint failed: <table>.<column>`)。
 */
export function isUniqueViolation(e: unknown, column?: string): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  if (!/UNIQUE constraint failed/i.test(msg)) return false;
  if (!column) return true;
  // D1/SQLite 訊息形如 `UNIQUE constraint failed: workspaces.owner_id[, workspaces.slug...]`。
  // 真實 D1(workerd)在最後一欄後接 `: SQLITE_CONSTRAINT ...`,故邊界須含冒號:
  //   `... collections.workspace_id, collections.slug: SQLITE_CONSTRAINT_UNIQUE)`
  // 邊界字元集:字串結尾 / 空白 / 逗號 / 冒號 / 右括號。要求邊界是為了避免把 `owner_id`
  // 誤判成 `id` 之類的子字串相符。column 來源為程式內字面值,不含 regex 特殊字元。
  return new RegExp(`\\.${column}(?=$|[\\s,:)])`).test(msg);
}

export function scopedDb(db: D1Database, workspaceId: string): ScopedDb {
  return {
    workspaceId,

    async select<T = Record<string, unknown>>(
      table: WorkspaceScopedTable,
      options?: SelectOptions,
    ) {
      const { clause, params } = buildWhere(workspaceId, options);
      let sql = `SELECT * FROM ${table} WHERE ${clause}`;
      // 主排序:json_extract(data_json, '$.fld_x')(若指定),其 path 走 bind;次排序為 orderBy。
      const orderParts: string[] = [];
      if (options?.orderByJsonField) {
        const dir = options.orderByJsonField.direction === "desc" ? "DESC" : "ASC";
        orderParts.push(`json_extract(data_json, ?) ${dir}`);
        params.push(`$.${assertSafeFieldId(options.orderByJsonField.fieldId)}`);
      }
      if (options?.orderBy) orderParts.push(assertSafeOrderBy(options.orderBy));
      if (orderParts.length) sql += ` ORDER BY ${orderParts.join(", ")}`;
      // LIMIT/OFFSET 一律走 bind 參數,絕不字串內插 —— 杜絕注入與 `LIMIT NaN` 語法錯。
      if (options?.limit != null) {
        sql += ` LIMIT ?`;
        params.push(toBoundInteger(options.limit, "limit"));
      }
      if (options?.offset != null) {
        sql += ` OFFSET ?`;
        params.push(toBoundInteger(options.offset, "offset"));
      }
      const res = await db
        .prepare(sql)
        .bind(...params)
        .all<T>();
      return res.results ?? [];
    },

    async first<T = Record<string, unknown>>(table: WorkspaceScopedTable, options?: SelectOptions) {
      const { clause, params } = buildWhere(workspaceId, options);
      let sql = `SELECT * FROM ${table} WHERE ${clause}`;
      // 必須套用 orderBy,否則「取第一筆」會回 SQLite 任意順序(實務上是 rowid 序)的列,
      // 而非呼叫端期望的那一筆。LIMIT 恆為 1;offset 若有也走 bind 參數。
      if (options?.orderBy) sql += ` ORDER BY ${assertSafeOrderBy(options.orderBy)}`;
      sql += ` LIMIT 1`;
      if (options?.offset != null) {
        sql += ` OFFSET ?`;
        params.push(toBoundInteger(options.offset, "offset"));
      }
      return (
        (await db
          .prepare(sql)
          .bind(...params)
          .first<T>()) ?? null
      );
    },

    async count(table: WorkspaceScopedTable, options?: SelectOptions) {
      const { clause, params } = buildWhere(workspaceId, options);
      const sql = `SELECT COUNT(*) AS n FROM ${table} WHERE ${clause}`;
      const row = await db
        .prepare(sql)
        .bind(...params)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    async insert(table: WorkspaceScopedTable, data: Record<string, Bindable>) {
      const row: Record<string, Bindable> = { ...data, workspace_id: workspaceId };
      const cols = Object.keys(row);
      const placeholders = cols.map(() => "?").join(", ");
      const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
      await db
        .prepare(sql)
        .bind(...cols.map((c) => row[c]))
        .run();
    },

    async update(
      table: WorkspaceScopedTable,
      data: Record<string, Bindable>,
      options?: SelectOptions,
    ) {
      const setCols = Object.keys(data);
      if (setCols.length === 0) throw new Error("update 沒有要更新的欄位");
      const setClause = setCols.map((c) => `${c} = ?`).join(", ");
      const { clause, params: whereParams } = buildWhere(workspaceId, options);
      const sql = `UPDATE ${table} SET ${setClause} WHERE ${clause}`;
      const res = await db
        .prepare(sql)
        .bind(...setCols.map((c) => data[c]), ...whereParams)
        .run();
      return res.meta?.changes ?? 0;
    },
  };
}

/**
 * 非 workspace-scoped 的 bootstrap 存取通道。
 * 僅供 auth / workspace 解析使用(這些查詢以 user id 或 owner_id 為界,在 scope 成形之前)。
 */
export interface GlobalDb {
  getWorkspaceByOwner(ownerId: string): Promise<Workspace | null>;
  getWorkspaceById(id: string): Promise<Workspace | null>;
  createWorkspace(row: Workspace): Promise<void>;
  updateWorkspaceName(id: string, name: string, updatedAt: number): Promise<void>;
  /** 累加 AI token 用量(供 #6 配額使用;本 change 只記錄、不限制)。 */
  addAiTokensUsed(workspaceId: string, tokens: number): Promise<void>;
}

export function globalDb(db: D1Database): GlobalDb {
  return {
    async getWorkspaceByOwner(ownerId: string) {
      return (
        (await db
          .prepare(`SELECT * FROM workspaces WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1`)
          .bind(ownerId)
          .first<Workspace>()) ?? null
      );
    },

    async getWorkspaceById(id: string) {
      return (
        (await db
          .prepare(`SELECT * FROM workspaces WHERE id = ? LIMIT 1`)
          .bind(id)
          .first<Workspace>()) ?? null
      );
    },

    async createWorkspace(row: Workspace) {
      await db
        .prepare(
          `INSERT INTO workspaces
             (id, name, slug, owner_id, plan,
              records_used, screenshots_used_this_month, ai_tokens_used_this_month, quota_reset_at,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.id,
          row.name,
          row.slug,
          row.owner_id,
          row.plan,
          row.records_used,
          row.screenshots_used_this_month,
          row.ai_tokens_used_this_month,
          row.quota_reset_at,
          row.created_at,
          row.updated_at,
        )
        .run();
    },

    async updateWorkspaceName(id: string, name: string, updatedAt: number) {
      await db
        .prepare(`UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?`)
        .bind(name, updatedAt, id)
        .run();
    },

    async addAiTokensUsed(workspaceId: string, tokens: number) {
      await db
        .prepare(
          `UPDATE workspaces SET ai_tokens_used_this_month = ai_tokens_used_this_month + ? WHERE id = ?`,
        )
        .bind(tokens, workspaceId)
        .run();
    },
  };
}
