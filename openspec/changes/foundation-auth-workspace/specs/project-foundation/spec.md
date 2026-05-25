## ADDED Requirements

### Requirement: 單一 Worker 提供 API 與 Auth routing

系統 SHALL 以單一 Cloudflare Worker(使用 Hono)處理所有後端請求,至少涵蓋 `/api/*` 與 `/auth/*` 路徑前綴。前端 SPA 由同一部署提供靜態資源。本 change 不引入第二個 Worker、Durable Objects、Queues 或 Workflows。

#### Scenario: API 請求由 Worker 處理
- **WHEN** 一個請求送到 `/api/v1/workspace`
- **THEN** 由 Hono router 對應到 workspace handler 並回傳 JSON

#### Scenario: 未匹配的 API 路徑回 404
- **WHEN** 一個請求送到不存在的 `/api/v1/does-not-exist`
- **THEN** Worker 回傳 404 與 JSON 錯誤,而非靜態 SPA 內容

### Requirement: D1 初始 migration 可重複套用

系統 SHALL 提供 `migrations/0001_initial.sql`,建立 `users`、`accounts`、`sessions`、`workspaces` 四張表,欄位對齊 PLAN.md §5.3。migration 透過 Wrangler 套用,且在乾淨資料庫上套用後 schema 正確。

#### Scenario: 在乾淨 D1 套用初始 migration
- **WHEN** 對一個空的 D1 database 套用 `0001_initial.sql`
- **THEN** `users`、`accounts`、`sessions`、`workspaces` 四張表存在且具備規格定義的欄位與索引

#### Scenario: workspaces 表包含 quota counter 欄位但不啟用邏輯
- **WHEN** 建立 `workspaces` 表
- **THEN** 表中含 `records_used`、`screenshots_used_this_month`、`ai_tokens_used_this_month`、`quota_reset_at` 欄位,預設值為 0 / null,且本 change 不對其做任何讀寫邏輯

### Requirement: scopedDb(workspace_id) 是 workspace-scoped 資料的唯一存取入口

系統 SHALL 提供 `scopedDb(workspace_id)` wrapper 作為所有 workspace-scoped D1 存取的唯一入口。其型別設計 MUST 使「查詢 workspace-scoped 資料而不提供 `workspace_id`」在編譯期不可能。任何 workspace-scoped 查詢 MUST 自動帶上 `WHERE workspace_id = ?`。

#### Scenario: 透過 scopedDb 查詢自動帶 workspace_id
- **WHEN** 以 `scopedDb('ws_A')` 查詢某 workspace-scoped 資料表
- **THEN** 產生的 SQL 自動包含 `WHERE workspace_id = 'ws_A'`,不會回傳其他 workspace 的列

#### Scenario: 不可繞過 scopedDb 直接查 workspace-scoped 表
- **WHEN** 開發者嘗試在不提供 `workspace_id` 的情況下查詢 workspace-scoped 表
- **THEN** TypeScript 編譯失敗(型別上不允許),而非在執行期才暴露跨租戶風險

#### Scenario: 跨租戶讀取被隔離
- **WHEN** workspace A 與 workspace B 各有資料,以 `scopedDb('ws_A')` 讀取
- **THEN** 結果只含 workspace A 的資料,完全不含 workspace B

### Requirement: 程式碼結構對齊 PLAN.md §9

系統 SHALL 採用 `worker/`(單一 Worker)、`web/`(Vite React SPA)、`shared/`(共用 TypeScript 型別 + zod)、`migrations/`(D1)的扁平結構。`shared/` 不拆成獨立 monorepo packages。User 與 Workspace 的型別與 zod schema 定義於 `shared/`。

#### Scenario: 前後端共用同一份型別
- **WHEN** worker 與 web 需要使用 `User` 或 `Workspace` 型別
- **THEN** 兩者皆從 `shared/` 匯入同一份定義,不各自重複宣告
