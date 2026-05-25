## ADDED Requirements

### Requirement: Collection 列表

系統 SHALL 在 `/home` 顯示當前 workspace 的 collection 列表(name、icon),點選進入 `/c/:slug`。新 workspace 無 collection 時 SHALL 顯示友善空狀態引導(繁中)。

#### Scenario: 顯示 collection 列表
- **WHEN** 已登入 user 進入 `/home`
- **THEN** 顯示其 workspace 未刪除的 collections,可點入

#### Scenario: 空狀態引導
- **WHEN** workspace 尚無任何 collection
- **THEN** 顯示引導文案(例如「開始建立你的第一個 Collection」),而非空白畫面

### Requirement: 表格檢視

系統 SHALL 在 `/c/:slug`(預設 `view=records`)以表格呈現 records,欄位依 `current_schema_json` 的 fields 與 `order`;`number` + `currency` 欄位以 `Intl.NumberFormat('zh-TW', {style:'currency', currency})` 顯示;`data_json` 中不在當前 schema 的殘留 key MUST NOT 顯示為欄位。每列顯示來源 badge。

#### Scenario: 依當前 schema 渲染欄位
- **WHEN** user 開啟 collection 表格
- **THEN** 欄位順序與名稱來自 `current_schema_json`,殘留(已刪欄位)的 data 不顯示

#### Scenario: 金額欄位格式化顯示
- **WHEN** 顯示一個 `number` + `currency='TWD'` 欄位值 50000
- **THEN** 顯示為當地貨幣格式(如 `NT$50,000`),但底層值仍為 number

#### Scenario: 來源 badge
- **WHEN** 列出 records
- **THEN** 每列依 `source` 顯示對應 badge(手動 / 截圖 / 表單)

### Requirement: Inline 編輯

系統 SHALL 允許在表格內直接編輯單一儲存格,送出 `PATCH /api/v1/records/:id`,編輯 UI 依該欄位 field type 提供合適輸入(文字 / 數字 / 日期 / 下拉)。

#### Scenario: 編輯儲存格
- **WHEN** user 在表格點選某儲存格並輸入新值
- **THEN** 依 field type 驗證後 PATCH 更新,表格即時反映

#### Scenario: select 欄位以下拉編輯
- **WHEN** 編輯 `select_single` 欄位
- **THEN** 提供 options 下拉,不接受任意自由輸入

### Requirement: 排序

系統 SHALL 允許依欄位排序表格,透過 records 列表 API 的 sort param。

#### Scenario: 點欄位標題排序
- **WHEN** user 點某欄位標題切換排序
- **THEN** 表格依該欄位排序(number 為數值序),分頁保持一致

### Requirement: CSV 匯出

系統 SHALL 提供 `POST /api/v1/collections/:id/records/export` 匯出當前 collection 未刪除 records 為 CSV,欄位依 `current_schema_json`(殘留 key 不匯出),含繁中欄位名表頭。

#### Scenario: 匯出 CSV
- **WHEN** user 觸發匯出
- **THEN** 下載 CSV,欄位順序/名稱依當前 schema,只含未刪除 records,值為 §2.4 原始值(金額為數字)

#### Scenario: 匯出範圍限當前 workspace
- **WHEN** 匯出某 collection
- **THEN** 僅匯出該 collection(經 scopedDb)資料,不洩露其他 workspace
