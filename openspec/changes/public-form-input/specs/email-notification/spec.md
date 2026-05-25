## ADDED Requirements

### Requirement: 共用 email 寄送通道

系統 SHALL 提供共用 email 寄送通道(透過 Resend),API key 走 Worker secret、寄件網域經驗證。此通道供本 change 的提交通知使用,亦可供其他 change(如 #1 reset 信)復用。

#### Scenario: 寄送 email
- **WHEN** 系統需寄出通知 email
- **THEN** 經 Resend 寄出,寄件網域已驗證,API key 不外洩

### Requirement: 新提交時通知 owner

系統 SHALL 在公開表單收到新提交時,於 1 分鐘內 email 通知 collection 所屬 workspace 的 owner,內容含提交摘要與後台連結。

#### Scenario: 提交後通知
- **WHEN** 訪客成功提交表單
- **THEN** owner 於 1 分鐘內收到 email 通知,可點連結進後台查看新提交

#### Scenario: email 失敗不影響提交
- **WHEN** 通知 email 寄送失敗
- **THEN** 提交本身仍成功(record 已寫入),失敗以記錄處理,不回退提交
