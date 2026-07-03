## Context

#2 已把 schema 寫入做成「單一入口 + 樂觀鎖」:`POST /api/v1/collections/:id/operations`(五種 operation,operation 引擎純函式、`current_schema_json` 為真相、audit log、樂觀鎖 409),並有整合測試覆蓋。#3 的 AI 提案卡在用戶接受時就是呼叫這個端點(`api.applyOperations`)。但前端**只有** AI 提案卡這條入口 —— 沒有手動 schema 編輯 UI。本 change 就是補上手動入口,復用同一端點與同一套 `SchemaOperation` 型別/zod。

## Goals / Non-Goals

**Goals:**
- `/c/:slug` 表格檢視加「管理欄位」入口(對話框或側欄),支援 add/remove/rename/update_meta/reorder。
- 復用既有 `POST /operations`(樂觀鎖)與 `shared` 的 `SchemaOperation` / `fieldInputSchema`;前端只組參數。
- 刪欄位紅色二次確認;拒絕改 type;409 衝突提示 refetch。
- 套用後 refetch collection schema,表格即時更新。

**Non-Goals:**
- 不動任何後端(operations 端點、引擎、樂觀鎖、audit 全沿用 #2)。
- 不做 AI 相關(那是 #3);兩條入口共用端點但各自獨立。
- 不做欄位型別變更(change_field_type 在後端本就被拒)。
- 不做批次/拖拉重排的華麗互動(Phase 1 用簡單上下移或數字序即可);進階 UX 之後再說。

## Decisions

### 復用單一寫入端點,前端只組 operation
**決定**:手動編輯把每次操作組成 `SchemaOperation`(或一次多個 operations 陣列)呼叫 `api.applyOperations(id, schema_version, operations)`。不新增任何 API。
**理由**:鐵則「D1 為真相 + 單一寫入入口 + 樂觀鎖」已在 #2 測過;手動與 AI 走同一條路,行為一致、無第二套邏輯。

### schema_version 來源與衝突
**決定**:以當前載入的 `collection.schema_version` 當基準送出;409 時提示「表格已被更新,請重新整理」並 `getCollection` refetch,不重試。
**理由**:與 AI 接受提案的衝突處理一致(#3 6.5),避免蓋掉他人變更。

### 刪欄位二次確認 + 資料保留文案
**決定**:`remove_field` 前端以紅色 + 二次確認,文案沿用「既有資料保留但不再顯示,重建欄位可救回」。
**理由**:對齊 AI 提案卡(#3 6.4)與後端行為(remove_field 不動 records data),避免用戶誤以為資料被砍。

### 重排以簡單互動實作
**決定**:reorder 用每欄「上移/下移」或順序輸入,組出 `reorder_fields`(完整 id 排列)。
**理由**:最小可用;拖拉排序是純體感優化,YAGNI 到需要再加。

## Risks / Trade-offs

- **兩條入口並存(手動 + AI)改同一張表** → 靠既有樂觀鎖擋併發:先套用者贏,後者 409 refetch。無新風險。
- **前端組錯 operation 參數** → 後端 zod(`schemaOperationSchema` / `fieldInputSchema`)是最終防線,非法一律 400,不會寫入壞 schema。前端可先做同一套 zod 驗證改善體感。
- **UX 範圍克制** → 重排用簡單上下移,可能不夠順手;明確列為 Non-Goal 的進階互動,之後有需要再開 change。
