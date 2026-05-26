# AI 資料工作台

跟 AI 說一句話,把雜亂資訊變成整理好的資料表。Phase 1 開發中。

完整產品規格見 [`PLAN.md`](./PLAN.md);開發指南與跨切片鐵則見 [`CLAUDE.md`](./CLAUDE.md);規格驅動的功能切片在 [`openspec/changes/`](./openspec/changes)。

## 技術棧

- **Worker**:Cloudflare Workers + Hono(`/api`、`/auth`,並提供 SPA 靜態資源)
- **DB**:D1(SQLite,唯一真相)
- **Auth**:Better Auth(email 密碼 + Google OAuth + 忘記/重設密碼)
- **前端**:React + Vite + Tailwind + shadcn/ui 風格元件(繁體中文)
- **共用**:`shared/`(TypeScript 型別 + zod schema + zh-TW 字串常數)

## 專案結構

```
shared/      共用型別 + zod + zh-TW 字串(@ai-airtable/shared)
worker/      單一 Cloudflare Worker(Hono)+ wrangler.toml
web/         React SPA(Vite)
migrations/  D1 migrations(0001_initial.sql)
```

多租戶隔離鐵則:所有 workspace-scoped 的 D1 存取一律過 `worker/src/lib/db.ts` 的
`scopedDb(workspace_id)`,自動注入 `WHERE workspace_id = ?`;route handler 永遠拿不到裸 D1 binding。

## 開發

需求:Node ≥ 22、pnpm ≥ 10。

```bash
pnpm install                     # 安裝所有 workspace 依賴

# 1) 設定本地 secrets
cp worker/.dev.vars.example worker/.dev.vars   # 填入 BETTER_AUTH_SECRET(≥32 字元)
                                               # Google OAuth 需另填 GOOGLE_CLIENT_ID/SECRET

# 2) 套用 D1 migration 到本地
pnpm run db:apply:local

# 3a) 啟動 Worker(serve /api + /auth + 已建置的 SPA,預設 :8787)
pnpm run build                   # 先產生 web/dist 供 Worker 提供
pnpm run dev:worker

# 3b) 或:前端熱更新開發(:5173,/api 代理到 :8787)
pnpm run dev:web                 # 另開終端機,同時跑 pnpm run dev:worker
```

## 驗證

```bash
pnpm run typecheck   # 三個 workspace 的 tsc --noEmit
pnpm test            # worker 多租戶隔離測試(node:sqlite)
pnpm run lint        # prettier 檢查
```

## 部署到 Cloudflare(摘要)

1. `cd worker && npx wrangler d1 create ai-airtable`,把回傳的 `database_id` 填入 `wrangler.toml`。
2. `npx wrangler d1 migrations apply ai-airtable --remote`。
3. 設定 secrets:`npx wrangler secret put BETTER_AUTH_SECRET`(以及 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`)。
4. 把 `wrangler.toml` 的 `BETTER_AUTH_URL` 改成正式網域;Google OAuth callback 設為 `<網域>/api/auth/callback/google`。
5. `pnpm run build && cd worker && npx wrangler deploy`。
