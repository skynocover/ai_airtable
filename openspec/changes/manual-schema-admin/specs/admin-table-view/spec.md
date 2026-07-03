## ADDED Requirements

### Requirement: 手動管理欄位(schema)

系統 SHALL 在 `/c/:slug` 表格檢視提供**不經 AI 對話**的手動 schema 編輯入口,讓用戶對當前 collection 直接執行五種 operation:`add_field`、`remove_field`、`rename_field`、`update_field_meta`、`reorder_fields`。所有變更 MUST 走既有 `POST /api/v1/collections/:id/operations`(帶當前 `schema_version` 樂觀鎖),與 AI 接受提案同一條寫入路徑;系統 MUST NOT 另闢 schema 寫入通道。套用成功後 SHALL refetch collection schema,表格即時反映。

#### Scenario: 手動加欄位
- **WHEN** user 在管理欄位介面新增一個欄位(名稱 + 7 種型別之一;`select_single` 提供 options)
- **THEN** 以 `add_field` 呼叫 `POST /operations`,成功後 `schema_version +1`,新欄位出現在表格

#### Scenario: 手動改名 / 改欄位設定
- **WHEN** user 改欄位名稱或設定(required / options / currency / ai_hint)
- **THEN** 以 `rename_field` 或 `update_field_meta` 套用;`update_field_meta` MUST NOT 允許改 `type`(維持拒絕 change_field_type)

#### Scenario: 手動重排欄位
- **WHEN** user 調整欄位順序
- **THEN** 以 `reorder_fields`(現有欄位 id 的完整排列)套用,表格欄位順序更新

### Requirement: 刪欄位二次確認

手動刪除欄位 MUST 以**紅色 + 二次確認**呈現,文案說明「既有資料保留但不再顯示,重建欄位可救回」(對齊 AI 提案卡的刪欄位處理)。確認後才以 `remove_field` 套用,且 MUST NOT 刪除或改動 records 的 `data_json`(軟性:殘留 key 於顯示/匯出時忽略)。

#### Scenario: 刪欄位需二次確認
- **WHEN** user 於管理欄位介面選擇刪除某欄位
- **THEN** 以紅色呈現並要求二次確認;確認後才呼叫 `remove_field`,既有 records 資料保留(不再顯示)

#### Scenario: 取消刪除
- **WHEN** user 在二次確認時取消
- **THEN** 不呼叫端點,schema 不變

### Requirement: 手動變更的版本衝突處理

當手動套用 schema 變更時 `schema_version` 已與後端不符(409),系統 MUST 提示「表格已被更新,請重新整理」並 refetch 最新 schema,不套用該次變更。

#### Scenario: 套用時版本衝突
- **WHEN** user 送出手動變更,但 collection 已被其他操作(手動或 AI)改過
- **THEN** `POST /operations` 回 409,前端提示重整並 refetch schema,變更未套用
