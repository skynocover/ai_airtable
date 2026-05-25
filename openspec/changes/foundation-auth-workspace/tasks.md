## 1. 專案骨架

- [ ] 1.1 建立 repo 結構:`worker/`、`web/`、`shared/`、`migrations/`(對齊 PLAN.md §9)
- [ ] 1.2 初始化 `worker/`:Hono entry(`worker/src/index.ts`),掛 `/api`、`/auth` 路徑分組;設定 `wrangler.toml`(Worker 名稱、compatibility date、D1 binding 佔位)
- [ ] 1.3 初始化 `web/`:Vite + React + TypeScript + Tailwind + shadcn/ui,設定建置產物由 Worker 提供靜態資源
- [ ] 1.4 初始化 `shared/`:tsconfig 與匯出入口,供 `worker/` 與 `web/` 共用型別(扁平資料夾,不拆 monorepo packages)
- [ ] 1.5 設定根層 TypeScript / lint / 格式化,確認 `worker` 與 `web` 都能 build 通過
- [ ] 1.6 建立 `zh-TW` 字串常數檔(集中 UI 文案,無 i18n 框架;見 PLAN.md §8.4、附錄 A),auth 頁文案先進駐,供後續 change 共用

## 2. D1 初始 migration

- [ ] 2.1 撰寫 `migrations/0001_initial.sql`:`users`(含 `hashed_password` 可為 null、`email` UNIQUE、unix ms 時間戳)
- [ ] 2.2 同檔加入 `accounts`(Better Auth account 連結,`UNIQUE(provider, provider_account_id)`)與 `sessions`(`token` UNIQUE、`expires_at`)
- [ ] 2.3 同檔加入 `workspaces`:`owner_id`、`slug` UNIQUE、`plan` DEFAULT 'free'、quota counter 欄位(`records_used`/`screenshots_used_this_month`/`ai_tokens_used_this_month`/`quota_reset_at`,僅建欄位不啟用邏輯)
- [ ] 2.4 在乾淨 local D1 套用 migration(`wrangler d1 migrations apply --local`),驗證四張表與索引正確建立

## 3. scopedDb 多租戶 wrapper

- [ ] 3.1 在 `worker/src/lib/db.ts` 實作 `scopedDb(workspace_id)`:回傳已綁定該 workspace 的查詢方法,workspace-scoped 查詢自動注入 `WHERE workspace_id = ?`(讀)與 `workspace_id`(寫)
- [ ] 3.2 提供獨立的 `globalDb` 通道給非 workspace-scoped 表(`users`/`sessions`/`accounts`);不對外匯出裸 D1 binding
- [ ] 3.3 以型別設計使「查 workspace-scoped 表而不經 `scopedDb`」在編譯期不可能(route handler 只能取得 `scopedDb`/`globalDb`)
- [ ] 3.4 撰寫測試:`scopedDb('ws_A')` 查不到 `ws_B` 的資料;確認產生的 SQL 帶 `workspace_id`(對應 project-foundation 的隔離 scenario)

## 4. Better Auth 整合

- [ ] 4.1 在 `worker/src/lib/auth.ts` 設定 Better Auth:D1/SQLite adapter、對齊 `0001_initial.sql` 的 schema、httpOnly + secure + SameSite session cookie
- [ ] 4.2 掛上 `/api/auth/*`:sign-up、sign-in、sign-out、session
- [ ] 4.3 設定 Google OAuth(`/api/auth/oauth/google`);client id/secret 走 Worker secrets
- [ ] 4.4 設定 forgot-password / reset-password:時效性 token、用過即失效;reset 信透過最小寄信設定寄出(完整 email 通道留待 public-form-input)
- [ ] 4.5 forgot-password 對存在/不存在 email 回應一致(不洩露註冊狀態);登入錯誤回通用訊息
- [ ] 4.6 實作需登入 API 的 auth middleware:無有效 session → 401

## 5. Workspace 自動建立與 context

- [ ] 5.1 在「user 首次建立」流程自動建立 workspace(owner=該 user、`plan='free'`、產生唯一 slug);優先用 Better Auth after-create hook
- [ ] 5.2 slug 產生器:workspace 內唯一,碰撞則重產
- [ ] 5.3 登入路徑加 self-healing:偵測 user 無 workspace 則補建,修復部分失敗狀態
- [ ] 5.4 Hono middleware:由 session → user → workspace 解析 `workspace_id` 注入 context;handler 一律從 context 取,忽略 client 傳入的 workspace_id
- [ ] 5.5 由 context 建立 `scopedDb` 實例供 handler 使用

## 6. Workspace API

- [ ] 6.1 實作 `GET /api/v1/workspace`:回傳當前 workspace 的 id/name/slug/plan
- [ ] 6.2 實作 `PATCH /api/v1/workspace`:owner 改名;空白名稱回驗證錯誤(繁中)
- [ ] 6.3 在 `shared/` 定義 `User`、`Workspace` 型別 + zod schema,前後端共用

## 7. 前端 auth 頁面

- [ ] 7.1 `/sign-up` 頁:email/密碼 + Google 註冊(繁體中文)
- [ ] 7.2 `/login` 頁:email/密碼 + Google 登入;已登入者自動導向 `/home`
- [ ] 7.3 忘記密碼 / 重設密碼前端流程頁
- [ ] 7.4 登入後 `/home` 空殼:驗證 session 並顯示當前 workspace 名稱(內容由後續 change 填)
- [ ] 7.5 前端 session 處理:401 時導向 `/login`

## 8. 端對端驗證

- [ ] 8.1 手動走完:註冊(email)→ 自動有 workspace → 登出 → 登入 → 改 workspace 名稱
- [ ] 8.2 手動走完:Google 首次登入 → 自動建 user + workspace；既有 email Google 登入連結既有 user
- [ ] 8.3 手動走完:忘記密碼 → 收到 reset 信 → 以 token 重設 → 新密碼登入;過期/已用 token 被拒
- [ ] 8.4 確認多租戶隔離測試通過(第 3.4 項),且無任何 route 可繞過 scopedDb 取 workspace-scoped 資料
- [ ] 8.5 確認 `wrangler.toml`、secrets(Better Auth secret、Google client id/secret)、D1 binding 設定齊全,Worker 本地可啟動
