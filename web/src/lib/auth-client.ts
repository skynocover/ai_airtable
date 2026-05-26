import { createAuthClient } from "better-auth/react";

/**
 * Better Auth 前端 client。baseURL 用同源(dev 由 Vite proxy 轉發 /api 到 Worker;
 * production 同一部署)。auth-client 會自動補上 basePath `/api/auth`。
 */
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
});

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword } =
  authClient;
