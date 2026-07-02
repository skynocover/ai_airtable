# schema-operations Specification

## Purpose

7 種 field types 定義與型別專屬 config、五種 SchemaOperation、apply 到 `current_schema_json` snapshot(D1 唯一真相,讀取不 reduce operations 重算)、`schema_operations` audit log、`POST /operations` 唯一寫入入口 + `schema_version` 樂觀鎖,以及欄位值儲存格式規則(§2.4,零轉換)。

## Requirements

### Requirement: 支援 7 種 field types

系統 SHALL 支援且僅支援這 7 種 field types:`short_text`、`long_text`、`number`、`select_single`、`date`、`email`、`phone`。每個 Field 含 `id`(`fld_` 前綴)、`name`、`type`、`required`、`order`,以及型別專屬 config(`options` 給 select、`currency` 給金額、`min`/`max`/`pattern` 驗證、`ai_hint`、`hidden_in_public`)。金額 MUST 以 `number` + `currency` 表示,**不存在獨立 `currency` 型別**。

#### Scenario: 拒絕未知 field type
- **WHEN** 嘗試新增 `type` 不在 7 種之內的欄位(例如 `currency`、`select_multi`)
- **THEN** 拒絕並回驗證錯誤;金額欄位須以 `number` + `currency` 表達

#### Scenario: select_single 需有 options
- **WHEN** 新增 `select_single` 欄位
- **THEN** 必須提供 `options` 字串陣列,否則驗證失敗

### Requirement: Schema operation 五種操作 apply 到 snapshot

系統 SHALL 支援五種 SchemaOperation:`add_field`、`remove_field`、`rename_field`、`update_field_meta`、`reorder_fields`。apply 時 MUST 直接修改 `collections.current_schema_json`(snapshot),`current_schema_json` 為 schema 的唯一真相。系統 MUST NOT 在讀取 schema 時 reduce operations 重算。Phase 1 不支援 `change_field_type`。

#### Scenario: add_field 寫入 snapshot
- **WHEN** apply 一個 `add_field` operation
- **THEN** 新欄位出現在 `current_schema_json.fields`,並依 `at_order` / `order` 排序

#### Scenario: remove_field 不動既有 records 資料
- **WHEN** apply 一個 `remove_field`
- **THEN** 欄位從 `current_schema_json` 移除,但既有 records 的 `data_json` 中該 field_id 的值保留(不主動清除)

#### Scenario: 讀取 schema 直接讀 snapshot
- **WHEN** 取得 collection 的當前 schema
- **THEN** 直接回 `current_schema_json`,不重播 `schema_operations`

#### Scenario: 拒絕 change_field_type
- **WHEN** 嘗試改變既有欄位的 type
- **THEN** 拒絕(Phase 1 不支援),提示改用刪欄位重建

### Requirement: POST /operations 是 schema 寫入唯一入口且有樂觀鎖

系統 SHALL 提供 `POST /api/v1/collections/:id/operations` 作為套用 schema 變動的唯一寫入入口,請求 MUST 帶 `schema_version`(樂觀鎖基準)。版本與當前 `collections.schema_version` 不符時 MUST 拒絕並提示前端 refetch。成功時 MUST 在單一邏輯流程內:apply 到 `current_schema_json`、`schema_version +1`、寫入 `schema_operations` audit log。

#### Scenario: 版本相符成功套用
- **WHEN** 以與當前相符的 `schema_version` + 合法 operations 呼叫 `POST /operations`
- **THEN** snapshot 更新、`schema_version` +1、每個 operation 寫一筆 `schema_operations`,回傳新版本

#### Scenario: 版本衝突被拒
- **WHEN** 以過時 `schema_version`(其他分頁/操作已改過)呼叫
- **THEN** 拒絕該次套用,回傳版本衝突錯誤,提示前端重新整理;snapshot 不變

#### Scenario: audit log 記錄來源
- **WHEN** 成功套用 operations
- **THEN** `schema_operations` 記錄 `operation_json`、`applied_by`(本 change 為 `user`)、`user_id`、`applied_at`

### Requirement: 欄位值儲存格式(§2.4,零轉換)

系統 SHALL 以固定格式儲存 `records.data_json`,且寫入/讀取/顯示零轉換:`short_text`/`long_text` 存 string;`number` 存 JSON number(不含逗號/符號);`select_single` 存 option label 字串(須為 options 之一,否則留空);`date` 存 ISO `YYYY-MM-DD` 字串;`email` 存驗證過的字串;`phone` 永遠存字串(保留前導 0 與 +886)。空值 MUST NOT 存該 key(sparse)。

#### Scenario: number 存為 JSON number
- **WHEN** 寫入金額 50000
- **THEN** `data_json` 存 `50000`(JSON number),非字串、不含符號;`json_extract` 數值比較正確

#### Scenario: phone 存為字串保留前導 0
- **WHEN** 寫入電話 `0912345678`
- **THEN** `data_json` 存字串 `"0912345678"`,前導 0 不丟失

#### Scenario: 空值不存 key
- **WHEN** 某欄位無值
- **THEN** `data_json` 不含該 field_id 的 key(不存 null)

#### Scenario: select_single 非法值留空
- **WHEN** 寫入的 select 值不在 `options` 內
- **THEN** 該欄位留空(不存 key),不寫入非法值
