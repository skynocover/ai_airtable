## 1. D1 migration

- [ ] 1.1 撰寫 `migrations/0004_screenshots.sql`:`screenshot_jobs`(`collection_id`、`workspace_id`、`user_id`、`image_url`、`status`、`extraction_result_json`、`record_id`、`error_message`、`created_at`、`committed_at`)
- [ ] 1.2 status 限 3 態:`preview_ready`/`committed`/`cancelled`(無 pending/processing);本地 apply 驗證

## 2. R2 上傳

- [ ] 2.1 R2 bucket binding + CORS 設定
- [ ] 2.2 上傳 helper:存 `/screenshots/{workspace_id}/{job_id}.{ext}`,workspace_id 由 context 取得
- [ ] 2.3 signed URL helper(限時),前端只拿 signed URL
- [ ] 2.4 測試:路徑含當前 workspace、無永久公開直連

## 3. Vision 抽取

- [ ] 3.1 `worker/src/ai/extraction.ts`:`extract_from_screenshot` tool schema(image + 目標 schema)+ 輸出結構(value/confidence/source_hint + suggested_new_fields + overall_notes)
- [ ] 3.2 prompt:任務說明 + 目標 schema(name/type/ai_hint)+ §2.4 格式指令 + 隱私指令 + 不確定留空
- [ ] 3.3 經 #3 的 AI Gateway client 呼叫 Claude vision(型號依 Week 0 spike);擷取 token 用量記錄(不限制)
- [ ] 3.4 抽取輸出以 #2 的 §2.4 編碼/驗證(共用 shared/),確保 commit 零轉換
- [ ] 3.5 在 `shared/` 定義 ScreenshotJob / extraction_result 型別 + zod

## 4. 抽取 API(同步)

- [ ] 4.1 `POST /api/v1/collections/:id/screenshots`:上傳 → R2 → await vision → 建 job(`preview_ready`)+ 回結果(無 polling)
- [ ] 4.2 抽取失敗:記 `error_message`、回友善繁中錯誤、不寫 record
- [ ] 4.3 `GET /api/v1/screenshots/:job_id`:取回結果(重整用,經 scopedDb)
- [ ] 4.4 測試:上傳即 preview_ready、失敗友善處理、限當前 workspace

## 5. Preview 卡片與編輯(前端)

- [ ] 5.1 preview 卡片:縮圖 + 每欄值 + 信心(高/中/低)+ 來源提示 + overall_notes
- [ ] 5.2 逐欄編輯:依 field type 提供輸入;低信心/留空欄位明確標示需補
- [ ] 5.3 建議新欄位區:顯示 name/type/原文依據 + 「加入 / 略過」
- [ ] 5.4 行動端友善設計(截圖上傳是行動端常用,§6.1)

## 6. Commit / Cancel

- [ ] 6.1 `POST /screenshots/:job_id/commit`(可帶編輯後值):走 #2 record 建立(`source='screenshot'`、source_metadata 含 screenshot_url/confidence)、job→`committed`、記 record_id
- [ ] 6.2 `POST /screenshots/:job_id/cancel`:job→`cancelled`,不寫 record
- [ ] 6.3 commit 時記錄「用戶改了幾個/哪些欄位」作為抽取品質訊號
- [ ] 6.4 建議新欄位「加入」走 #3 propose 或 #2 POST /operations,不由截圖端點改 schema
- [ ] 6.5 測試:commit 出現於後台(截圖 badge)、cancel 不寫、限當前 workspace

## 7. 上傳入口(前端)

- [ ] 7.1 collection 頁/chat 的截圖上傳區(拖放 + 點選),空狀態引導「拖一張截圖到這裡」
- [ ] 7.2 上傳中/抽取中明確 loading 狀態(不看起來卡住)

## 8. 端對端驗證

- [ ] 8.1 上傳清楚的 LINE/Email 截圖 → 抽出 ≥60% 欄位正確值(對照 Phase 1 接受標準)
- [ ] 8.2 逐欄編輯(修正預算)→ commit → 後台表格出現該筆且為編輯後值
- [ ] 8.3 cancel 流程不寫 record;抽取失敗顯示友善錯誤
- [ ] 8.4 §2.4 驗證:金額為數字、日期 YYYY-MM-DD、電話保留前導 0,commit 零轉換
- [ ] 8.5 多租戶:R2 路徑/job/commit 不跨 workspace;token 用量被記錄(供 #6)
