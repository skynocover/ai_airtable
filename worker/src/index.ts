import { Hono } from "hono";
import { API_ERROR_CODES } from "@ai-airtable/shared";
import type { AppBindings } from "./types";
import { authRoutes } from "./routes/auth";
import { workspaceRoutes } from "./routes/workspaces";
import { requireAuth } from "./middleware/context";

const app = new Hono<AppBindings>();

// ── 健康檢查(無需登入)──────────────────────────────
app.get("/api/health", (c) => c.json({ ok: true }));

// ── Better Auth(無需先登入)────────────────────────
app.route("/api/auth", authRoutes);

// ── 需登入的 /api/v1/* ──────────────────────────────
// requireAuth 掛在「實際存在的資源子樹」上(而非 v1 全域 "*"),這樣未匹配的
// /api/v1/<不存在> 會落到下方的 app.all("/api/*") JSON 404,而不是先被 auth 攔成 401
//(對齊 project-foundation spec:未匹配 API 路徑回 404)。新增受保護資源時,
// 一併為其前綴掛上 requireAuth。
const v1 = new Hono<AppBindings>();
v1.use("/workspace", requireAuth);
v1.use("/workspace/*", requireAuth);
v1.route("/workspace", workspaceRoutes);
app.route("/api/v1", v1);

// ── 未匹配的 API 路徑:回 JSON 404,而非 SPA 內容 ──────
app.all("/api/*", (c) =>
  c.json({ error: { code: API_ERROR_CODES.NOT_FOUND, message: "找不到此 API 路徑" } }, 404),
);

// ── 其餘:交給靜態資源(SPA fallback 回 index.html)──
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

// ── 統一錯誤處理 ────────────────────────────────────
app.onError((err, c) => {
  console.error("[worker] unhandled error", err);
  return c.json({ error: { code: API_ERROR_CODES.INTERNAL, message: "發生錯誤,請稍後再試" } }, 500);
});

export default app;
