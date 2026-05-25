## Context

這是 Phase 1 的地基 change,無依賴,但所有後續 change 都站在它上面。它同時引入專案骨架、資料庫地基、與多租戶安全模型。三個技術決定有跨切片影響,值得在寫 code 前定清楚:(1) `scopedDb` 如何在型別層強制 `workspace_id`、(2) Better Auth 如何掛在 Cloudflare Workers + D1 上、(3) 註冊 → 自動建 workspace 的時機與原子性。Week 0 spike 應已驗證 Better Auth 在 Workers+D1 可順跑(session / OAuth / reset token);若 spike 未過,本 change 不應開工。

## Goals / Non-Goals

**Goals:**
- 可運行的單一 Worker(Hono)+ Vite React SPA + `shared/` + `migrations/` 骨架
- D1 初始 migration(users / accounts / sessions / workspaces)
- `scopedDb(workspace_id)` —— 讓「不帶 workspace_id 查 workspace-scoped 表」在編譯期不可能
- Better Auth:email 密碼、Google OAuth、登出、忘記/重設密碼、httpOnly secure cookie session
- 註冊後自動建立 workspace + 請求 context 解析當前 workspace
- `/login`、`/sign-up` 頁與登入後 `/home` 空殼

**Non-Goals:**
- 任何產品功能表/API(Collection、Records、Chat、截圖、表單)
- 配額計數/檢查/阻擋邏輯(欄位建出但不啟用)
- 付費/Pro/Stripe、plan 分支邏輯
- 多人 workspace、邀請、權限
- 三欄主介面(sidebar / chat 面板)

## Decisions

### D1:`scopedDb(workspace_id)` 的型別強制設計

**決定**:`scopedDb` 是一個工廠函式,接收 `workspace_id` 後回傳一組「已綁定該 workspace」的查詢方法;workspace-scoped 表只能透過這組方法存取。底層所有 workspace-scoped 查詢由 wrapper 自動注入 `WHERE workspace_id = ?`(讀)與 `workspace_id` 欄位(寫),呼叫端拿不到也不需要拼這個條件。

**怎麼讓「漏帶」在型別上不可能**:不匯出裸 D1 binding 給 route handler。Route handler 只能拿到「從 auth context 解析出 workspace 後建立的 `scopedDb` 實例」。需要 workspace-scoped 資料的表,其 query helper 只掛在 `scopedDb` 回傳物件上;global 表(`users`/`sessions`/`accounts`,非 workspace-scoped)走另一條明確命名的 `globalDb` 通道。如此「對 workspace-scoped 表查詢」這個動作在型別上一定經過 `scopedDb`。

**替代方案**:(a) 靠 code review / lint 規則檢查每條 SQL 帶 `workspace_id` —— 否決,人會漏、第二個用戶才爆;(b) Row-Level Security —— D1/SQLite 無此機制。型別強制是 D1 上最務實的硬保證。

### Better Auth on Workers + D1

**決定**:採 Better Auth 並使用其 D1/SQLite adapter,schema(users/accounts/sessions)以我們的 `0001_initial.sql` 對齊 Better Auth 期望欄位。session 走 httpOnly + secure + SameSite cookie。Google OAuth 的 client id/secret、Better Auth secret 走 Worker secrets(非 commit)。

**替代方案**:自刻 auth —— 否決,reset token / OAuth / session 安全細節自己做容易出洞,且 PLAN 已選定 Better Auth。

**依賴 spike**:Better Auth 在 Workers 執行環境(無 Node API)的相容性是 Week 0 spike 項目;若有 adapter 限制,於此 change 內調整,但不換掉 Better Auth。

### 註冊 → 自動建 workspace 的時機與原子性

**決定**:在「user 首次建立」這個點(email 註冊完成 / 首次 Google 登入建立 user 時)同一邏輯流程內建立 workspace。優先用 Better Auth 的 after-create hook;若 hook 不可靠,則在註冊/OAuth callback handler 內,user 建立成功後緊接著建立 workspace,並確保「user 已建立但 workspace 尚未建立」的狀態能被修復(登入時若偵測 user 無 workspace 則補建,作為 self-healing 後盾)。

**原子性**:D1 單請求內可用 batch/transaction 把 user(若由我們建)與 workspace 一起寫。Google OAuth 因 user 由 Better Auth 建立,採 hook 或 self-healing 補建較實際,不強求單一 transaction。

**替代方案**:延後到「user 第一次進 /home 才建」—— 否決,會讓「當前 workspace」在很多地方變成可空,增加各處 null 處理。註冊即有 workspace 讓後續 change 的 context 永遠非空。

### 請求 context:workspace_id 只由 server 解析

**決定**:Hono middleware 由 session → user → workspace 解析 `workspace_id` 注入 context;handler 一律從 context 取,永不信任 client 傳入的 workspace_id。`scopedDb` 由此 context 建立。

## Risks / Trade-offs

- **Better Auth 與 Workers 環境不相容** → Week 0 spike 先驗;若 adapter 有限制,於本 change 內以最小修改繞過,不換框架。
- **user 已建立但 workspace 建立失敗(部分失敗)** → 登入路徑加 self-healing:偵測無 workspace 則補建,避免用戶卡在無 workspace 的壞狀態。
- **開發者繞過 scopedDb 直接用裸 binding** → 不匯出裸 binding;route 層只能拿到 `scopedDb`/`globalDb`,並在 PR review 與 CLAUDE.md 鐵則中強調。
- **單一共用 D1 的跨租戶外洩** → 本 change 的型別強制是主要緩解;測試 MUST 含「以 ws_A 查不到 ws_B 資料」案例。
- **forgot-password 洩露 email 是否存在** → 對存在/不存在 email 回應一致,token 寄送與否不可由回應推斷。

## Migration Plan

- 建立 `0001_initial.sql`,本地 `wrangler d1 migrations apply`(local)驗證,再對 remote 套用。
- 設定 Worker secrets:Better Auth secret、Google OAuth client id/secret。
- 設定 D1 binding 於 `wrangler.toml`。
- 回退:本 change 為全新地基,無既有資料;回退即移除 migration 與部署。

## Open Questions

- Better Auth 的 schema 欄位是否 100% 對齊 PLAN.md §5.3 的 `accounts`/`sessions` 定義,或需以 Better Auth 期望為準微調 migration?(以 spike 結果為準,實作時定案。)
- reset token 與 email 寄送在本 change 用哪個寄信通道?(Resend vs CF Email;PLAN 傾向 Resend。email 通知的完整實作在 `public-form-input` change,本 change 僅需能寄出 reset 信,可先用最小設定。)
