-- 0002_collections_records.sql — 產品核心資料層(對齊 PLAN.md §5.3)
-- 範圍:collections(schema snapshot)、schema_operations(audit log)、records(資料)。
-- 跨切片鐵則落地:
--   * 多租戶隔離(鐵則 #1):三張表皆帶 workspace_id,一律經 scopedDb 存取。
--     PLAN §5.3 的 schema_operations 未列 workspace_id,但鐵則 #1 要求「所有資料表有
--     workspace_id」且所有存取過 scopedDb —— 故此處補上,讓 audit log 也走同一隔離通道。
--   * D1 唯一真相(鐵則 #4):collections.current_schema_json 為 schema 真相;
--     schema_operations 只是 append 的 audit log,讀取時不 reduce 重算。
--   * 軟刪除(鐵則 #7):collections / records 用 deleted_at,不實刪。
-- 時間戳一律 unix ms(INTEGER)。

-- ===== Collections(每個 = 一張資料表的定義)=====
CREATE TABLE collections (
  id TEXT PRIMARY KEY,                          -- col_ 前綴
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,                           -- workspace 內唯一(見下方 UNIQUE)
  icon TEXT,                                    -- emoji
  description TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,    -- 樂觀鎖基準;每次 apply operations +1
  current_schema_json TEXT NOT NULL,            -- { fields: Field[] } —— schema 的唯一真相
  deleted_at INTEGER,                           -- 軟刪除
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, slug)
);

CREATE INDEX idx_collections_workspace ON collections (workspace_id, deleted_at);

-- ===== Schema Operations(audit log;只 append,不在讀取時重算)=====
CREATE TABLE schema_operations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),  -- 鐵則 #1:過 scopedDb
  collection_id TEXT NOT NULL REFERENCES collections (id),
  operation_json TEXT NOT NULL,                 -- 單一 SchemaOperation
  applied_by TEXT NOT NULL,                     -- 'user' | 'ai'(本 change 僅 'user')
  user_id TEXT NOT NULL REFERENCES users (id),
  reason TEXT,                                  -- AI 的理由說明(本 change 多為 null)
  applied_at INTEGER NOT NULL
);

CREATE INDEX idx_schema_ops_collection ON schema_operations (collection_id, applied_at);

-- ===== Records(每筆資料;data_json 為 §2.4 sparse 格式)=====
CREATE TABLE records (
  id TEXT PRIMARY KEY,                          -- rec_ 前綴
  collection_id TEXT NOT NULL REFERENCES collections (id),
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),  -- 冗餘儲存以利查詢/隔離
  data_json TEXT NOT NULL,                      -- { [field_id]: value } sparse
  source TEXT NOT NULL,                         -- 'manual' | 'screenshot' | 'form'
  source_metadata_json TEXT,
  deleted_at INTEGER,                           -- 軟刪除
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_records_collection ON records (collection_id, deleted_at, created_at DESC);
CREATE INDEX idx_records_workspace ON records (workspace_id);
