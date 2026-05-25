## Context

本 change 是產品核心資料層,建在 #1 的 `scopedDb` / auth context 之上。它落地兩條最關鍵的鐵則:**D1 唯一真相**(`current_schema_json` snapshot,operations log 只 audit)與**儲存格式零轉換**(§2.4)。設計重點在於把這兩條做成「不容易被後續 change 破壞」的形狀,因為 #3(AI)、#4(截圖)、#5(表單)都會寫入這層。

## Goals / Non-Goals

**Goals:**
- collections / schema_operations / records 三張表 + 索引(migration 0002)
- 7 種 field types、SchemaOperation apply 到 snapshot、`POST /operations` + 樂觀鎖、audit log
- §2.4 儲存格式以 zod 在 `shared/` 集中驗證,寫入/讀取零轉換
- records CRUD + 列表(filter/sort/limit/offset)+ 軟刪除 + source
- 後台:collection 列表、`/c/:slug` 表格、inline edit、排序、CSV 匯出

**Non-Goals:**
- AI 提案流程(只做 `POST /operations` 端點,不做 propose tool/chat)
- 截圖/表單寫入(只做 `manual` source)
- 配額檢查、change_field_type、Phase 2 欄位型別、公開展示頁、undo UI

## Decisions

### schema 真相 = snapshot,operations 只 append audit

**決定**:`POST /operations` 在一個邏輯流程內做三件事:apply 到 `current_schema_json`、`schema_version +1`、append `schema_operations`。讀 schema 一律直接讀 `current_schema_json`,**永不 reduce operations**。`apply` 純函式放 `worker/src/lib/schema-ops.ts`:`(currentSchema, operation) => newSchema`,易測。

**替代方案**:event-sourcing 式讀取時重算 —— 否決(PLAN.md §2.3 明列為純負擔,無 DO/併發不需要)。

### 樂觀鎖

**決定**:`POST /operations` 帶 `schema_version`;在更新 SQL 用 `WHERE id=? AND schema_version=?`,affected rows = 0 即版本衝突,回 409 類錯誤要求前端 refetch。不自動 merge。

**理由**:多分頁/手動+未來 AI 併發改 schema 的低頻情況,擋掉最安全(PLAN 附錄 B)。

### §2.4 儲存格式集中於 shared/ zod

**決定**:每個 field type 對應一個 zod schema 與一個「value → data_json 表示」的編碼規則,集中在 `shared/`。寫入(manual / 未來 AI / 截圖 / 表單)都過同一套,確保零轉換且各 client 一致。sparse 規則(空值不存 key)也在此統一。

**替代方案**:各 route 各自驗 —— 否決,會在不同寫入路徑漂移,違反「AI 輸出=儲存=顯示」。

### number 查詢與排序

**決定**:`created_at` 是真實欄位有索引,時間範圍查走索引;依 `data_json` 內欄位排序/比較用 `json_extract(data_json,'$.fld_x')`。因 number 存 JSON number,SQLite 數值比較正確。資料量小可全掃,不為 Phase 1 加額外索引。

### 殘留 key(orphan data)處理

**決定**:`remove_field` 不清 records 的 `data_json`(資料保留)。但**所有顯示/匯出一律以 `current_schema_json` 為準**,殘留 key 不渲染、不匯出。此規則寫進 records / admin-table-view spec。

## Risks / Trade-offs

- **多寫入路徑讓 §2.4 格式漂移** → 集中 zod 編碼於 `shared/`,所有路徑共用;測試覆蓋每種型別的存法。
- **跨租戶外洩** → collections/records 皆 workspace-scoped,一律過 `scopedDb`;測試含「ws_A 看不到 ws_B」。
- **殘留 key 造成用戶誤解資料遺失** → 顯示層忽略殘留 key;刪欄位的提示(在 #3 AI 卡片)說明資料保留可救回。
- **樂觀鎖在無 AI 時看似多餘** → 仍保留,因為多分頁手動操作即可觸發,且 #3 之後 AI 也走同入口。
- **CSV 中文編碼 / Excel 開啟亂碼** → 匯出加 UTF-8 BOM,確認 Excel 正確顯示繁中。

## Migration Plan

- `migrations/0002_collections_records.sql`:collections / schema_operations / records + PLAN.md §5.3 索引(idx_records_collection、idx_records_workspace、idx_schema_ops_collection)。
- 本地 apply 驗證後再 remote。
- 回退:移除 migration(本 change 無既有資料依賴)。

## Open Questions

- records 列表 filter/sort query param 的確切格式(PLAN 附錄 B 待定)→ 本 change 定一個簡單格式並寫進 records spec 的 scenario,後續 #3 `query_records` tool 對齊同格式。
- slug 保留字完整清單 → 至少含 `api`、`f`、`auth`、`d`、`t`;實作時定案常數。
