## Why

建完 collection 後,目前**只能透過 AI 對話提案卡**改欄位結構(加/刪/改名/重排)—— 前端沒有手動入口。但「改一下欄位名」「加一欄」這種小事,逼用戶開對話講一句話再等 AI 提案、再按接受,體感過重且在沒設定 AI Gateway 時完全做不到。後端 `POST /collections/:id/operations`(五種 operation + 樂觀鎖)在 #2 已完整實作並有測試,只差前端一個手動入口。

## What Changes

- **在 `/c/:slug` 表格檢視加一個「管理欄位」面板/對話框**,讓用戶不經 AI 直接改當前 collection 的 schema:
  - 加欄位(7 種型別;select_single 需 options)
  - 刪欄位 —— **紅色 + 二次確認**,文案說明「既有資料保留但不再顯示,重建欄位可救回」(對齊 AI 提案卡的刪欄位處理)
  - 改名(rename_field)
  - 改欄位設定(update_field_meta:required / options / currency / ai_hint …)—— **不可改 type**(維持拒絕 change_field_type)
  - 重排欄位順序(reorder_fields)
- 所有變更**直接呼叫既有 `POST /api/v1/collections/:id/operations`**,帶當前 `schema_version`(樂觀鎖);衝突(409)時提示「表格已被更新,請重新整理」並 refetch schema —— 與 AI 接受提案走同一條寫入路徑。
- 套用成功後 refetch collection schema,表格即時反映新欄位。

## Capabilities

### New Capabilities
<!-- 無新增 capability;此為既有前端後台檢視的行為擴充。 -->

### Modified Capabilities
- `admin-table-view`: 新增「手動管理欄位(schema)」需求 —— 表格檢視提供不經 AI 的 schema 編輯入口,經 `POST /operations`(樂觀鎖)套用五種 operation,刪欄位紅色二次確認,拒絕改 type,衝突提示 refetch。

## Impact

- **前端**:`web/src/pages/CollectionView.tsx`(加「管理欄位」入口)、新增欄位管理元件(對話框/面板)、`web/src/lib/api.ts` 已有 `applyOperations` 可直接用,必要時補 `getCollection` refetch。字串常數加到 `shared/src/strings.ts`。
- **後端**:**不動**。`POST /api/v1/collections/:id/operations`、operation 引擎、樂觀鎖、audit log 皆沿用 #2 既有實作與測試。
- **不影響**:AI 對話 / 提案卡(#3)另走 `applyOperations` 同一端點,兩條入口並存不衝突。
- **鐵則**:軟刪(刪欄位不動 records 資料)、7 種型別、拒絕 change_field_type、D1 `current_schema_json` 為真相 —— 全部由既有後端保證,前端只組 operation 參數。
