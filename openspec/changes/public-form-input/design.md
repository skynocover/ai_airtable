## Context

第二個 input 管道 + 第一個 outbound 通知。沿用不變量:表單提交寫 record 走 #2(`source='form'`、§2.4 編碼)、表單欄位由 #2 schema 自動生成。本 change 自己負責 input config、公開頁 SSR、防 bot、email 通道。公開提交是 Phase 1 少數 no-auth 端點,安全性以「`public_slug` → collection → workspace」嚴格綁定 + Turnstile + rate limit 把關。

## Goals / Non-Goals

**Goals:**
- input config CRUD + `enable_public_form` tool
- schema-driven 表單 renderer(依 §2.4 型別、required、驗證、hidden_in_public）
- `/f/*` 同一 Worker SSR(minimal JS、LCP<1.5s、行動端友善)+ 感謝頁
- 訪客提交(Turnstile + per-IP rate limit)→ 寫 record(source='form')
- 共用 email 通道(Resend)+ 提交通知(<1 分鐘)

**Non-Goals:**
- 條件邏輯/多步驟、公開展示頁、檔案上傳欄位、branding/自訂網域、LINE/Slack/Discord、提交數配額(#6)

## Decisions

### 公開頁 SSR 在同一 Worker(不引入 SSR 框架)

**決定**:`/f/:public_slug` 由 Hono 在同一 Worker 回手刻 HTML(minimal JS:Turnstile widget + 提交)。不引入 Next/Remix。

**理由**:PLAN 明確「單一 Worker」「minimal JS」「LCP<1.5s」;SSR 框架違背此目標且過重。表單是靜態欄位,手刻 HTML 足夠。

**替代方案**:用 React SPA 渲染公開表單 —— 否決,SEO/LCP 差、bundle 重,對公開頁不划算。

### 提交安全:no-auth 端點的硬綁定

**決定**:`POST /public/forms/:public_slug/submit` 由 `public_slug` 解析出 input → collection → workspace,寫入一律經該 workspace 的 scopedDb;client 無法傳 workspace_id/collection_id。提交前過 Turnstile(若啟用)+ per-IP rate limit(Rate Limiting binding 或 KV,非 Queue)。

**理由**:公開端點是攻擊面;workspace 由 slug 反查而非 client 傳入,杜絕跨租戶寫入。

### enable_public_form 走既有 input config

**決定**:AI tool 只是 input config 建立的對話入口,底層與手動建立同一邏輯,回 public_url。

### email 通道共用且失敗不阻斷提交

**決定**:`worker/src/lib/email.ts` 封裝 Resend,供提交通知與 reset 信復用。通知 email 失敗不回退提交(record 已寫),失敗記錄即可。

**理由**:提交成功是第一優先;通知是 best-effort。1 分鐘內送達為目標(同步寄送即可達成,無需 Queue)。

## Risks / Trade-offs

- **公開表單被濫用(spam/頻寬)** → Turnstile + per-IP rate limit + 表單可停用(`enabled=0`)。
- **跨租戶寫入** → workspace 由 slug 反查,client 不可指定;提交經 scopedDb。
- **SSR 頁 LCP** → minimal JS、手刻 HTML、行動端優先;Turnstile 非阻塞渲染。
- **email 送達率** → Week 0 spike 驗網域驗證/送達;Resend 為主要通道;失敗不阻斷提交。
- **slug 列舉** → slug 隨機不可猜;停用/不存在回一致訊息,不洩露。

## Migration Plan

- `migrations/0005_inputs_submissions.sql`:`inputs`(+ `idx_inputs_public_slug`)、`form_submissions`。
- 設定 Turnstile site key+secret、Resend API key + 寄件網域驗證、rate limit binding。
- 回退:移除 migration 與 public-form/inputs route。

## Open Questions

- per-IP rate limit 的具體閾值與視窗(實作定;Rate Limiting binding vs KV 計數)。
- 表單提交數「快到上限/已達上限」對訪客的呈現,與 #6 配額阻擋的銜接(本 change 留 hook,#6 接邏輯)。
- 感謝頁是否支援自訂訊息以外的轉址(Phase 2,本 change 僅顯示感謝訊息)。
