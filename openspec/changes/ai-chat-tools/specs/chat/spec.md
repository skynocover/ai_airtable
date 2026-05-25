## ADDED Requirements

### Requirement: Chat session 管理

系統 SHALL 提供 chat session 的 CRUD:`GET /api/v1/chat/sessions`(列表)、`POST`(建立)、`DELETE /api/v1/chat/sessions/:id`、`GET /api/v1/chat/sessions/:id/messages`(歷史)。session 綁定當前 workspace 與 user,可選 `context_collection_id`。所有存取經 `scopedDb(workspace_id)`。

#### Scenario: 建立並列出 session
- **WHEN** 已登入 user 建立 chat session
- **THEN** session 綁定其 workspace/user,出現在其 session 列表;不含其他 workspace 的 session

#### Scenario: session 綁定 collection context
- **WHEN** 建立或切換 session 的 `context_collection_id`
- **THEN** 後續該 session 的 system prompt 帶入該 collection 的完整 schema

### Requirement: 發送訊息以 SSE 串流回應

系統 SHALL 提供 `POST /api/v1/chat/sessions/:id/messages` 發送使用者訊息,以 SSE 串流回 AI 回應。user 與 assistant 訊息 MUST 持久化於 `chat_messages`;assistant 訊息的 tool call / 提案存於 `actions_json`。

#### Scenario: 發送訊息得到串流回應
- **WHEN** user 在 session 發送訊息
- **THEN** 持久化 user 訊息,AI 回應以 SSE 串流,完成後持久化 assistant 訊息(含 `actions_json`)

### Requirement: System prompt 組裝

系統 SHALL 為每次 AI 呼叫組裝 system prompt,內容包含:產品上下文、當前 workspace 所有 collections 簡介、當前綁定 collection 的完整 schema、可用 tools。chat 歷史 MUST 只帶最近 N 則進 context(避免無限長大燒 token)。

#### Scenario: prompt 含當前 schema
- **WHEN** session 綁定某 collection 並發送訊息
- **THEN** system prompt 含該 collection 的完整 schema(欄位 name/type/ai_hint),AI 據此操作

#### Scenario: 只帶最近 N 則歷史
- **WHEN** session 訊息數超過 N
- **THEN** 只有最近 N 則進入 context,不會無限增長

### Requirement: 前端常駐 Chat 面板

系統 SHALL 在登入後介面提供常駐右側、可摺疊的 chat 面板,顯示當前 collection context,AI 回應中的 tool call(建表 / 提案 / 查詢)以**卡片**呈現(非純文字),並即時串流。

#### Scenario: tool call 以卡片呈現
- **WHEN** AI 回應含 schema 提案或查詢結果
- **THEN** 以對應卡片元件呈現(可操作),而非純文字段落

#### Scenario: context 隨當前 collection 同步
- **WHEN** user 在某 `/c/:slug` 頁開啟 chat
- **THEN** chat 面板上方顯示當前對話對象為該 collection
