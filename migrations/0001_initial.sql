-- 0001_initial.sql — Phase 1 地基 schema(對齊 PLAN.md §5.3)
-- 範圍:auth(users / accounts / sessions / verifications)+ workspaces。
-- 注意:
--   * 表名沿用 PLAN.md 的複數命名(users/accounts/sessions/workspaces);
--     Better Auth 透過 modelName/fields 映射到這些表與欄位(見 worker/src/lib/auth.ts)。
--   * `verifications` 不在 PLAN §5.3 的四表清單,但 Better Auth 的「忘記/重設密碼」
--     token 儲存於此表 —— 為了讓 reset 流程成立而必須加入(design.md Open Question 已授權微調)。
--   * 時間戳以 unix ms(INTEGER)為主;auth 表非 STRICT,容忍 Better Auth 寫入的格式。
--   * workspaces 的 quota counter 欄位本 change 只建欄位,不啟用任何計數/檢查邏輯。

-- ===== Users =====
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  avatar_url TEXT,                 -- Better Auth `image` 映射到此欄
  hashed_password TEXT,            -- PLAN 相容欄位;credential 密碼實際由 Better Auth 存於 accounts.password
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_users_email ON users (email);

-- ===== Accounts(Better Auth account 連結:credential / google)=====
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  provider TEXT NOT NULL,                  -- Better Auth providerId:'credential' | 'google'
  provider_account_id TEXT NOT NULL,       -- Better Auth accountId
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,                           -- credential 密碼雜湊(Better Auth 管理)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (provider, provider_account_id)
);

CREATE INDEX idx_accounts_user ON accounts (user_id);

-- ===== Sessions =====
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_sessions_token ON sessions (token);
CREATE INDEX idx_sessions_user ON sessions (user_id);

-- ===== Verifications(忘記/重設密碼、email 驗證 token)=====
CREATE TABLE verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_verifications_identifier ON verifications (identifier);

-- ===== Workspaces =====
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users (id),
  plan TEXT NOT NULL DEFAULT 'free',           -- 'free' | 'pro'(Phase 1 僅 free)
  -- Quota counters(本 change 僅建欄位,不啟用邏輯;留給 quota-limits change)
  records_used INTEGER NOT NULL DEFAULT 0,
  screenshots_used_this_month INTEGER NOT NULL DEFAULT 0,
  ai_tokens_used_this_month INTEGER NOT NULL DEFAULT 0,
  quota_reset_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_workspaces_slug ON workspaces (slug);
-- owner_id 唯一:Phase 1 一個 user 恰好一個 workspace。讓 DB 兜底,
-- 杜絕「after-hook + self-heal 競態」重複建立 workspace(否則資料會被孤立)。
CREATE UNIQUE INDEX idx_workspaces_owner ON workspaces (owner_id);
