## 1. 前置與字串

- [x] 1.1 在 `shared/src/strings.ts` 加 schema 管理相關文案(管理欄位、加/刪/改名/重排、刪欄位二次確認文案、衝突提示、型別標籤等)
- [x] 1.2 確認 `web/src/lib/api.ts` 已有 `applyOperations` 與 `getCollection`(缺則補);複用 `shared` 的 `SchemaOperation` / `fieldInputSchema` 型別

## 2. 欄位管理 UI 元件

- [x] 2.1 新增 `web/src/components/FieldManager.tsx`:列出當前 schema 欄位,提供加/刪/改名/改設定/重排入口(對話框或側欄)
- [x] 2.2 加欄位表單:名稱 + 7 種型別;`select_single` 顯示 options 輸入
- [x] 2.3 改名 / 改設定:rename_field / update_field_meta(可改 required / options / currency / ai_hint;**UI 不提供改 type**)
- [x] 2.4 重排:每欄上移/下移(或順序輸入),組出 `reorder_fields` 完整 id 排列
- [x] 2.5 刪欄位:紅色 + 二次確認,文案「既有資料保留但不再顯示,重建欄位可救回」

## 3. 串接寫入(復用 #2 端點)

- [x] 3.1 每個操作組成 `SchemaOperation` 呼叫 `api.applyOperations(id, schema_version, operations)`(帶當前版本樂觀鎖)
- [x] 3.2 成功 → refetch collection schema(`getCollection`)→ 表格即時反映;更新本地 `schema_version`
- [x] 3.3 409 衝突 → 提示「表格已被更新,請重新整理」並 refetch schema,不套用該次變更
- [x] 3.4 400(非法參數,如缺 select options)→ 顯示後端錯誤訊息,不崩

## 4. 接入 CollectionView

- [x] 4.1 在 `/c/:slug` 表格檢視加「管理欄位」按鈕,開啟 `FieldManager`
- [x] 4.2 套用後透過既有 reload 流程刷新 collection + records(與 AI 提案接受同一 refetch)
- [x] 4.3 與 ChatPanel 的 AI 提案並存不衝突(共用 `applyOperations` 同一端點)

## 5. 驗收

- [x] 5.1 typecheck + web build 通過
- [x] 5.2 手動:加欄位即時出現、改名生效、改設定生效、重排生效、`schema_version` 遞增
- [x] 5.3 手動:刪欄位紅色二次確認;取消不變;確認後欄位消失但既有資料保留(重建欄位可見回)
- [x] 5.4 手動:兩分頁改同表製造 409 → 提示重整並 refetch
- [x] 5.5 手動:UI 無法改欄位 type(拒絕 change_field_type);後端 400 兜底
