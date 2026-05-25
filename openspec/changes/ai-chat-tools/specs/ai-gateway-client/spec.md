## ADDED Requirements

### Requirement: 所有 Claude 呼叫經 AI Gateway

系統 SHALL 透過 Cloudflare AI Gateway 發出所有 Anthropic Claude 呼叫,Anthropic API key 走 Worker secret。client 封裝於 `worker/src/ai/client.ts`,為所有 AI 任務的唯一出口。

#### Scenario: LLM 呼叫走 AI Gateway
- **WHEN** 任一 AI 任務(chat / tool)需呼叫 Claude
- **THEN** 請求經 AI Gateway endpoint 發出,可在 AI Gateway 看到該次 log / 成本 / 延遲

#### Scenario: API key 不外洩
- **WHEN** 設定 AI client
- **THEN** Anthropic API key 取自 Worker secret,不出現在 client / repo / 回應

### Requirement: Tool calling 封裝(structured output 強制)

系統 SHALL 以 tool calling / structured output 進行所有 AI 任務,MUST NOT 依賴 parse 自由文字來取得結構化結果。client 提供註冊 tools、解析 tool_use、回傳 tool result 的封裝。

#### Scenario: AI 動作以 tool_use 表達
- **WHEN** AI 要執行建表 / 改 schema / 查資料
- **THEN** 以 tool_use 結構輸出,系統依結構處理,不對自由文字做 parse

### Requirement: SSE 串流

系統 SHALL 支援以 SSE 串流 Claude 回應,供 chat 即時顯示。

#### Scenario: 串流回應
- **WHEN** 發送 chat 訊息
- **THEN** 回應以 SSE 逐步串流,前端可即時呈現,不需等整段完成

### Requirement: Token 用量擷取(記錄不限制)

系統 SHALL 擷取每次 Claude 呼叫的 token 用量並記錄(供 #6 配額使用)。本 change MUST NOT 對 token 用量做任何檢查或阻擋。

#### Scenario: 記錄 token 用量
- **WHEN** 一次 Claude 呼叫完成
- **THEN** 該次 input/output token 用量被擷取記錄;不因用量多寡阻擋任何請求(限制邏輯屬 #6)
