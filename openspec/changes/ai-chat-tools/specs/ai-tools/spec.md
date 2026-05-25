## ADDED Requirements

### Requirement: create_collection tool(直接建立)

系統 SHALL 提供 `create_collection` tool,讓 AI 直接建立新 Collection(name、slug、可選 icon/description、initial_fields)。此 tool **直接建立、不走 propose**(建的是空表,無覆蓋既有資料風險,onboarding 優先),底層呼叫 #2 的 collection 建立邏輯。

#### Scenario: AI 建立 collection
- **WHEN** AI 在對話中呼叫 `create_collection`(合法 fields)
- **THEN** 直接在當前 workspace 建立 collection 並回傳 id,無需用戶二次確認

#### Scenario: initial_fields 僅限 7 種型別
- **WHEN** `create_collection` 的 initial_fields 含非 7 種型別(如 `currency`)
- **THEN** 拒絕並回錯誤;金額須以 `number` + `currency` 表達

### Requirement: propose_schema_operations tool(只提案不寫 DB)

系統 SHALL 提供 `propose_schema_operations` tool。此 tool **絕不寫 DB** —— 只回傳提案(operations + reason + 基準 `schema_version`)。提案 MUST 存進該則 assistant 訊息的 `actions_json`,狀態 `pending`。真正套用一律走 #2 的 `POST /collections/:id/operations`(用戶確認後)。

#### Scenario: 提案不改 schema
- **WHEN** AI 呼叫 `propose_schema_operations`
- **THEN** `current_schema_json` 與 `schema_version` 完全不變;提案以 `pending` 存於 `actions_json`

#### Scenario: 提案攜帶版本基準
- **WHEN** 產生提案
- **THEN** 提案含當前 `schema_version`,供後續確認時做樂觀鎖比對

### Requirement: propose → confirm 流程

系統 SHALL 讓用戶對 schema 提案**只能接受或拒絕**(Phase 1 不支援逐欄編輯)。接受 → 前端呼叫 `POST /collections/:id/operations`(帶提案的 `schema_version`)→ 成功後更新該訊息 `actions_json` 狀態為 `applied`;拒絕 → 標記 `rejected`。`remove_field` 提案 MUST 以紅色 + 二次確認呈現,文案說明既有資料保留可救回。版本衝突 MUST 拒絕並提示 refetch。

#### Scenario: 接受提案後套用
- **WHEN** user 接受一個 schema 提案
- **THEN** 呼叫 `POST /operations` 套用,`schema_version +1`、寫 audit log,訊息卡片狀態變 `applied`

#### Scenario: 拒絕提案
- **WHEN** user 拒絕提案
- **THEN** 不呼叫 `POST /operations`,schema 不變,卡片狀態變 `rejected`

#### Scenario: 刪欄位紅色二次確認
- **WHEN** 提案含 `remove_field`
- **THEN** 卡片以紅色呈現並要求二次確認,文案說明「既有資料保留但不再顯示,重建欄位可救回」

#### Scenario: 確認時版本衝突
- **WHEN** 接受提案時 `schema_version` 已與當前不符
- **THEN** 套用被拒,提示「表格已被更新,請重新整理」,前端 refetch 最新 schema

### Requirement: query_records tool(structured 查詢)

系統 SHALL 提供 `query_records` tool,以 structured filter(`eq`/`gt`/`lt`/`contains`/`between`）/ sort / limit / offset 查詢(走 #2 的 records 列表,經 `scopedDb`)。AI 收到結果後以自然語言回覆。系統 MUST NOT 把全部 raw records 塞進 LLM context(隱私 + 成本)。

#### Scenario: 結構化查詢
- **WHEN** user 問「上週收到幾筆」
- **THEN** AI 以 `query_records`(filter:`created_at >= 7 天前`)查詢,依結果以自然語言回覆筆數

#### Scenario: 查詢限當前 workspace
- **WHEN** `query_records` 執行
- **THEN** 經 `scopedDb` 只查當前 workspace 的 collection,不跨租戶

#### Scenario: 不灌入全部 raw records
- **WHEN** 查詢回傳大量 records
- **THEN** 系統以 structured 結果回應,不把所有 record 內容塞進 LLM context
