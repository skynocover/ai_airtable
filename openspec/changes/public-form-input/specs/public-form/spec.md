## ADDED Requirements

### Requirement: Input config 管理

系統 SHALL 提供 input config 的 CRUD:`GET/POST /api/v1/collections/:id/inputs`、`PATCH/DELETE /api/v1/inputs/:id`。公開表單 input 的 `settings_json` 含 title、description、submit 按鈕文字、感謝訊息、`turnstile_enabled`、`require_email`,並有 workspace 內唯一的 `public_slug`。所有管理操作經 `scopedDb(workspace_id)`。

#### Scenario: 啟用公開表單
- **WHEN** user 對某 collection 建立 `public_form` input
- **THEN** 產生唯一 `public_slug`,回傳 `public_url`(`/f/:public_slug`),input `enabled=1`

#### Scenario: 停用表單
- **WHEN** owner 將 input `enabled` 設為 0 或刪除
- **THEN** 該 `/f/:public_slug` 不再接受提交

### Requirement: enable_public_form AI tool

系統 SHALL 提供 `enable_public_form` tool,讓用戶在 chat 啟用公開表單(title/description/submit/感謝訊息),回 `public_slug` + `public_url`,底層走 input config 建立。

#### Scenario: 對話啟用表單
- **WHEN** user 在 chat 說「設定成公開表單」
- **THEN** AI 呼叫 `enable_public_form`,回傳可分享的 `public_url`

### Requirement: Schema-driven 表單 renderer

系統 SHALL 依 collection 的 `current_schema_json` 自動生成表單欄位:依 field type 提供輸入元件、依 `required` 標必填、套用欄位驗證(min/max/pattern);`hidden_in_public` 欄位 MUST NOT 顯示。

#### Scenario: 依 schema 生成欄位
- **WHEN** 開啟某 collection 的公開表單
- **THEN** 表單欄位依當前 schema 自動生成(型別對應輸入、必填標示),不需手刻

#### Scenario: 隱藏欄位不出現
- **WHEN** 某欄位 `hidden_in_public=true`
- **THEN** 該欄位不出現在公開表單

### Requirement: 公開表單頁 SSR

系統 SHALL 以同一 Worker SSR 提供 `GET /f/:public_slug`(minimal JS,行動端友善、專業外觀,LCP 目標 < 1.5s)與 `/f/:public_slug/thanks`。免費版頁面 SHALL 顯示 footer logo;頁面底部 SHALL 顯示資料用途與聯絡方式(GDPR/PDPA 友善)。停用或不存在的 slug SHALL 顯示適當訊息。

#### Scenario: SSR 表單頁
- **WHEN** 訪客造訪有效 `/f/:public_slug`
- **THEN** 由 Worker SSR 回傳表單頁(含資料用途揭露、免費版 footer logo)

#### Scenario: 停用/不存在的表單
- **WHEN** 訪客造訪已停用或不存在的 slug
- **THEN** 顯示「此表單暫時不接受新提交」或不存在訊息,不洩露其他資訊

### Requirement: 訪客提交(防 bot)

系統 SHALL 提供 `POST /api/v1/public/forms/:public_slug/submit`(無需登入),提交前 MUST 通過 Turnstile(若啟用)與 per-IP rate limit。提交成功寫 record(`source='form'`、`source_metadata` 含 submission_id/ip_country),並記 `form_submissions`。`public_slug` MUST 嚴格解析到對應 collection 與 workspace,寫入經該 workspace。

#### Scenario: 成功提交
- **WHEN** 訪客填妥必填欄位並通過 Turnstile 提交
- **THEN** 建立 record(`source='form'`)、記 `form_submissions`、導向感謝頁

#### Scenario: 未通過 Turnstile / 超過 rate limit
- **WHEN** 提交未通過 Turnstile 或超過 per-IP rate limit
- **THEN** 拒絕提交,不寫 record

#### Scenario: 提交寫入正確 workspace
- **WHEN** 經 `public_slug` 提交
- **THEN** record 寫入該 slug 對應 collection 的 workspace,不可跨租戶;client 無法指定 workspace
