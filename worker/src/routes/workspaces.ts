import { Hono } from "hono";
import { API_ERROR_CODES, updateWorkspaceSchema, workspacePublicSchema } from "@ai-airtable/shared";
import type { AppBindings } from "../types";
import { globalDb } from "../lib/db";

export const workspaceRoutes = new Hono<AppBindings>();

/** GET /api/v1/workspace — 取得當前 workspace(id/name/slug/plan)。 */
workspaceRoutes.get("/", async (c) => {
  const workspaceId = c.get("workspaceId");
  const ws = await globalDb(c.env.DB).getWorkspaceById(workspaceId);
  if (!ws) {
    return c.json({ error: { code: API_ERROR_CODES.NOT_FOUND, message: "找不到工作區" } }, 404);
  }
  return c.json(workspacePublicSchema.parse(ws));
});

/** PATCH /api/v1/workspace — owner 改名。空白名稱回驗證錯誤。 */
workspaceRoutes.patch("/", async (c) => {
  const workspaceId = c.get("workspaceId");

  const body = await c.req.json().catch(() => null);
  const parsed = updateWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "名稱無效";
    return c.json({ error: { code: API_ERROR_CODES.VALIDATION, message } }, 400);
  }

  const g = globalDb(c.env.DB);
  const existing = await g.getWorkspaceById(workspaceId);
  if (!existing) {
    return c.json({ error: { code: API_ERROR_CODES.NOT_FOUND, message: "找不到工作區" } }, 404);
  }
  // 契約:只有 owner 能改名。今日每個 session 只 resolve 到自己擁有的 workspace,
  // 但仍明確強制此不變量,避免未來引入成員/共享時變成越權漏洞。
  if (existing.owner_id !== c.get("userId")) {
    return c.json(
      { error: { code: API_ERROR_CODES.FORBIDDEN, message: "只有擁有者能修改工作區" } },
      403,
    );
  }

  await g.updateWorkspaceName(workspaceId, parsed.data.name, Date.now());
  const updated = await g.getWorkspaceById(workspaceId);
  if (!updated) {
    return c.json({ error: { code: API_ERROR_CODES.NOT_FOUND, message: "找不到工作區" } }, 404);
  }
  return c.json(workspacePublicSchema.parse(updated));
});
