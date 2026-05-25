## Context

cross-cutting 收口,放最後。前面 change 已把「消耗」發生在各入口(records / 截圖 / 表單 / AI token),本 change 集中處理「計數 + 檢查 + 阻擋 + 重設 + 檢視」。核心心態:Phase 1 零收入,所有上限是**成本/濫用煞車**,寧緊勿鬆,上線後依 AI Gateway 真實 log 放寬。

## Goals / Non-Goals

**Goals:**
- 集中的配額計數與檢查邏輯(`lib/quota.ts`),各入口插入
- AI token + 截圖硬上限(達標即擋)+ vision 單次上限
- records 累計 vs 月度重設(Cron Trigger 每月 1 號)
- `GET /api/v1/workspace/usage` + `/usage` 頁 + 接近上限提示

**Non-Goals:**
- Pro/Stripe/定價/升級流程/plan 分支(Phase 2)
- 自製 analytics dashboard;配額數字最終定案(待 Week 0 回推)
- per-IP rate limit(屬 #5,防 bot 不同於月配額)

## Decisions

### 集中於 lib/quota.ts,各入口呼叫

**決定**:計數與檢查集中一個模組:`checkQuota(workspace, kind)`(寫入前擋)、`incrementUsage(workspace, kind, amount)`(成功後累加)。各入口(records POST、screenshot commit、form submit、AI client)呼叫同一套,避免邏輯分散。

**理由**:配額是 cross-cutting,分散到各 route 會漂移、難一致調整上限。

### AI token 是 best-effort 硬上限 + 單次閘

**決定**:token 用量呼叫後才知,故「月上限」在呼叫前檢查當前累計(達標即擋下一次),允許「達標前最後一次」超出。另加 vision「單次 token 上限」防單張截圖爆量。兩道閘合起來把最壞情況限制在「上限 + 一次呼叫」。

**理由**:這是零收入唯一防燒錢機制(PLAN.md §7);完美精準不可能(用量後知),但雙閘足以防災難。

### records 累計用現存筆數反映

**決定**:`records_used` 反映現存(未軟刪)筆數:新增 +1、軟刪 -1。月度計數(截圖/表單/token)只增,每月 1 號 Cron 歸零。

### 重設用 Cron Trigger(非 Queue)

**決定**:Cloudflare Cron Trigger 每月 1 號跑重設 + 更新 `quota_reset_at`。PLAN 附錄 B 已指定 Cron Trigger（軟刪除實刪也走 Cron,可同一 handler 或分開）。

### 配額數字可設定、保守預設

**決定**:上限為常數(可設定),保守預設;真正數字待 Week 0 拿到單張截圖成本 C 後回推「免費用戶用滿最壞花多少」。本 change 交付「機制」,數字是設定值。

## Risks / Trade-offs

- **token 上限超出一個呼叫** → 接受(用量後知);vision 單次閘限制最壞單次;保守月上限留 buffer。
- **計數競爭(無 DO,並發 +1)** → 低規模可接受;records/截圖用條件寫入(達上限不再 +)收斂;硬上限是防災難非精算。
- **Cron 沒跑/跑失敗 → 計數不重設** → Cron handler 冪等(依 `quota_reset_at` 判斷該月是否已重設),失敗可重跑。
- **上限設太緊擋到正常用戶** → 數字可設定,上線後依 log 放寬;`/usage` 讓用戶看得到剩餘。
- **跨租戶**:計數/檢查經 scopedDb,只依當前 workspace。

## Migration Plan

- 無新表(counter 欄位已在 #1 的 `workspaces`)。
- `wrangler.toml` 加 Cron Trigger(每月 1 號)。
- 設定上限常數(保守預設)。
- 回退:移除配額檢查呼叫與 Cron;counter 欄位保留無害。

## Open Questions

- 各配額數字最終值 → Week 0 成本回推後定(PLAN.md §7 公式);本 change 先用保守預設。
- 軟刪除 30 天實刪的 Cron 是否與配額重設共用 handler → 可共用一個排程 Worker entry,分別邏輯(本 change 聚焦配額重設,實刪 Cron 可一併設定)。
- 「快到上限」的門檻百分比(例如 80%/90%)→ 實作定。
