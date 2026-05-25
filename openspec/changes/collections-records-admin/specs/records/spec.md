## ADDED Requirements

### Requirement: 手動新增 Record

系統 SHALL 提供 `POST /api/v1/collections/:id/records` 手動新增資料,`data_json` 依當前 schema 的 field types 驗證並以 §2.4 格式儲存,`source = 'manual'`。所有操作經 `scopedDb(workspace_id)`,並冗餘儲存 `workspace_id` 於 records 列以利查詢。

#### Scenario: 新增合法 record
- **WHEN** user 以符合 schema 的值新增 record
- **THEN** 建立 record(`rec_` 前綴 id)、`data_json` 為 sparse + §2.4 格式、`source='manual'`,並綁定當前 workspace

#### Scenario: 值不符型別被拒或留空
- **WHEN** 某欄位值不符其 field type(例如 number 欄位給非數字)
- **THEN** 回驗證錯誤;select 非法值依規則留空

### Requirement: 取得與列表 Records

系統 SHALL 提供 `GET /api/v1/records/:id` 與 `GET /api/v1/collections/:id/records`(列表)。列表 MUST 支援 query params:filter、sort、limit、offset,且只回未軟刪除項,並依 `created_at` 預設排序(對齊 idx_records_collection)。

#### Scenario: 列表只含未刪除且同 workspace
- **WHEN** user 列出某 collection 的 records
- **THEN** 只回 `deleted_at` 為 null 且屬該 workspace 的 records;不含其他 workspace

#### Scenario: 支援排序與分頁
- **WHEN** 帶 `sort`、`limit`、`offset` 列出
- **THEN** 依指定欄位排序並分頁回傳,同時回 total 數

#### Scenario: number 欄位排序為數值比較
- **WHEN** 以某 `number` 欄位排序(透過 `json_extract`)
- **THEN** 以數值大小排序(因存 JSON number),非字典序

### Requirement: 編輯與軟刪除 Record

系統 SHALL 提供 `PATCH /api/v1/records/:id`(inline edit,部分欄位更新,維持 sparse 與 §2.4 格式)與 `DELETE /api/v1/records/:id`(軟刪除,設 `deleted_at`)。

#### Scenario: inline edit 單欄
- **WHEN** user 更新某 record 的單一欄位值
- **THEN** 更新 `data_json` 對應 key(清空則移除 key)、更新 `updated_at`,其他欄位不變

#### Scenario: 軟刪除
- **WHEN** user 刪除 record
- **THEN** 設定 `deleted_at`,該 record 從列表消失但列仍存在

### Requirement: Record 來源(source)

系統 SHALL 在每筆 record 記錄 `source`(`manual` / `screenshot` / `form`)與可選 `source_metadata_json`。本 change 只產生 `manual`;`screenshot`/`form` 值由後續 change 寫入,但欄位與 badge 顯示須先支援。

#### Scenario: 來源被記錄
- **WHEN** 手動新增 record
- **THEN** `source='manual'`,後台可據此顯示來源 badge
