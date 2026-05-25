## ADDED Requirements

### Requirement: Preview 卡片

系統 SHALL 在抽取完成後顯示 preview 卡片(`/screenshots/:job_id` 或 chat 卡片),呈現:縮圖、每個欄位的抽取值 + 信心等級(高/中/低)+ 來源提示、`suggested_new_fields` 建議、`overall_notes`。preview MUST 在 commit 前顯示,不自動寫入。

#### Scenario: 顯示抽取結果與信心
- **WHEN** 抽取完成顯示 preview
- **THEN** 每欄顯示值與信心(高/中/低),低信心/留空欄位明確標示需補

#### Scenario: 顯示建議新欄位
- **WHEN** 抽取含 `suggested_new_fields`
- **THEN** preview 顯示建議(含原文依據),提供「加入 / 略過」

### Requirement: 逐欄編輯

系統 SHALL 允許用戶在 commit 前逐欄編輯抽取值(依 field type 提供合適輸入),修正後的值即為將寫入的值(§2.4 格式)。

#### Scenario: 編輯後再 commit
- **WHEN** user 修改某欄位值(例如修正預算)
- **THEN** commit 寫入的是修改後的值,符合 §2.4 格式

### Requirement: Commit 成 record

系統 SHALL 提供 `POST /api/v1/screenshots/:job_id/commit`(可帶編輯後的值),將 preview 寫成 record:`source='screenshot'`、`source_metadata` 含 `screenshot_url` 與 `extraction_confidence`,job status → `committed` 並記 `record_id`。寫入走 #2 的 record 建立(經 scopedDb,§2.4 編碼)。

#### Scenario: 確認寫入 record
- **WHEN** user 確認 commit
- **THEN** 建立 record(`source='screenshot'`、含來源 metadata),job → `committed`、記 `record_id`,後台表格出現該筆並顯示截圖來源 badge

#### Scenario: commit 範圍限當前 workspace
- **WHEN** commit job
- **THEN** 經 scopedDb 寫入該 workspace 的 collection,不跨租戶

### Requirement: Cancel

系統 SHALL 提供 `POST /api/v1/screenshots/:job_id/cancel`,將 job status → `cancelled`,不建立 record。

#### Scenario: 取消抽取
- **WHEN** user 取消 preview
- **THEN** job → `cancelled`,不寫 record

### Requirement: 建議新欄位的加入走既有 schema 寫入

系統 SHALL 在用戶選擇加入 `suggested_new_fields` 時,經既有 schema 寫入路徑(#3 propose→confirm 或 #2 `POST /operations`)變更 schema,MUST NOT 由截圖流程另開 schema 寫入。

#### Scenario: 加入建議欄位
- **WHEN** user 對某建議欄位按「加入」
- **THEN** 透過既有 schema 寫入路徑(propose/operations)新增該欄位,而非截圖端點直接改 schema
