## Context

截圖抽取是產品核心賭注(Week 0 spike 的主要驗證對象)。設計上沿用前面建立的不變量:抽取只是「產生 record 的候選值」,真正寫入走 #2 record 建立 + §2.4 編碼;schema 變更(加建議欄位)走既有 propose/operations。本 change 自己只負責「上傳 → vision → preview → commit」這條同步管線。

## Goals / Non-Goals

**Goals:**
- R2 上傳(workspace-scoped 路徑 + signed URL)
- 同步 vision 抽取(3 態,無 polling/Queue)
- `extract_from_screenshot` tool:輸出符合 §2.4 + confidence + source_hint + 建議欄位 + 隱私指令
- preview 卡片(信心/來源/建議)+ 逐欄編輯 + commit(source='screenshot')+ cancel

**Non-Goals:**
- 多張合併、文字貼上(Phase 2);非同步/Queue;配額限制(#6);file/image 欄位型別

## Decisions

### 同步抽取(在 request 內 await)

**決定**:`POST /screenshots` 在 Worker request 內直接 `await` vision 呼叫(經 AI Gateway),回來即 `preview_ready`。不引入 pending/processing 態、不 polling、不 Queue。

**理由**:PLAN v1.1 明確去除非同步基礎設施;awaiting fetch subrequest 不佔 Worker CPU,15s 內可接受(§8.1)。3 態讓狀態機極簡。

**替代方案**:Queue + 背景處理 + polling —— 否決,Phase 1 無併發/規模需求,純負擔。

### 抽取輸出 = §2.4 儲存格式,commit 零轉換

**決定**:vision tool 的輸出格式指令直接寫死 §2.4(日期 `YYYY-MM-DD`、數字原始值、電話字串、select 須為 options)。preview 顯示的值 = 編輯後的值 = commit 寫入的值,中間無 parsing 層。沿用 #2 在 `shared/` 的 §2.4 編碼/驗證。

**理由**:鐵則「AI 輸出=儲存=顯示」;避免 confidence 高但格式錯的值還要二次轉換。

### confidence 是軟訊號,人工 preview 是安全網

**決定**:confidence(高/中/低)只用於 UI 排序/提示,**不**用於自動 commit 或自動採信。真正的安全是強制人工 preview + 逐欄可編輯。低信心/留空欄位明確標示需補。

**理由**:LLM 自報 confidence 校準差(前述 review 結論);不讓 UI 暗示「高信心可不看」。

### 建議新欄位不另開 schema 寫入

**決定**:`suggested_new_fields` 只是建議;用戶按「加入」時走 #3 propose→confirm 或 #2 `POST /operations`。截圖端點絕不直接改 `current_schema_json`。

**理由**:單一 schema 寫入入口 + 樂觀鎖;避免截圖流程繞過 propose 鐵則。

### 抽取品質訊號(輕量埋點)

**決定**:commit 時記錄「用戶改了幾個欄位 / 哪些欄位被改」作為抽取品質訊號(對照核心賭注)。低成本,跑 SQL 即可看趨勢,不建 dashboard。

## Risks / Trade-offs

- **抽取命中率不足 → 用戶信任崩潰** → 強制 preview + 顯示信心 + 逐欄編輯;Week 0 spike 先驗命中率,過關才開工。
- **同步抽取拖長 request** → 目標 <15s(§8.1);AI 端點明確 loading 狀態,不看起來卡住;失敗回友善錯誤。
- **vision 型號成本** → 型號 Week 0 spike 定案;token 用量記錄供 #6 回推配額。
- **截圖隱私疑慮** → prompt 含隱私指令(不重述敏感資料)、signed URL、可刪除、不訓練聲明。
- **繞過 preview 直接 commit** → commit 一律經 `POST /commit`,且 record 寫入走 #2;無自動 commit 路徑。
- **跨租戶**:R2 路徑與 job 皆 workspace-scoped,commit 經 scopedDb。

## Migration Plan

- `migrations/0004_screenshots.sql`:`screenshot_jobs`(3 態)。
- 設定 R2 bucket + CORS + signed URL。
- vision 型號與 prompt 依 Week 0 spike 結果配置。
- 回退:移除 migration 與 screenshot route(不影響前面 change)。

## Open Questions

- vision 型號(Sonnet vs 便宜款)最終取捨 → Week 0 spike 命中率 + 成本回推後定案(也影響 #6 配額數字)。
- preview 卡片在 chat 內呈現 vs 獨立 `/screenshots/:job_id` 頁 → 兩者皆支援,主流程用 chat 卡片(行動端友善),獨立頁供重整/直連。
- signed URL 有效期長度(實作定,平衡安全與重整可用性)。
