## ADDED Requirements

### Requirement: 消耗動作累加 counter

系統 SHALL 在各消耗動作發生時累加當前 workspace 的對應 counter:新增 record → `records_used`、截圖抽取 → `screenshots_used_this_month`、表單提交 → 提交計數、AI 呼叫 token → `ai_tokens_used_this_month`。計數經 `scopedDb(workspace_id)`。

#### Scenario: 新增 record 累加
- **WHEN** 任一來源(手動/截圖/表單)成功新增 record
- **THEN** 該 workspace `records_used` +1

#### Scenario: AI token 累加
- **WHEN** 一次 Claude / vision 呼叫完成
- **THEN** 該次 token 數累加到 `ai_tokens_used_this_month`

### Requirement: Records 累計 vs 月度重設

系統 SHALL 區分:`records_used` 為**累計**(不重設,record 軟刪除時才下降);`screenshots_used_this_month`、表單提交數、`ai_tokens_used_this_month` 為**月度**,每月 1 號重設。

#### Scenario: records 軟刪後下降
- **WHEN** 一筆 record 被軟刪除
- **THEN** `records_used` 對應下降(累計值反映現存筆數)

#### Scenario: 月度計數每月歸零
- **WHEN** 進入新月份(重設後)
- **THEN** screenshots / 表單提交 / ai_tokens 計數歸零,records_used 不變

### Requirement: 每月重設(Cron Trigger)

系統 SHALL 以 Cloudflare Cron Trigger 於每月 1 號重設月度計數,並更新 `quota_reset_at`。MUST NOT 使用 Queue。

#### Scenario: 排程重設
- **WHEN** 每月 1 號 Cron 觸發
- **THEN** 所有 workspace 的月度計數重設,`quota_reset_at` 更新

### Requirement: 用量查詢

系統 SHALL 提供 `GET /api/v1/workspace/usage` 回傳當前 workspace 各配額的已用量與上限。

#### Scenario: 查詢用量
- **WHEN** 已登入 user 呼叫 `GET /api/v1/workspace/usage`
- **THEN** 回傳 records / 截圖 / 表單提交 / AI token 的已用量與上限,經 scopedDb 限當前 workspace
