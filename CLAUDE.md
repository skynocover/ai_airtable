# AI 資料工作台 — 開發指南(CLAUDE.md)

> 這個檔每個 session 都會自動載入。完整產品規格的**唯一真相**是 `PLAN.md`(讀 §5 Phase 1 詳細規格)。
> 這裡只放:建構順序、目前進度、跨切片鐵則、怎麼實作。

---

## 怎麼實作(給未來的 Claude Code)

- 規格驅動:每個 feature 是 `openspec/changes/` 下的一個 change,內含 `proposal.md` / `specs/` / `tasks.md`。
- 實作一個 change = 讀它的 `tasks.md`,逐項做、逐項打勾。**不要自己發明範圍**,範圍在 spec 裡。
- **一個 change = 一個全新 session。** 做完 → 驗收 → archive → 開新 session 做下一個。不要在一個 session 連做多個。
- 有疑問先讀 `PLAN.md`;PLAN 與 spec 衝突時以 spec 為準,並回報衝突。

## 建構順序(依賴關係,照順序做)

狀態圖例:📋 規格已生成(proposal/design/specs/tasks 齊全,尚未寫 code) · 🔨 實作中 · ✅ 實作完成並 archive

| # | change | 依賴 | 狀態 |
|---|---|---|---|
| 1 | `foundation-auth-workspace` | — | ✅ 已 archive(2026-05-26) |
| 2 | `collections-records-admin` | 1 | 🔨 實作完成(待驗收 → archive) |
| 3 | `ai-chat-tools` | 2 | 📋 規格已生成 |
| 4 | `screenshot-extraction` | 2 | 📋 規格已生成 |
| 5 | `public-form-input` | 2 | 📋 規格已生成 |
| 6 | `quota-limits` | 2,4,5 | 📋 規格已生成 |

**👉 下一個要做的:先驗收並 archive #2(`/opsx:archive collections-records-admin`),接著做 #3 `ai-chat-tools` 的實作。實作指令:開新 session 說「實作 openspec 的 ai-chat-tools change」。**

> 每完成一個 change,把它的狀態改成 ✅,並更新上面這行「下一個」。
> ⚠️ **動工前先過 Week 0 spike**(截圖命中率 + 單張成本 C、Better Auth on Workers+D1、Claude 不訓練確認、Email 送達率)。spike 不是 openspec change,在 openspec 外面先做。見 `PLAN.md` §12.1。

## 跨切片鐵則(每個 change 都必須遵守)

1. **多租戶隔離是硬規則**:單一共用 D1,所有資料表有 `workspace_id`。所有 D1 存取一律過 `scopedDb(workspace_id)` wrapper —— 讓「不帶 workspace_id 查資料」在型別上不可能。漏一個 `WHERE workspace_id = ?` = 跨租戶外洩,自己測抓不到(只有一個 workspace),第二個用戶就爆。(`PLAN.md` §3.3)
2. **AI 寫入必先 preview、用戶確認才 commit**:schema 改動走 `propose_schema_operations`(只提案不寫 DB)→ 用戶接受/拒絕 → `POST /collections/:id/operations`(帶 `schema_version` 樂觀鎖)。`create_collection` 例外,直接建立。(`PLAN.md` §2.3)
3. **AI 互動一律 tool calling / structured output**,不 parse 自由文字。所有 LLM 呼叫走 Cloudflare AI Gateway。(`PLAN.md` §3.4)
4. **D1 是唯一真相**:`collections.current_schema_json` 是 schema 真相,`schema_operations` 只是 audit log,**不要在讀取時 reduce operations 重算**。(`PLAN.md` §2.3)
5. **儲存格式 = AI 輸出格式 = 顯示值,中間零轉換**:7 種 field types,金額 = `number` + `currency` 顯示設定(無獨立 currency 型別)。(`PLAN.md` §2.4)
6. **Phase 1 只有免費版**:配額上限是「成本/濫用煞車」,不是付費方案。AI token + 截圖設**硬上限,達標即擋**。Pro / Stripe / 定價 → Phase 2。(`PLAN.md` §7)
7. **軟刪除**:刪除一律 soft delete(`deleted_at`),不實刪。
8. **Phase 1 範圍外的功能不要做**,即使技術上很容易(見 `PLAN.md` §5.1 ❌ 清單、§4 後續階段)。

## 技術棧

Cloudflare Workers(單一 worker:`/api`、`/f` SSR、`/auth`)+ Hono · D1(SQLite,唯一真相)· R2(截圖)· KV(slug 反查/cache)· AI Gateway → Claude Sonnet(含 vision)· React + Vite SPA + Tailwind + shadcn/ui · Better Auth(email + Google)· Turnstile · 繁體中文(無 i18n 框架,字串常數檔)。

**Phase 1 不用**:Durable Objects、Queues、Workflows、Vectorize、Workers AI、多 LLM provider、Stripe。需要時再加。

## 程式碼結構

見 `PLAN.md` §9。重點:`web/`(SPA)、`worker/`(單一 Worker)、`shared/`(共用型別+zod,先別拆 monorepo)、`migrations/`(D1)。
