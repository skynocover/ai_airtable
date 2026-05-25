## ADDED Requirements

### Requirement: 註冊後自動建立 workspace

系統 SHALL 在 user 首次建立時(email 註冊或首次 Google 登入)自動建立一個 workspace,該 user 為 `owner_id`,`plan` 預設 `'free'`,並產生 workspace 內唯一的 `slug`。一個新 user 完成註冊後 MUST 立即擁有可用的 workspace。

#### Scenario: 註冊即擁有 workspace
- **WHEN** 一個新 user 完成註冊(email 或 Google)
- **THEN** 系統建立一筆 `workspaces`(`owner_id` = 該 user、`plan='free'`、具唯一 slug),user 無需任何額外步驟即可使用

#### Scenario: workspace slug 唯一
- **WHEN** 自動建立 workspace 產生 slug
- **THEN** slug 在 `workspaces` 表唯一;若碰撞則重新產生直到唯一

### Requirement: 請求 context 解析當前 workspace

系統 SHALL 在每個已登入請求中,由 session 對應的 user 解析出其 workspace,並注入請求 context,供 handler 以 `scopedDb(workspace_id)` 存取資料。handler MUST 透過此 context 取得 `workspace_id`,而非由 client 傳入。

#### Scenario: 已登入請求帶出 workspace context
- **WHEN** 已登入 user 發出 `/api/v1/*` 請求
- **THEN** 中介層由其 session → user → workspace 解析出 `workspace_id` 並注入 context

#### Scenario: client 無法偽造 workspace_id
- **WHEN** 請求 body / query 嘗試指定他人的 `workspace_id`
- **THEN** 系統忽略該值,一律使用 session 解析出的 workspace,避免越權存取

### Requirement: 取得當前 workspace

系統 SHALL 提供 `GET /api/v1/workspace` 回傳當前登入 user 的 workspace 基本資訊(id、name、slug、plan)。

#### Scenario: 取得當前 workspace
- **WHEN** 已登入 user 呼叫 `GET /api/v1/workspace`
- **THEN** 回傳其 workspace 的 id、name、slug、plan

### Requirement: 重新命名 workspace

系統 SHALL 提供 `PATCH /api/v1/workspace` 讓 owner 修改 workspace 名稱。

#### Scenario: 改名成功
- **WHEN** owner 以合法新名稱呼叫 `PATCH /api/v1/workspace`
- **THEN** 更新 `workspaces.name` 與 `updated_at`,回傳更新後資料

#### Scenario: 空名稱被拒
- **WHEN** 提交空白或僅空白字元的名稱
- **THEN** 回傳驗證錯誤(繁中),名稱不變
