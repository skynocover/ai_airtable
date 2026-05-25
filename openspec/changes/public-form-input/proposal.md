## Why

第二個 input 管道:**公開表單**(接案者收詢價/報名/回饋的核心場景,User Story 2)。有了 schema(#2)後,表單可由 schema 自動生成,不需用戶手刻。本 change 也補上第一個 outbound 通知:**新提交時 email owner**(User Story 2 第 5-6 步)。落地原則:公開頁 **SSR 在同一個 Worker**(`/f/*`,minimal JS、LCP < 1.5s)、防 bot(Turnstile + per-IP rate limit)、提交寫 record 走 #2 既有路徑(`source='form'`)。

## What Changes

- **新增 D1 migration**(`0005_inputs_submissions.sql`):`inputs`(`type`、`enabled`、`settings_json`、`public_slug` UNIQUE)+ `idx_inputs_public_slug`、`form_submissions`(`input_id`、`record_id`、`ip_country`、`user_agent`)。
- **新增 Input config 管理**:`GET/POST /api/v1/collections/:id/inputs`、`PATCH/DELETE /api/v1/inputs/:id`;公開表單設定(title、description、submit 按鈕、感謝訊息、turnstile_enabled、require_email)。
- **新增 `enable_public_form` AI tool**:讓用戶在 chat 說「設定成公開表單」即啟用,回 `public_slug` + `public_url`(底層走 input config 建立)。
- **新增 schema-driven 表單 renderer**:依 `current_schema_json` 自動生成表單欄位(依 field type + required + 驗證);`hidden_in_public` 欄位不顯示。
- **新增公開表單頁 SSR**:`GET /f/:public_slug`(同一 Worker SSR,minimal JS)、`/f/:public_slug/thanks` 感謝頁;手機友善、專業外觀;免費版顯示 footer logo;底部顯示資料用途(GDPR/PDPA 友善)。
- **新增訪客提交**:`POST /api/v1/public/forms/:public_slug/submit`(無需登入),經 Turnstile + per-IP rate limit,寫 record(`source='form'`、`source_metadata` 含 submission_id/ip_country),記 `form_submissions`。
- **新增 email 通知**:新提交時於 1 分鐘內 email owner(透過 Resend);此為本 change 建立的共用 email 通道。

## Capabilities

### New Capabilities
- `public-form`: input config(CRUD + 設定)、`enable_public_form` tool、schema-driven 表單 renderer、`/f/*` SSR 公開頁 + 感謝頁、訪客提交(寫 record `source='form'`)、Turnstile + per-IP rate limit、footer logo、資料用途揭露。
- `email-notification`: 共用 email 寄送通道(Resend),新表單提交時於 1 分鐘內通知 owner。

### Modified Capabilities
<!-- 無 spec-level 變更於既有 capability。record 寫入走 #2(source='form'),source badge 已支援。 -->

## Non-goals(明確不做,留給後續 change)

- **表單條件邏輯、多步驟表單**:Phase 2。本 change 單頁、靜態欄位。
- **公開展示頁(`/t/[slug]`)、單筆詳情頁**:Phase 2。本 change 只有「填寫」表單,不含「瀏覽」資料。
- **表單檔案上傳(file/image 欄位型別)**:Phase 2,明確移出 Phase 1。
- **branding / logo 移除 / 自訂網域 / 品牌色**:Phase 2(免費版固定顯示 footer logo)。
- **LINE Notify / Slack / Discord webhook 通知**:Phase 2。本 change 只有 email 通知。
- **表單提交配額限制**:本 change 做 Turnstile + per-IP rate limit(防濫用),但「每月提交數上限」的計數/阻擋留給 `quota-limits`(#6)。

## Impact

- **新增程式碼**:`worker/src/routes/inputs.ts`、`worker/src/routes/public-form.ts`(`/f/*` SSR + submit)、`worker/src/lib/email.ts`(Resend 通道)、表單 renderer、`migrations/0005_inputs_submissions.sql`、`shared/`(InputConfig / form_settings / FormSubmission 型別 + zod)、`web/`(input 設定 UI);`enable_public_form` 加入 #3 的 tool 集。
- **依賴**:Cloudflare Turnstile、Rate Limiting binding / KV、Resend(email);沿用 #1 scopedDb/auth、#2 record 寫入 + §2.4、#3 tool 機制(enable_public_form)。
- **環境設定**:Turnstile site key + secret、Resend API key + 寄件網域驗證、rate limit binding。
- **跨切片鐵則落地**:單一 Worker SSR、record 寫入走 #2、多租戶(input/submission/record 皆 workspace-scoped);公開提交端點是少數 no-auth 路徑,須嚴格綁 `public_slug → collection → workspace`。
