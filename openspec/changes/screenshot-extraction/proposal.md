## Why

截圖抽取是這個產品在亞洲市場**最核心的差異化**(LINE/Email 對話 → 結構化資料,主流工具沒做)。有了資料層(#2)與 AI 基礎(#3)後,這個 change 把它接上:上傳截圖 → Claude vision **同步**抽取 → preview 卡片 → 用戶逐欄修改 → 確認後 commit 成 record。這裡落地兩條鐵則:**截圖抽取同步化**(上傳即 await,回來就是 `preview_ready`,無 pending/processing/polling)與 **AI 寫入必先 preview、確認才 commit**(抽取結果一律進 preview 卡片,用戶確認才寫 record)。抽取輸出 MUST 直接符合 §2.4 儲存格式,commit 時零轉換。

## What Changes

- **新增 D1 migration**(`0004_screenshots.sql`):`screenshot_jobs`(`image_url`、`status`、`extraction_result_json`、`record_id`、`error_message`),status 只有 3 態:`preview_ready` / `committed` / `cancelled`(同步抽取,無 pending/processing)。
- **新增 R2 上傳**:截圖存 `/screenshots/{workspace_id}/{job_id}.{ext}`,永遠以 signed URL 給前端。
- **新增同步截圖抽取**:`POST /api/v1/collections/:id/screenshots` 在 request 內直接 `await` Claude vision,回來即 `preview_ready` 結果(無需 polling)。
- **新增 `extract_from_screenshot` vision tool**:輸入 image + 目標 schema(每欄 name/type/ai_hint),輸出每欄 `{ value, confidence, source_hint }` + `suggested_new_fields` + `overall_notes`。輸出值 MUST 符合 §2.4(日期 `YYYY-MM-DD`、數字原始值、電話字串),含隱私指令(不重述敏感資料)。
- **新增 preview 卡片 + commit 流程**:preview 顯示每欄值 + 信心(高/中/低)+ 來源提示 + 建議新欄位;用戶**可逐欄編輯**後 commit;`POST /screenshots/:job_id/commit`(可帶編輯後的值)寫成 record(`source='screenshot'`、`source_metadata` 含 screenshot_url/confidence);`POST /cancel` 取消。
- **新增取得抽取結果**:`GET /api/v1/screenshots/:job_id`(重整用)。
- **記錄 token 用量**(供 #6),本 change 不限制。

## Capabilities

### New Capabilities
- `screenshot-extraction`: R2 上傳、同步 vision 抽取(`extract_from_screenshot` tool,輸出符合 §2.4 + confidence + source_hint + 建議新欄位)、`screenshot_jobs`(3 態)、抽取/取得結果 API。
- `screenshot-preview-commit`: preview 卡片 UI(信心顯示、來源提示、建議新欄位)、逐欄編輯、commit 成 record(`source='screenshot'`)、cancel。

### Modified Capabilities
<!-- 無 spec-level 變更於既有 capability。record 建立走 #2 既有寫入(source='screenshot'),source 欄位/badge 已由 #2 支援。 -->

## Non-goals(明確不做,留給後續 change)

- **多張截圖合併、文字貼上抽取**:Phase 2。本 change 僅單張截圖。
- **非同步抽取 / Queue / 背景處理**:明確不做,Phase 1 同步化(無 pending/processing 態、無 polling)。
- **建議新欄位的「自動套用」**:用戶可從 preview 把 `suggested_new_fields` 加入,但實際 schema 變更仍走 #3 的 propose→confirm 或 #2 的 `POST /operations`,本 change 不另開 schema 寫入路徑。
- **AI token / 截圖張數配額限制**:本 change 記錄 token 用量,但截圖張數上限與 token 上限的**檢查/阻擋**留給 `quota-limits`(#6)。
- **檔案上傳作為欄位型別(file/image)**:Phase 2。截圖只是抽取來源,不是欄位資料。

## Impact

- **新增程式碼**:`worker/src/routes/screenshots.ts`(同步抽取 + commit/cancel)、`worker/src/ai/extraction.ts`(vision 抽取邏輯 + prompt)、R2 上傳/ signed URL helper、`migrations/0004_screenshots.sql`、`shared/`(ScreenshotJob / extraction_result 型別 + zod)、`web/` 的截圖上傳區與 `/screenshots/:job_id` preview 頁。
- **依賴**:Cloudflare R2、Claude vision via AI Gateway(型號 Week 0 spike 定案);沿用 #1 scopedDb/auth、#2 records 寫入與 §2.4 編碼、#3 AI Gateway client。
- **環境設定**:R2 bucket + CORS、signed URL 設定。
- **跨切片鐵則落地**:同步抽取(3 態)、preview→commit、§2.4 零轉換、走 AI Gateway、多租戶(R2 路徑與 job 皆 workspace-scoped)。
