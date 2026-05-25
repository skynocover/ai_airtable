## Why

這是 Phase 1 的第 1 個 change(地基,無依賴)。在做任何產品功能(Collection、Records、Chat、截圖、表單)之前,必須先有可運行的專案骨架、資料庫地基、以及「使用者能登入、且每個使用者自動擁有一個隔離的 workspace」這個前提。**多租戶隔離是整個系統的安全底線**:單一共用 D1,任何漏掉 `workspace_id` 過濾的查詢都是跨租戶外洩 —— 這個約束必須從第一行 code 就用 `scopedDb(workspace_id)` wrapper 強制住,後面所有 change 才有安全的地基可站。

## What Changes

- **新增專案骨架**:單一 Cloudflare Worker(Hono routing,`/api`、`/auth`)+ Vite React SPA(`web/`)+ `shared/`(共用 TypeScript 型別 + zod)+ `migrations/`(D1)。對齊 PLAN.md §9 結構。
- **新增 D1 初始 migration**(`0001_initial.sql`):`users`、`accounts`、`sessions`(Better Auth)+ `workspaces`(含 quota counter 欄位,但本 change 不啟用配額邏輯)。對齊 PLAN.md §5.3。
- **新增 `scopedDb(workspace_id)` wrapper**:所有 D1 存取的唯一入口,讓「不帶 `workspace_id` 查 workspace-scoped 資料」在型別上不可能。這是跨切片鐵則 #1 的落地。
- **新增 Better Auth 整合**:Email 密碼註冊/登入、Google OAuth、登出、忘記密碼 + reset;session 用 httpOnly secure cookie。對齊 PLAN.md §5.4 `/api/auth/*`。
- **新增「註冊後自動建立 workspace」**:每個新 user 在註冊完成時自動獲得一個 workspace(`plan='free'`),並設為 owner。
- **新增 workspace API**:`GET /api/v1/workspace`(取得當前)、`PATCH /api/v1/workspace`(改名)。
- **新增前端 auth 頁面**:`/login`、`/sign-up`,以及登入後的空殼 `/home`(僅驗證 session 與導向,實際內容由後續 change 填)。

## Capabilities

### New Capabilities
- `project-foundation`: 單一 Worker + Hono + Vite SPA + shared/ 的專案結構、D1 migration 機制、以及 `scopedDb(workspace_id)` 多租戶存取 wrapper(含「型別上強制帶 workspace_id」的契約)。
- `authentication`: 以 Better Auth 提供 Email 密碼登入、Google OAuth、登出、忘記/重設密碼、session 管理,以及前端 `/login`、`/sign-up` 頁。
- `workspace`: workspace 資料模型、註冊後自動建立、`GET`/`PATCH /api/v1/workspace`,以及登入後的 workspace 解析(把當前 user → 其 workspace 帶進每個請求 context)。

### Modified Capabilities
<!-- 無。這是第一個 change,openspec/specs/ 目前為空。 -->

## Non-goals(明確不做,留給後續 change)

- **Collection / Schema / Records / Chat / 截圖 / 表單**:全部是後續 change(`collections-records-admin`、`ai-chat-tools`、`screenshot-extraction`、`public-form-input`)。本 change 不建任何這些表或 API。
- **配額追蹤與限制邏輯**:`workspaces` 表本 change 會建出 quota counter 欄位(`records_used`、`screenshots_used_this_month`、`ai_tokens_used_this_month`、`quota_reset_at`),但**不實作任何計數、檢查、阻擋**。`GET /api/v1/workspace/usage` 端點留給 `quota-limits` change。
- **付費 / Pro / Stripe**:Phase 1 只有免費版,`plan` 欄位預設 `'free'` 且本 change 不做任何 plan 分支邏輯。
- **多人 workspace / 邀請 / 權限**:Phase 4。本 change workspace 為單一 owner。
- **三欄式主介面 / sidebar / chat 面板**:後續 change。本 change 的 `/home` 僅是登入後的空殼。

## Impact

- **新增程式碼**:`worker/`(Hono entry、`routes/auth.ts`、`routes/workspaces.ts`、`lib/db.ts` 含 `scopedDb`、`lib/auth.ts`)、`web/`(Vite SPA 骨架 + auth 頁)、`shared/`(User / Workspace 型別 + zod)、`migrations/0001_initial.sql`、`wrangler.toml`。
- **依賴**:Cloudflare Workers / D1 / Wrangler、Hono、Better Auth、React + Vite + Tailwind + shadcn/ui、zod。
- **環境設定**:D1 binding、Better Auth secret、Google OAuth client id/secret、session cookie 設定。
- **前置驗證**:依賴 Week 0 spike 已確認「Better Auth 在 Workers + D1 能順跑(session / OAuth / reset token)」(PLAN.md §12.1)。
- **後續 change 的地基**:所有後續 change 都透過本 change 的 `scopedDb` 存取 D1、透過 auth context 取得當前 workspace。
