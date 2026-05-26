## 1. 專案骨架

- [x] 1.1 建立 repo 結構:`worker/`、`web/`、`shared/`、`migrations/`(對齊 PLAN.md §9)
- [x] 1.2 初始化 `worker/`:Hono entry(`worker/src/index.ts`),掛 `/api`、`/auth` 路徑分組;設定 `wrangler.toml`(Worker 名稱、compatibility date、D1 binding 佔位)
- [x] 1.3 初始化 `web/`:Vite + React + TypeScript + Tailwind + shadcn/ui,設定建置產物由 Worker 提供靜態資源(`[assets]` + SPA fallback)
- [x] 1.4 初始化 `shared/`:tsconfig 與匯出入口,供 `worker/` 與 `web/` 共用型別(扁平資料夾,不拆 monorepo packages;以 `@ai-airtable/shared` npm workspace 提供 TS source)
- [x] 1.5 設定根層 TypeScript / lint / 格式化(prettier),確認 `worker` 與 `web` 都能 build 通過
- [x] 1.6 建立 `zh-TW` 字串常數檔(`shared/src/strings.ts`,集中 UI 文案,無 i18n 框架;見 PLAN.md §8.4、附錄 A),auth 頁文案先進駐

## 2. D1 初始 migration

- [x] 2.1 撰寫 `migrations/0001_initial.sql`:`users`(含 `hashed_password` 可為 null、`email` UNIQUE、unix ms 時間戳)
- [x] 2.2 同檔加入 `accounts`(Better Auth account 連結,`UNIQUE(provider, provider_account_id)`)與 `sessions`(`token` UNIQUE、`expires_at`)
- [x] 2.3 同檔加入 `workspaces`:`owner_id`、`slug` UNIQUE、`plan` DEFAULT 'free'、quota counter 欄位(`records_used`/`screenshots_used_this_month`/`ai_tokens_used_this_month`/`quota_reset_at`,僅建欄位不啟用邏輯)
- [x] 2.4 在乾淨 local D1 套用 migration(`wrangler d1 migrations apply --local`),驗證表與索引正確建立(另含 Better Auth 所需的 `verifications` 表,見 design Open Question)

## 3. scopedDb 多租戶 wrapper

- [x] 3.1 在 `worker/src/lib/db.ts` 實作 `scopedDb(workspace_id)`:select/first/insert 自動注入 `WHERE workspace_id = ?`(讀)與 `workspace_id`(寫)
- [x] 3.2 提供獨立的 `globalDb` 通道給非 workspace-scoped 表(users/workspaces 以 owner/id 查);不對外匯出裸 D1 binding
- [x] 3.3 以型別設計使「查 workspace-scoped 表而不經 `scopedDb`」在架構上不可能(route handler 只能從 context 取得 `scopedDb`;workspace-scoped 表名為封閉 union)
- [x] 3.4 撰寫測試:`scopedDb('ws_A')` 查不到 `ws_B` 的資料;確認產生的 SQL 帶 `workspace_id`(`worker/test/db.test.ts`,node:sqlite,3 個案例通過)

## 4. Better Auth 整合

- [x] 4.1 在 `worker/src/lib/auth.ts` 設定 Better Auth:D1/Kysely(kysely-d1)adapter、以 modelName/fields 對齊 `0001_initial.sql` 的 schema、httpOnly session cookie(secure 由 baseURL 協定自動決定)
- [x] 4.2 掛上 `/api/auth/*`(`worker/src/routes/auth.ts`):sign-up、sign-in、sign-out、session
- [x] 4.3 設定 Google OAuth(conditional on `GOOGLE_CLIENT_ID/SECRET`);client id/secret 走 Worker secrets。實際端點為 Better Auth 的 `/api/auth/sign-in/social` → `/api/auth/callback/google`
- [x] 4.4 設定 forgot-password / reset-password:時效性 token、用過即失效;reset 信透過最小寄信設定寄出(`lib/email.ts`,有 RESEND_API_KEY 走 Resend,否則 log 連結;完整通道留待 public-form-input)
- [x] 4.5 forgot-password 對存在/不存在 email 回應一致(Better Auth 預設行為,實測訊息一致);登入錯誤回通用「帳號或密碼錯誤」
- [x] 4.6 需登入 API 的 auth middleware(`middleware/context.ts`):無有效 session → 401

## 5. Workspace 自動建立與 context

- [x] 5.1 在「user 首次建立」流程自動建立 workspace(Better Auth `databaseHooks.user.create.after`;owner=該 user、`plan='free'`、唯一 slug)
- [x] 5.2 slug 產生器(`lib/workspace.ts`):workspace 內唯一,碰撞則重產(實測第二位同名用戶得到 `alice-xxxx`)
- [x] 5.3 登入路徑加 self-healing:`getOrCreateWorkspaceForUser` 偵測 user 無 workspace 則補建
- [x] 5.4 Hono middleware:由 session → user → workspace 解析 `workspace_id` 注入 context;handler 一律從 context 取,忽略 client 傳入的 workspace_id
- [x] 5.5 由 context 建立 `scopedDb` 實例供 handler 使用

## 6. Workspace API

- [x] 6.1 實作 `GET /api/v1/workspace`:回傳當前 workspace 的 id/name/slug/plan
- [x] 6.2 實作 `PATCH /api/v1/workspace`:owner 改名;空白名稱回驗證錯誤(繁中,實測回 400)
- [x] 6.3 在 `shared/` 定義 `User`、`Workspace` 型別 + zod schema,前後端共用

## 7. 前端 auth 頁面

- [x] 7.1 `/sign-up` 頁:email/密碼 + Google 註冊(繁體中文)
- [x] 7.2 `/login` 頁:email/密碼 + Google 登入;已登入者自動導向 `/home`
- [x] 7.3 忘記密碼 / 重設密碼前端流程頁(`/forgot-password`、`/reset-password`)
- [x] 7.4 登入後 `/home` 空殼:驗證 session 並顯示當前 workspace 名稱(可改名)
- [x] 7.5 前端 session 處理:401 時導向 `/login`(`lib/api.ts`)

## 8. 端對端驗證

- [x] 8.1 手動走完:註冊(email)→ 自動有 workspace → 登出 → 登入 → 改 workspace 名稱(對 `wrangler dev` 實測通過)
- [~] 8.2 Google OAuth:設定已接線且與 email 走同一 `user.create.after` 自動建 workspace 路徑(已由 email 流程驗證);**完整 Google 重導流程需真實 Google OAuth 憑證,於部署/Week 0 spike 環境驗證**
- [x] 8.3 手動走完:忘記密碼 → reset 連結(log)→ 以 token 重設 → 新密碼登入;重用 token 被拒(`INVALID_TOKEN`)
- [x] 8.4 多租戶隔離測試通過(第 3.4 項);route 層只能經 context 拿到 `scopedDb`,無裸 binding 出口
- [x] 8.5 `wrangler.toml`、secrets(`.dev.vars.example`)、D1 binding 設定齊全,Worker 本地可啟動(`/api/health` 200)
