import { createMiddleware } from "hono/factory";
import { API_ERROR_CODES } from "@ai-airtable/shared";
import type { AppBindings } from "../types";
import { createAuth } from "../lib/auth";
import { scopedDb } from "../lib/db";
import { getOrCreateWorkspaceForUser } from "../lib/workspace";

/**
 * 需登入 API 的 middleware:
 *   1. 由 session 解析當前 user(無有效 session → 401)。
 *   2. 由 user 解析其 workspace;若無則 self-heal 補建。
 *   3. 注入 userId / workspaceId / scopedDb 到 context。
 *
 * workspace_id 一律由 server 端 session 解析,永不信任 client 傳入的值。
 */
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const auth = createAuth(c.env);
  const result = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!result?.user) {
    return c.json({ error: { code: API_ERROR_CODES.UNAUTHORIZED, message: "請先登入" } }, 401);
  }

  const user = result.user;
  const workspace = await getOrCreateWorkspaceForUser(c.env.DB, user.id, user.name);

  c.set("userId", user.id);
  c.set("workspaceId", workspace.id);
  c.set("db", scopedDb(c.env.DB, workspace.id));

  await next();
});
