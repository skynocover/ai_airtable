## Context

本 change 把 AI 接上 #2 的資料層。核心設計原則:**AI 是資料層之上的另一個 client,不另開寫入路徑**。建表走 #2 的建立邏輯、改 schema 走 #2 的 `POST /operations`、查資料走 #2 的 records 列表。AI 唯一「特權」是用 tool calling 產生這些操作的參數(或提案),真正的寫入仍由既有、已測過的端點完成。最關鍵的安全機制是 propose→confirm:AI 改 schema 永遠只能「提案」,DB 寫入由用戶按鈕觸發。

## Goals / Non-Goals

**Goals:**
- AI Gateway client(tool calling + SSE + token 用量擷取)
- chat sessions/messages + SSE 串流 + system prompt 組裝 + context 綁定
- 三個 tool:create_collection(直接)、propose_schema_operations(提案)、query_records
- propose→confirm 流程(接受/拒絕、刪欄位紅色二次確認、版本衝突)
- 前端常駐 chat 面板 + tool 卡片

**Non-Goals:**
- 對話寫 records、跨 collection 路由、對話洞察、對話式表單(Phase 3)
- 逐欄編輯提案、AI token 限制(#6)、vision 抽取(#4)、多 provider

## Decisions

### AI 只產生「參數/提案」,寫入走既有端點

**決定**:
- `create_collection` → 直接呼叫 #2 collection 建立邏輯(server 端,經 scopedDb)。例外於 propose,因空表無覆蓋風險。
- `propose_schema_operations` → server 端只組出提案物件(operations + reason + 當前 schema_version),存進 assistant 訊息 `actions_json`,**不呼叫 `POST /operations`**。
- 用戶接受 → 前端呼叫 `POST /operations` → 回來後 patch 該訊息 `actions_json.result = applied`。

**理由**:單一寫入入口 + 樂觀鎖已在 #2 測過;AI 拿不到該入口,亂呼叫 tool 也改不到資料。這是把鐵則 #2 做成「結構上不可能繞過」。

### 提案狀態存哪、怎麼存活過重整

**決定**:提案存 assistant `chat_messages.actions_json`,結構含 `{ type:'schema_operation', payload:{operations, schema_version}, status:'pending'|'applied'|'rejected' }`。前端渲染卡片時讀此狀態;重整後從歷史讀回,卡片狀態正確(pending 仍可操作、applied/rejected 顯示結果)。

**替代方案**:提案存獨立暫存表 —— 否決,徒增一張表;提案本就屬於那則訊息,放 `actions_json` 最自然且自帶歷史。

### query_records 不灌 raw records

**決定**:`query_records` 走 #2 records 列表(structured filter/sort/limit/offset),回傳結果摘要給 AI;AI 以自然語言回覆筆數/重點。不把所有 record 內容塞進 context(隱私 + 成本,PLAN.md §5.6.4)。進階「讓 AI 看少量 record」屬 Phase 3。

**filter 運算子**:`eq`/`gt`/`lt`/`contains`/`between`,對齊 #2 records 列表的 filter param 格式(同一格式,避免兩套)。

### system prompt 與歷史長度

**決定**:system prompt = 產品上下文 + workspace collections 簡介 + 當前綁定 collection 完整 schema + tools。chat 歷史只帶最近 N 則(N 為常數,實作定),避免 context 無限增長燒 token。

### token 用量:記錄但不限制

**決定**:client 從 Claude 回應擷取 usage,寫入記錄(供 #6)。本 change 不檢查、不阻擋 —— 限制邏輯集中在 #6 一次做,避免分散。

## Risks / Trade-offs

- **AI 繞過 propose 直接改資料** → 結構上不可能:AI 只能呼叫 tool,tool 不含 `POST /operations` 能力;寫入由前端用戶動作觸發。
- **提案與當前 schema 版本脫節** → 提案帶 schema_version,確認時樂觀鎖比對,衝突則拒絕 refetch(沿用 #2)。
- **SSE 在 Workers 的串流穩定性** → 用標準 streaming Response;若中斷,assistant 訊息以已完成內容持久化,前端可重載歷史。
- **歷史過長燒 token** → 只帶最近 N 則;必要時加摘要(Phase 3 再說)。
- **隱私:record 內容進 LLM** → query 只回 structured 結果,不灌 raw records;system prompt 不含 record 資料,只含 schema。
- **AI 不訓練** → Week 0 spike 已確認 AI Gateway + Claude 不用於訓練;設定時 double check。

## Migration Plan

- `migrations/0003_chat.sql`:`chat_sessions`、`chat_messages`(含 `actions_json`)+ `idx_chat_messages_session`。
- 設定 AI Gateway endpoint + Anthropic API key(Worker secret)。
- 回退:移除 migration 與 AI route(不影響 #1/#2 資料層)。

## Open Questions

- 歷史 N 的數值(實作時定,可先 20）。
- query_records 結果回給 AI 的摘要上限(避免大結果灌爆 context)—— 定一個 row 數上限 + 必要欄位。
- create_collection 是否需要在前端也顯示一張「已建立」回饋卡(非確認、純告知）—— 建議是,提升掌控感。
