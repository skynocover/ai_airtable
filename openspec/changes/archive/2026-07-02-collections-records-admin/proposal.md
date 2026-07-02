## Why

有了地基(auth + workspace + scopedDb)後,接著要做產品的核心資料層:**Collection(schema)與 Records(資料),以及讓使用者能手動看/改資料的後台表格**。這一層必須先「不靠 AI 就能完整跑對」—— Collection 能建、schema 能改、record 能 CRUD、表格能看能編能匯出。如此 AI(change #3)只是這層之上的「另一個 client」,出問題時能清楚分辨是資料層錯還是 AI 錯。這也是把 PLAN.md 的兩條硬規則落地的地方:**D1 唯一真相**(`current_schema_json` 為準,operations log 只是 audit)與**儲存格式零轉換**(§2.4)。

## What Changes

- **新增 D1 migration**(`0002_collections_records.sql`):`collections`(含 `current_schema_json`、`schema_version`、軟刪除)、`schema_operations`(audit log)、`records`(`data_json`、`source`、軟刪除),含 PLAN.md §5.3 定義的索引。
- **新增 Collection CRUD**:建立、列表、取得、改名/icon、軟刪除;workspace 內唯一 slug 與保留字處理。
- **新增 7 種 field types 與 schema operation 機制**:`add_field`/`remove_field`/`rename_field`/`update_field_meta`/`reorder_fields` apply 到 `current_schema_json` snapshot;每次變動寫 `schema_operations` audit log 並 `schema_version +1`;**讀取時不 reduce operations 重算**。
- **新增 `POST /api/v1/collections/:id/operations`**:schema 寫入的**唯一入口**,帶 `schema_version` 樂觀鎖(版本不符則拒絕並提示 refetch)。本 change 由「手動 UI 操作」觸發;AI 提案流程(`propose_schema_operations`)留待 change #3。
- **新增欄位值儲存格式規則(§2.4)**:`data_json` sparse(空值不存 key)、number 存 JSON number、date 存 `YYYY-MM-DD`、phone 永遠存字串、select_single 存 label;金額 = number + `currency` 顯示設定(無獨立型別)。寫入/讀取零轉換。
- **新增 Records CRUD**:手動新增、inline edit(PATCH)、軟刪除、來源 `source`(`manual` 等)與來源 badge;依 field type 驗證值。
- **新增後台 Admin 表格檢視**:Collection 列表、單一 collection 的表格、inline edit、排序、CSV 匯出。
- **新增 records 列表 API**:支援 filter / sort / limit / offset query params。

## Capabilities

### New Capabilities
- `collections`: Collection 資料模型、CRUD、slug 生成(workspace 內唯一 + 保留字)、軟刪除、`schema_version`。
- `schema-operations`: 7 種 field types 定義與型別專屬 config、SchemaOperation 五種操作、apply 到 `current_schema_json` snapshot、`schema_operations` audit log、`POST /operations` 唯一寫入入口 + `schema_version` 樂觀鎖、欄位值儲存格式規則(§2.4)。
- `records`: Record 資料模型、`data_json` sparse 儲存、依 field type 的值驗證、CRUD、軟刪除、`source` 來源、列表 API(filter/sort/limit/offset)。
- `admin-table-view`: 前端 Collection 列表、表格檢視、inline edit、排序、CSV 匯出、來源 badge、空狀態引導。

### Modified Capabilities
<!-- 無。本 change 全為新增能力。 -->

## Non-goals(明確不做,留給後續 change)

- **AI / Chat / propose_schema_operations**:`POST /operations` 端點與 apply 邏輯在本 change,但「AI 產生提案」的 tool 與 chat 介面留給 `ai-chat-tools`(#3)。本 change 的 schema 操作由手動 UI 觸發。
- **截圖 / 公開表單寫入 records**:`source` 欄位支援 `screenshot`/`form` 值,但實際寫入流程分別留給 `screenshot-extraction`(#4)、`public-form-input`(#5)。本 change 只做 `manual` 來源。
- **配額檢查**:新增 record / collection 時**不檢查任何上限**,留給 `quota-limits`(#6)。
- **change_field_type**:Phase 1 不支援改欄位型別(牽涉資料遷移),用「刪欄位重建」。
- **select_multi / datetime / url / file / image** 欄位型別:Phase 2+。
- **公開展示頁 / gallery / list view**:Phase 2。本 change 只有後台 table view。
- **undo UI**:operations log 已記錄(支援未來 undo),但本 change 不做 undo 介面。

## Impact

- **新增程式碼**:`worker/src/routes/collections.ts`、`records.ts`、`worker/src/lib/schema-ops.ts`(apply 到 snapshot)、`shared/`(Field / FieldType / SchemaOperation / Collection / Record 型別 + zod + 儲存格式驗證)、`migrations/0002_collections_records.sql`、`web/` 的 collection 列表頁與 `/c/:slug` 表格頁。
- **依賴**:沿用 #1 的 `scopedDb`、auth context、Hono、zod、shadcn/ui(table 元件)。
- **跨切片鐵則落地**:D1 唯一真相(snapshot)、儲存格式零轉換、軟刪除、多租戶(collections/records 皆 workspace-scoped,一律過 `scopedDb`)。
- **後續 change 的地基**:#3 AI tools、#4 截圖、#5 表單都寫入本 change 定義的 collections/records 與 `POST /operations`。
