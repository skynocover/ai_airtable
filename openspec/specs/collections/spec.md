# collections Specification

## Purpose

Collection 資料模型與生命週期:CRUD、workspace 內唯一 slug 生成(含保留字避開)、軟刪除、`schema_version`。所有存取經 `scopedDb(workspace_id)`,`workspace_id` 由 server context 取得,確保多租戶隔離。

## Requirements

### Requirement: 建立 Collection

系統 SHALL 提供 `POST /api/v1/collections` 在當前 workspace 建立 Collection,含 `name`、workspace 內唯一 `slug`、可選 `icon`(emoji)與 `description`,初始 `schema_version = 1`,並以提供的 initial fields 初始化 `current_schema_json`。所有操作經 `scopedDb(workspace_id)`,`workspace_id` 由 server context 取得。

#### Scenario: 成功建立 collection
- **WHEN** 已登入 user 以合法 name + initial fields 呼叫 `POST /api/v1/collections`
- **THEN** 在其 workspace 建立 collection,`current_schema_json` 含初始 fields,`schema_version=1`,回傳含 `col_` 前綴 id

#### Scenario: collection 綁定到當前 workspace
- **WHEN** 建立 collection
- **THEN** `workspace_id` 取自 session context,client 無法指定他人 workspace

### Requirement: Collection slug 生成與保留字

系統 SHALL 生成 workspace 內唯一的 slug;碰撞時自動加後綴直到唯一。slug MUST 排除保留字(如 `api`、`f`、`auth`)。

#### Scenario: slug 在 workspace 內唯一
- **WHEN** 同一 workspace 建立兩個同名 collection
- **THEN** 第二個取得不同 slug(加後綴),`UNIQUE(workspace_id, slug)` 不衝突

#### Scenario: 保留字被避開
- **WHEN** 名稱會產生保留字 slug(如 `api`)
- **THEN** 系統改用非保留的替代 slug

### Requirement: 列出與取得 Collection

系統 SHALL 提供 `GET /api/v1/collections`(當前 workspace 未軟刪除的列表)與 `GET /api/v1/collections/:id`(單一,含 `current_schema_json`)。

#### Scenario: 列表只含當前 workspace 未刪除項
- **WHEN** user 呼叫 `GET /api/v1/collections`
- **THEN** 只回傳其 workspace 中 `deleted_at` 為 null 的 collections,不含其他 workspace

#### Scenario: 取得他人 collection 被拒
- **WHEN** user 以他人 workspace 的 collection id 呼叫 `GET /api/v1/collections/:id`
- **THEN** 回傳 404(經 scopedDb 查不到),不洩露存在與否

### Requirement: 更新與軟刪除 Collection

系統 SHALL 提供 `PATCH /api/v1/collections/:id`(改 name / icon / description)與 `DELETE /api/v1/collections/:id`(軟刪除,設 `deleted_at`,不實刪)。

#### Scenario: 改名與 icon
- **WHEN** user 對自己 workspace 的 collection 提交合法 name/icon
- **THEN** 更新對應欄位與 `updated_at`

#### Scenario: 軟刪除
- **WHEN** user 刪除 collection
- **THEN** 設定 `deleted_at`,該 collection 從列表消失但資料列仍存在(可未來救回)
