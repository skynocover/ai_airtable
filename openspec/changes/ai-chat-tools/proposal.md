## Why

資料層(#2)能手動跑對之後,這個 change 把產品的核心賣點接上:**用對話建表、改 schema、查資料**。AI 是「資料層之上的另一個 client」—— 它透過 tool calling 操作 #2 已經驗證過的 collections / records / `POST /operations`,而不是另闢寫入路徑。本 change 落地兩條鐵則:**AI 互動一律 tool calling / structured output(不 parse 自由文字)、所有 LLM 呼叫走 AI Gateway**,以及最重要的安全機制:**AI 寫入 schema 必先 propose、用戶確認才 commit**。

## What Changes

- **新增 D1 migration**(`0003_chat.sql`):`chat_sessions`、`chat_messages`(含 `actions_json` 存 tool call/提案狀態)+ `idx_chat_messages_session`。
- **新增 AI Gateway client**:所有 Claude 呼叫經 Cloudflare AI Gateway(統一 log / cache / rate limit / 成本可視);封裝 tool calling 與 SSE 串流;**擷取每次呼叫的 token 用量**(供 #6 配額使用,本 change 只記錄不限制)。
- **新增 Chat**:`chat_sessions` / `chat_messages` CRUD、發送訊息以 **SSE 串流**回應、system prompt(產品上下文 + workspace collections 簡介 + 當前綁定 collection 的完整 schema)、chat 歷史只帶最近 N 則進 context。
- **新增三個 AI tools(structured output)**:
  - `create_collection` —— **直接建立**(呼叫 #2 的建立邏輯,無 propose,onboarding 優先)
  - `propose_schema_operations` —— **只回傳提案,絕不寫 DB**;提案存進該則 AI 訊息的 `actions_json`(狀態 `pending`)
  - `query_records` —— 以 structured filter/sort 查詢(走 #2 的 records 列表),AI 收到結果後以自然語言回覆
- **新增 propose → confirm 流程**:用戶在 chat 卡片**只能接受 / 拒絕**;接受 → 前端呼叫 #2 的 `POST /collections/:id/operations`(帶 `schema_version` 樂觀鎖)→ 更新該訊息 `actions_json` 狀態為 `applied`/`rejected`。刪欄位提案以**紅色 + 二次確認**呈現;版本衝突拒絕並提示 refetch。
- **新增前端 Chat 面板**:常駐右側(可摺疊)、顯示當前 collection context、tool call 以卡片呈現(非純文字)、SSE 串流顯示。

## Capabilities

### New Capabilities
- `ai-gateway-client`: 經 AI Gateway 的 Claude client、tool calling 封裝、SSE 串流、token 用量擷取與記錄(不限制)。
- `chat`: chat sessions/messages 資料模型與 API、SSE 串流回應、system prompt 組裝、collection context 綁定、最近 N 則歷史、前端常駐 chat 面板與 tool 卡片。
- `ai-tools`: `create_collection`(直接建立)、`propose_schema_operations`(提案不寫 DB)、`query_records`(structured 查詢);以及 propose→confirm 流程(接受/拒絕、刪欄位紅色二次確認、版本衝突處理)。

### Modified Capabilities
<!-- 無新增 spec-level 行為變更於既有 capability。POST /operations 端點與行為已由 #2 定義,本 change 僅由前端在用戶確認後呼叫,不改其 spec。 -->

## Non-goals(明確不做,留給後續 change)

- **對話直接寫入 records**:Phase 3。chat 只能「查資料」與「建/改 schema(經 propose)」,不能用對話新增/編輯 record 資料。
- **跨 Collection 智慧路由 / 對話洞察 / 對話式公開表單**:Phase 3。
- **逐欄編輯提案**:propose 卡片只接受/拒絕;要改回頭跟 AI 說(逐欄編輯保留給截圖 commit,#4)。
- **AI token 配額限制**:本 change 擷取並記錄 token 用量,但**不檢查、不阻擋**,限制邏輯留給 `quota-limits`(#6)。
- **截圖 vision 抽取**:`extract_from_screenshot` 是 #4 的範圍;本 change 不做 vision。
- **多 LLM provider / fallback / Workers AI**:Phase 1 只用 Claude Sonnet via AI Gateway。

## Impact

- **新增程式碼**:`worker/src/ai/client.ts`(AI Gateway client)、`ai/tools.ts`(tool 定義)、`ai/prompts.ts`(system prompt)、`worker/src/routes/chat.ts`(SSE)、`migrations/0003_chat.sql`、`shared/`(ChatSession / ChatMessage / tool 參數型別 + zod)、`web/` chat 面板與 tool 卡片元件。
- **依賴**:Anthropic Claude(Sonnet)via Cloudflare AI Gateway、SSE;沿用 #1 `scopedDb`/auth、#2 collections/records/`POST /operations`。
- **環境設定**:AI Gateway endpoint、Anthropic API key(走 Worker secret);確認 AI Gateway / Claude 不用於訓練(Week 0 spike 項)。
- **跨切片鐵則落地**:tool calling 強制、走 AI Gateway、propose→confirm、create_collection 例外直接建、多租戶(chat 綁 workspace,query 經 scopedDb)。
