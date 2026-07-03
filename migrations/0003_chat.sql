-- 0003_chat.sql — AI Chat 資料層(對齊 PLAN.md §5.3、ai-chat-tools change)
-- 範圍:chat_sessions(對話)、chat_messages(訊息 + actions_json 存 tool call/提案狀態)。
-- 跨切片鐵則落地:
--   * 多租戶隔離(鐵則 #1):兩張表皆帶 workspace_id,一律經 scopedDb 存取。
--     tasks.md 的 chat_messages 欄位未列 workspace_id,但鐵則 #1 要求「所有資料表有
--     workspace_id」且所有存取過 scopedDb —— 故此處補上(與 0002 的 schema_operations
--     同一處理),讓 chat_messages 也走同一隔離通道,「不帶 workspace_id 查訊息」在型別上不可能。
--   * actions_json 存 assistant 訊息的 tool call / schema 提案(狀態 pending/applied/rejected),
--     重整後從歷史讀回即可還原卡片狀態(鐵則:D1 是真相)。
-- 時間戳一律 unix ms(INTEGER)。

-- ===== Chat Sessions(一段對話;可綁定一個 collection context)=====
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,                          -- chat_ 前綴
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  context_collection_id TEXT REFERENCES collections (id),  -- 當前對話對象(可為 null)
  title TEXT,                                   -- 由首則訊息生成
  last_message_at INTEGER,                      -- 最近訊息時間(列表排序用)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_chat_sessions_workspace ON chat_sessions (workspace_id, user_id, last_message_at);

-- ===== Chat Messages(每則訊息;assistant 的 tool call/提案存 actions_json)=====
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,                          -- msg_ 前綴
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),  -- 鐵則 #1:過 scopedDb
  session_id TEXT NOT NULL REFERENCES chat_sessions (id),
  role TEXT NOT NULL,                           -- 'user' | 'assistant'
  content TEXT NOT NULL,                        -- 訊息文字
  actions_json TEXT,                            -- assistant 的 tool 卡片陣列(建表/提案/查詢),含狀態
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_chat_messages_session ON chat_messages (session_id, created_at);
