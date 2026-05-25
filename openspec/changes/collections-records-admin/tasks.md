## 1. D1 migration

- [ ] 1.1 撰寫 `migrations/0002_collections_records.sql`:`collections`(`current_schema_json`、`schema_version` DEFAULT 1、`deleted_at`、`UNIQUE(workspace_id, slug)`)
- [ ] 1.2 同檔加入 `schema_operations`(`operation_json`、`applied_by`、`user_id`、`reason`、`applied_at`)+ `idx_schema_ops_collection`
- [ ] 1.3 同檔加入 `records`(`collection_id`、`workspace_id`、`data_json`、`source`、`source_metadata_json`、`deleted_at`)+ `idx_records_collection`、`idx_records_workspace`
- [ ] 1.4 本地 apply 並驗證表/索引正確

## 2. shared/ 型別與 §2.4 儲存格式

- [ ] 2.1 在 `shared/` 定義 `FieldType`(7 種)、`Field`、`SchemaOperation`(5 種)、`Collection`、`Record` 型別 + zod
- [ ] 2.2 實作每個 field type 的值驗證 zod schema 與「value → data_json 表示」編碼規則(number 為 JSON number、date `YYYY-MM-DD`、phone 字串、select label,金額=number+currency)
- [ ] 2.3 實作 sparse 規則:空值不產生 key;select 非法值留空
- [ ] 2.4 撰寫單元測試覆蓋每種型別的存法與 sparse(對應 schema-operations §2.4 scenarios)

## 3. schema operations 引擎

- [ ] 3.1 在 `worker/src/lib/schema-ops.ts` 實作純函式 `applyOperation(currentSchema, op) => newSchema`,涵蓋 add/remove/rename/update_field_meta/reorder
- [ ] 3.2 驗證:拒絕未知 field type、拒絕 change_field_type、select 需 options
- [ ] 3.3 撰寫單元測試:每種 operation 正確改 snapshot;remove_field 不動 records 資料
- [ ] 3.4 確認讀 schema 直接讀 `current_schema_json`,程式中無「reduce operations 重算」路徑

## 4. Collection API

- [ ] 4.1 `POST /api/v1/collections`:建立 + 初始化 `current_schema_json` + slug 生成(workspace 內唯一 + 保留字排除)
- [ ] 4.2 `GET /api/v1/collections`(列表,未刪除)、`GET /api/v1/collections/:id`(含 schema)
- [ ] 4.3 `GET /api/v1/collections/:id/schema`、`GET /api/v1/collections/:id/operations`(audit 歷史)
- [ ] 4.4 `PATCH /api/v1/collections/:id`(name/icon/description)、`DELETE`(軟刪除)
- [ ] 4.5 全部經 `scopedDb`;測試:他人 collection 回 404、列表不跨 workspace

## 5. POST /operations(schema 寫入唯一入口)

- [ ] 5.1 `POST /api/v1/collections/:id/operations`:帶 `schema_version` 樂觀鎖(`WHERE schema_version=?`,affected=0 回 409)
- [ ] 5.2 成功流程:apply 到 snapshot + `schema_version +1` + 每個 op 寫 `schema_operations`(`applied_by='user'`)
- [ ] 5.3 測試:版本相符成功、版本衝突被拒且 snapshot 不變、audit log 正確

## 6. Records API

- [ ] 6.1 `POST /api/v1/collections/:id/records`:依 schema 驗證 + §2.4 編碼 + `source='manual'` + 綁 workspace
- [ ] 6.2 `GET /api/v1/records/:id`、`GET /api/v1/collections/:id/records`(filter/sort/limit/offset,未刪除,回 total)
- [ ] 6.3 排序用 `json_extract`;number 欄位數值序;定義並文件化 filter/sort param 格式
- [ ] 6.4 `PATCH /api/v1/records/:id`(inline edit,維持 sparse)、`DELETE`(軟刪除)
- [ ] 6.5 測試:列表不跨 workspace、軟刪除不出現在列表、number 排序為數值

## 7. CSV 匯出

- [ ] 7.1 `POST /api/v1/collections/:id/records/export`:依 `current_schema_json` 欄位、未刪除、§2.4 原始值
- [ ] 7.2 殘留(已刪欄位)key 不匯出;加 UTF-8 BOM 確保 Excel 繁中正確
- [ ] 7.3 測試:匯出範圍限當前 collection/workspace

## 8. 後台前端

- [ ] 8.1 `/home` collection 列表 + 空狀態引導(繁中)
- [ ] 8.2 `/c/:slug?view=records` 表格:欄位依 `current_schema_json` order、殘留 key 不顯示、來源 badge
- [ ] 8.3 金額欄位以 `Intl.NumberFormat('zh-TW',{style:'currency',currency})` 顯示
- [ ] 8.4 inline edit:依 field type 提供輸入(文字/數字/日期/select 下拉),PATCH 更新
- [ ] 8.5 欄位標題排序;CSV 匯出按鈕
- [ ] 8.6 手動新增 record 的 UI(依 schema 生成輸入)

## 9. 端對端驗證

- [ ] 9.1 手動走完:建 collection → 手動 POST /operations 加/改/刪欄位 → schema_version 遞增、audit log 有紀錄
- [ ] 9.2 手動走完:新增 record → 表格看到 → inline edit → 排序 → 軟刪除 → CSV 匯出(繁中、金額為數字)
- [ ] 9.3 驗證版本衝突:兩處用過時 schema_version 提交,後者被拒並提示 refetch
- [ ] 9.4 多租戶隔離:ws_A 看不到/改不到 ws_B 的 collection 與 records;所有存取經 scopedDb
- [ ] 9.5 §2.4 格式驗證:number 存 JSON number、phone 保留前導 0、空值不存 key、select 非法值留空
