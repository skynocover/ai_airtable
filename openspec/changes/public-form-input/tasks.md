## 1. D1 migration

- [ ] 1.1 撰寫 `migrations/0005_inputs_submissions.sql`:`inputs`(`collection_id`、`type`、`enabled`、`settings_json`、`public_slug` UNIQUE)+ `idx_inputs_public_slug`
- [ ] 1.2 同檔加入 `form_submissions`(`input_id`、`collection_id`、`record_id`、`ip_country`、`user_agent`、`submitted_at`)
- [ ] 1.3 本地 apply 驗證

## 2. Input config 與 enable_public_form

- [ ] 2.1 `GET/POST /api/v1/collections/:id/inputs`、`PATCH/DELETE /api/v1/inputs/:id`(經 scopedDb)
- [ ] 2.2 public_slug 生成(唯一、隨機不可猜);form_settings 結構 + zod 於 shared/
- [ ] 2.3 `enable_public_form` tool 加入 #3 tool 集:建 input config、回 public_slug/public_url
- [ ] 2.4 測試:啟用/停用、限當前 workspace

## 3. Schema-driven 表單 renderer

- [ ] 3.1 依 `current_schema_json` 生成欄位(field type → 輸入元件、required、min/max/pattern 驗證)
- [ ] 3.2 `hidden_in_public` 欄位不顯示
- [ ] 3.3 提交值以 #2 §2.4 編碼/驗證(共用 shared/)

## 4. 公開頁 SSR

- [ ] 4.1 `GET /f/:public_slug`:Hono 手刻 HTML SSR(minimal JS),含表單、Turnstile widget、資料用途揭露、免費版 footer logo
- [ ] 4.2 `/f/:public_slug/thanks` 感謝頁(顯示自訂感謝訊息)
- [ ] 4.3 停用/不存在 slug 顯示一致訊息(不洩露)
- [ ] 4.4 行動端友善、專業外觀、LCP<1.5s(minimal JS)

## 5. 訪客提交(防 bot)

- [ ] 5.1 `POST /api/v1/public/forms/:public_slug/submit`(no-auth):slug → input → collection → workspace 嚴格反查
- [ ] 5.2 Turnstile 驗證(若啟用)+ per-IP rate limit(Rate Limiting binding / KV)
- [ ] 5.3 寫 record 走 #2(`source='form'`、source_metadata 含 submission_id/ip_country)、記 form_submissions
- [ ] 5.4 為 #6 配額預留 hook(達上限時阻擋並對訪客顯示「暫不接受新提交」)
- [ ] 5.5 測試:成功提交寫對 workspace、未過 Turnstile/超限被拒、client 無法指定 workspace

## 6. Email 通知

- [ ] 6.1 `worker/src/lib/email.ts`:Resend 通道(API key secret、寄件網域驗證),供提交通知 + #1 reset 信復用
- [ ] 6.2 新提交 → 1 分鐘內 email owner(提交摘要 + 後台連結)
- [ ] 6.3 email 失敗不回退提交(record 已寫),失敗記錄
- [ ] 6.4 測試:提交後 owner 收到通知;email 失敗不影響提交

## 7. 後台 input 設定 UI

- [ ] 7.1 collection 設定頁(`/c/:slug?view=settings`)的公開表單區:啟用、編輯設定、複製 public_url
- [ ] 7.2 顯示提交統計入口(連到後台 records,source=form badge)

## 8. 端對端驗證

- [ ] 8.1 User Story 2:chat 建詢價表 → 啟用公開表單 → 拿到 /f/slug → 訪客提交 → owner 收 email → 後台看到新提交
- [ ] 8.2 手機上表單專業、能順利提交;感謝頁正確
- [ ] 8.3 Turnstile + rate limit 擋 bot/洗版
- [ ] 8.4 多租戶:提交寫對 workspace、slug 不可跨租戶
- [ ] 8.5 §2.4:提交的數字/日期/電話格式正確,後台顯示一致
