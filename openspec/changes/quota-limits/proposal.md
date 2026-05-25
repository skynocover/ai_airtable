## Why

最後一個 change,cross-cutting 收口。前面 #3/#4 已把 AI/vision 的 token 用量「記錄但不限制」,#5 為表單提交預留了配額 hook。本 change 把這些**煞車裝上**:Phase 1 只有免費版,所有上限的目的是**成本/濫用煞車,不是付費方案** —— 零收入階段,防止單一用戶(或寫壞的 script)燒爆 AI 帳單或塞爆儲存。最重要的是 **AI token 與截圖的硬上限,達標即擋**。本 change 放最後,因為它要等所有「消耗型入口」(records / 截圖 / 表單 / AI)都在了,才能一次接上計數與阻擋。

## What Changes

- **新增配額計數**:在各消耗動作累加 workspace counters —— records 新增(累計,不重設)、截圖抽取、表單提交、AI token(#3/#4 已寫入 `ai_tokens_used_this_month`,本 change 確立其為計數真相)。
- **新增硬上限檢查與阻擋**:免費版上限(Collections 3、Records 500 累計、截圖 20/月、表單提交 100/月、AI token 月上限)。達上限即擋,**AI token 與截圖為真實硬上限**(零收入唯一防燒錢機制)。
- **新增 token 用量的雙態保護**:token 用量呼叫後才知,故月上限為 best-effort(可超出一個呼叫);另對 vision 設「單次 input/output token 上限」當第二道閘。
- **新增各入口的達標處理**:
  - 截圖 / AI:阻擋並顯示「已達本月使用上限」(Phase 1 無升級路徑,純提示)
  - 表單提交:阻擋,對訪客顯示「此表單暫時不接受新提交」並通知 owner(接 #5 的 hook)
  - Records:阻擋新增(chat / 表單 / 截圖 / 手動皆擋)
- **新增每月重設**:screenshots / form submissions / ai_tokens 每月 1 號重設(Cron Trigger);records 累計不重設(刪除才降)。
- **新增用量檢視**:`GET /api/v1/workspace/usage` + 前端 `/usage` 頁(各配額剩餘);快到上限時前端提示。

## Capabilities

### New Capabilities
- `quota-tracking`: 各消耗動作的 counter 累加、records 累計 vs 月度重設的區別、每月 1 號 Cron 重設、`GET /api/v1/workspace/usage`。
- `quota-enforcement`: 免費版硬上限定義與檢查、達標阻擋(各入口)、AI token + 截圖硬上限、vision 單次 token 上限、訪客/owner 提示、`/usage` 前端頁與「快到上限」提示。

### Modified Capabilities
<!-- 無 spec-level 行為「變更」於既有 capability;本 change 在既有寫入入口「加上」配額檢查(ADDED 行為),不改既有端點契約。 -->

## Non-goals(明確不做)

- **付費 / Pro / Stripe / 升級流程 / 定價數字**:Phase 2。本 change 不做任何 plan 分支(`plan` 仍預設 free,不啟用 Pro 額度)。達上限為純提示,無升級路徑。
- **自製 analytics dashboard**:不做。用量看 `GET /usage` + AI Gateway log + 一條 SQL(PLAN.md §8.3)。
- **配額具體數字的最終定案**:免費上限數字(尤其截圖/token)需 Week 0 spike 拿到單張成本 C 後回推(見 PLAN.md §7);本 change 實作「可設定的上限 + 阻擋邏輯」,數字以保守預設,上線後依 AI Gateway log 調整。
- **per-IP rate limit**:防 bot 的 rate limit 屬 #5(已做);本 change 是「每月用量配額」,不同關注點。

## Impact

- **新增程式碼**:`worker/src/lib/quota.ts`(計數 + 檢查,集中邏輯)、各寫入入口(records / screenshots / forms / chat·ai)插入配額檢查、`GET /api/v1/workspace/usage`、Cron Trigger handler(每月重設)、`web/` `/usage` 頁 + 「快到上限」提示。
- **依賴**:沿用 #1 的 `workspaces` quota counter 欄位與 scopedDb;Cloudflare Cron Trigger(非 Queue);#3/#4 的 token 用量寫入、#5 的提交 hook。
- **設定**:`wrangler.toml` Cron Trigger(每月 1 號);可設定的上限常數(保守預設,待 Week 0 回推)。
- **跨切片鐵則落地**:Phase 1 免費版、硬上限達標即擋、配額為成本煞車非付費方案;計數/檢查經 scopedDb 限當前 workspace。
