## 1. D1 migration

- [ ] 1.1 撰寫 `migrations/0003_chat.sql`:`chat_sessions`(`workspace_id`、`user_id`、`context_collection_id`、`title`、`last_message_at`)
- [ ] 1.2 同檔加入 `chat_messages`(`session_id`、`role`、`content`、`actions_json`、`created_at`)+ `idx_chat_messages_session`
- [ ] 1.3 本地 apply 並驗證

## 2. AI Gateway client

- [ ] 2.1 `worker/src/ai/client.ts`:經 AI Gateway 呼叫 Claude Sonnet,Anthropic key 走 Worker secret
- [ ] 2.2 封裝 tool calling:註冊 tools、解析 tool_use、回傳 tool result(structured,不 parse 自由文字)
- [ ] 2.3 SSE 串流封裝
- [ ] 2.4 擷取每次呼叫 token 用量並記錄(不限制);確認 AI Gateway/Claude 不訓練設定
- [ ] 2.5 在 `shared/` 定義 tool 參數型別 + zod(create_collection / propose_schema_operations / query_records)

## 3. Tool 定義與 prompt

- [ ] 3.1 `worker/src/ai/tools.ts`:三個 tool 的 schema(對齊 PLAN.md §5.6.2,propose 帶 schema_version)
- [ ] 3.2 `worker/src/ai/prompts.ts`:system prompt 組裝(產品上下文 + collections 簡介 + 當前 schema + tools)
- [ ] 3.3 截圖抽取格式指令不在此 change(留 #4);本 change prompt 聚焦 schema/查詢

## 4. create_collection tool(直接建立)

- [ ] 4.1 實作 tool handler:呼叫 #2 collection 建立邏輯(經 scopedDb),initial_fields 僅限 7 種型別
- [ ] 4.2 拒絕非法型別(如 currency);金額須 number+currency
- [ ] 4.3 前端顯示「已建立」回饋卡(純告知)
- [ ] 4.4 測試:AI 建表直接生效、綁當前 workspace、非法型別被拒

## 5. propose_schema_operations tool(提案不寫 DB)

- [ ] 5.1 實作 tool handler:只組提案(operations + reason + 當前 schema_version),**不呼叫 POST /operations**
- [ ] 5.2 提案以 `pending` 存進 assistant 訊息 `actions_json`
- [ ] 5.3 測試:呼叫後 `current_schema_json` 與 `schema_version` 不變

## 6. propose → confirm 流程(前端 + 串接)

- [ ] 6.1 提案卡片:顯示 operations + reason,只提供「接受 / 拒絕」
- [ ] 6.2 接受 → 呼叫 #2 `POST /collections/:id/operations`(帶提案 schema_version)→ 成功後 patch `actions_json.status='applied'`
- [ ] 6.3 拒絕 → 標記 `rejected`,不呼叫端點
- [ ] 6.4 `remove_field` 提案以紅色 + 二次確認,文案說明資料保留可救回
- [ ] 6.5 版本衝突:套用被拒時提示「表格已被更新,請重新整理」並 refetch schema
- [ ] 6.6 重整後從歷史讀回提案卡片,狀態正確(pending 可操作 / applied / rejected)
- [ ] 6.7 測試:接受套用成功、拒絕不變、刪欄位二次確認、版本衝突被擋

## 7. query_records tool

- [ ] 7.1 實作 tool handler:structured filter(eq/gt/lt/contains/between)/sort/limit/offset,走 #2 records 列表(scopedDb)
- [ ] 7.2 filter/sort 格式對齊 #2 records 列表(同一套)
- [ ] 7.3 回給 AI 的結果設摘要/row 上限,不灌全部 raw records
- [ ] 7.4 測試:「上週收到幾筆」走 created_at filter、限當前 workspace、不灌 raw records

## 8. Chat API 與 session

- [ ] 8.1 `GET/POST /api/v1/chat/sessions`、`DELETE /:id`、`GET /:id/messages`(經 scopedDb)
- [ ] 8.2 `POST /api/v1/chat/sessions/:id/messages`:持久化 user 訊息 → 呼叫 AI(帶 tools)→ SSE 串流 → 持久化 assistant 訊息(含 actions_json)
- [ ] 8.3 system prompt 帶當前綁定 collection 完整 schema;歷史只帶最近 N 則
- [ ] 8.4 測試:session 不跨 workspace、串流可用、訊息持久化

## 9. 前端 Chat 面板

- [ ] 9.1 常駐右側可摺疊面板;上方顯示當前 collection context
- [ ] 9.2 SSE 串流即時顯示
- [ ] 9.3 tool call 以卡片呈現(建表回饋卡 / schema 提案卡 / 查詢結果卡),非純文字
- [ ] 9.4 context 隨當前 `/c/:slug` 同步

## 10. 端對端驗證

- [ ] 10.1 空白對話 → AI 建出 5-7 欄位合理 schema(create_collection 直接生效)
- [ ] 10.2 「加 X 欄位 / 改 Y / 刪 Z」→ propose 卡片 → 接受套用、schema_version 遞增、audit log 有紀錄
- [ ] 10.3 刪欄位 → 紅色二次確認;拒絕 → schema 不變
- [ ] 10.4 「上週收到幾筆」「預算最高的是哪個」→ query_records → 自然語言正確回覆
- [ ] 10.5 多租戶:chat/query 不跨 workspace;AI 無法繞過 propose 直接改 schema(結構驗證)
- [ ] 10.6 token 用量被記錄(供 #6),本 change 不阻擋
