## ADDED Requirements

### Requirement: 截圖上傳至 R2

系統 SHALL 將上傳的截圖存於 R2,路徑 `/screenshots/{workspace_id}/{job_id}.{ext}`,並永遠以 signed URL 提供給前端。原檔不公開直連。

#### Scenario: 上傳存入 workspace 範圍路徑
- **WHEN** user 上傳截圖
- **THEN** 檔案存於該 workspace 的 R2 路徑,前端取得的是 signed URL 而非永久公開 URL

#### Scenario: 截圖路徑限當前 workspace
- **WHEN** 產生 R2 路徑
- **THEN** 路徑含當前 workspace_id(由 server context 取得),不可指定他人 workspace

### Requirement: 同步 vision 抽取(3 態)

系統 SHALL 提供 `POST /api/v1/collections/:id/screenshots`,在 request 內直接 `await` Claude vision 抽取,回來即為 `preview_ready`。`screenshot_jobs.status` 只有 `preview_ready` / `committed` / `cancelled` 三態,MUST NOT 有 pending/processing,且不使用 polling / Queue / 背景處理。

#### Scenario: 上傳即得 preview
- **WHEN** user 上傳截圖到某 collection
- **THEN** request 內完成 vision 抽取,回傳 `preview_ready` 與抽取結果,前端無需 polling

#### Scenario: 抽取失敗回友善錯誤
- **WHEN** vision 抽取失敗
- **THEN** 回傳人話錯誤(例如「AI 抽取失敗,試試清楚一點的圖片」),記錄 `error_message`,不寫 record

### Requirement: extract_from_screenshot vision tool

系統 SHALL 提供 `extract_from_screenshot` vision tool,輸入截圖 image + 目標 schema(每欄 name/type/ai_hint),以 structured 輸出每欄 `{ value, confidence(0-1), source_hint }`、`suggested_new_fields`、`overall_notes`。輸出值 MUST 符合 §2.4 儲存格式(日期 `YYYY-MM-DD`、數字原始值不含符號、電話字串、select 須為 options 之一否則留空),不確定的欄位留空。prompt MUST 含隱私指令(不記住或重述敏感資料,只做結構化抽取)。

#### Scenario: 輸出符合 §2.4 格式
- **WHEN** vision 抽取出金額、日期、電話
- **THEN** 金額為原始數字、日期為 `YYYY-MM-DD`、電話為字串(保留前導 0),commit 時零轉換

#### Scenario: 不確定欄位留空
- **WHEN** 某欄位在圖中無法確定
- **THEN** 該欄位留空,不臆造值;低信心欄位以較低 confidence 標示

#### Scenario: 建議新欄位
- **WHEN** 圖中出現 schema 未涵蓋但可能有用的資訊
- **THEN** 放入 `suggested_new_fields`(name/type/reason),不直接改 schema

### Requirement: 取得抽取結果

系統 SHALL 提供 `GET /api/v1/screenshots/:job_id` 取得既有 job 的抽取結果(重整頁面用),經 `scopedDb` 限當前 workspace。

#### Scenario: 重整取回 preview
- **WHEN** user 重整 preview 頁
- **THEN** 以 job_id 取回抽取結果與狀態,不重新抽取

### Requirement: Token 用量記錄(不限制)

系統 SHALL 記錄每次 vision 抽取的 token 用量(供 #6)。本 change MUST NOT 因 token 或截圖張數做任何阻擋。

#### Scenario: 記錄 vision token
- **WHEN** 一次 vision 抽取完成
- **THEN** token 用量被記錄;不因用量阻擋(限制屬 #6)
