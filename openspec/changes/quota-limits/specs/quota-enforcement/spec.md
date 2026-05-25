## ADDED Requirements

### Requirement: 免費版硬上限定義

系統 SHALL 定義免費版上限(可設定常數,保守預設,待 Week 0 成本回推):Collections、Records(累計)、截圖抽取(月)、表單提交(月)、AI token(月)。這些上限的性質是**成本/濫用煞車,非付費方案**;本 change MUST NOT 引入任何 Pro 額度或 plan 分支。

#### Scenario: 上限可設定
- **WHEN** 設定免費版上限
- **THEN** 以常數定義、保守預設,可依 AI Gateway 真實 log 調整,無 Pro 分支

### Requirement: AI token 與截圖硬上限(達標即擋)

系統 SHALL 對 `ai_tokens_used_this_month` 與 `screenshots_used_this_month` 設**真實硬上限,達標即擋**(零收入階段唯一防燒錢機制)。因 token 用量呼叫後才知,月上限為 best-effort(可超出一個呼叫);系統 SHALL 另對 vision 設「單次 input/output token 上限」作為第二道閘。

#### Scenario: 達 token 月上限擋下一次呼叫
- **WHEN** `ai_tokens_used_this_month` 已達上限
- **THEN** 阻擋後續 AI 呼叫並提示已達上限(允許「達標前最後一次呼叫」超出)

#### Scenario: vision 單次上限
- **WHEN** 一次 vision 呼叫的 token 超過單次上限
- **THEN** 該次呼叫被限制/拒絕,避免單張截圖燒爆成本

#### Scenario: 達截圖月上限擋上傳
- **WHEN** `screenshots_used_this_month` 已達上限
- **THEN** 阻擋新截圖上傳,顯示「已達本月使用上限」

### Requirement: 各入口達標阻擋與提示

系統 SHALL 在各寫入入口達上限時阻擋並給適當提示:截圖/AI → 「已達本月使用上限」(無升級路徑,純提示);表單提交 → 阻擋並對訪客顯示「此表單暫時不接受新提交」、通知 owner(接 #5 hook);Records 達上限 → 阻擋所有來源(chat/表單/截圖/手動)新增。

#### Scenario: records 上限擋所有來源
- **WHEN** `records_used` 已達上限
- **THEN** 手動 / 截圖 commit / 表單提交 / AI 皆無法新增 record,給對應提示

#### Scenario: 表單達上限對訪客友善
- **WHEN** 表單提交達月上限
- **THEN** 訪客看到「此表單暫時不接受新提交」,owner 收到通知,不寫 record

#### Scenario: 阻擋限當前 workspace
- **WHEN** 檢查配額
- **THEN** 經 scopedDb 只依當前 workspace 的用量判斷,不受其他 workspace 影響

### Requirement: 用量檢視與接近上限提示

系統 SHALL 提供前端 `/usage` 頁顯示各配額剩餘,並在接近上限時於相關功能顯示「快到上限」提示。

#### Scenario: 顯示用量
- **WHEN** user 進入 `/usage`
- **THEN** 顯示各配額已用 / 上限 / 重設時間

#### Scenario: 接近上限提示
- **WHEN** 某配額接近上限(例如截圖用到 18/20)
- **THEN** 相關功能顯示「快到上限」提示
