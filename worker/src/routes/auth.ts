import { Hono } from "hono";
import type { AppBindings } from "../types";
import { createAuth } from "../lib/auth";

/**
 * 掛載 Better Auth handler 於 `/api/auth/*`。
 *
 * Better Auth 實際端點(由 auth-client 呼叫,對應 spec 的 auth 能力):
 *   POST /api/auth/sign-up/email
 *   POST /api/auth/sign-in/email
 *   POST /api/auth/sign-out
 *   GET  /api/auth/get-session
 *   POST /api/auth/forget-password
 *   POST /api/auth/reset-password
 *   GET  /api/auth/sign-in/social        (provider=google → /api/auth/callback/google)
 */
export const authRoutes = new Hono<AppBindings>();

authRoutes.on(["GET", "POST"], "/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});
