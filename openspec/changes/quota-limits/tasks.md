## 1. 配額核心邏輯

- [ ] 1.1 `worker/src/lib/quota.ts`:上限常數(可設定,保守預設)、`checkQuota(workspace, kind)`、`incrementUsage(workspace, kind, amount)`,皆經 scopedDb
- [ ] 1.2 定義各 kind:collections、records(累計)、screenshots(月)、form_submissions(月)、ai_tokens(月)
- [ ] 1.3 單元測試:達上限 checkQuota 回擋、未達放行

## 2. 計數接入各入口

- [ ] 2.1 records 新增(手動/截圖 commit/表單)成功後 `records_used` +1;軟刪除 -1
- [ ] 2.2 截圖抽取成功後 `screenshots_used_this_month` +1
- [ ] 2.3 表單提交成功後提交計數 +1
- [ ] 2.4 AI/vision 呼叫(#3/#4)token 累加 `ai_tokens_used_this_month`(確立此為計數真相)
- [ ] 2.5 collection 建立計入 collections 數

## 3. 阻擋與硬上限

- [ ] 3.1 records 達上限:手動/截圖 commit/表單/AI 新增前 checkQuota,擋並給對應提示
- [ ] 3.2 截圖達月上限:上傳前擋,顯示「已達本月使用上限」
- [ ] 3.3 AI token 月上限:呼叫前檢查累計,達標擋下一次(允許達標前最後一次超出)
- [ ] 3.4 vision 單次 token 上限:超過則限制/拒絕該次呼叫
- [ ] 3.5 表單提交達上限:接 #5 hook,擋並對訪客顯示「此表單暫時不接受新提交」、通知 owner
- [ ] 3.6 測試:各入口達標正確阻擋、限當前 workspace、無 Pro 分支

## 4. 每月重設(Cron Trigger)

- [ ] 4.1 `wrangler.toml` 設定每月 1 號 Cron Trigger
- [ ] 4.2 重設 handler:月度計數歸零、更新 `quota_reset_at`;records_used 不動
- [ ] 4.3 handler 冪等(依 quota_reset_at 判斷該月是否已重設),可重跑
- [ ] 4.4 測試:重設後月度歸零、records 不變

## 5. 用量檢視(前端 + API)

- [ ] 5.1 `GET /api/v1/workspace/usage`:各配額已用/上限/重設時間(經 scopedDb)
- [ ] 5.2 `/usage` 前端頁顯示各配額剩餘
- [ ] 5.3 接近上限(門檻百分比)時於相關功能顯示「快到上限」提示

## 6. 端對端驗證

- [ ] 6.1 User Story 4:截圖用到 18/20 提示快到上限 → 達 20 擋上傳並顯示提示(無升級路徑)
- [ ] 6.2 records 達上限:chat/表單/截圖/手動皆擋
- [ ] 6.3 表單達上限:訪客看到友善訊息、owner 收通知、不寫 record
- [ ] 6.4 AI token 達月上限擋後續呼叫;vision 單次上限生效
- [ ] 6.5 每月重設正確(模擬 Cron);多租戶:配額只依當前 workspace
- [ ] 6.6 確認無任何 Pro/付費/plan 分支邏輯(Phase 1 純免費版煞車)
