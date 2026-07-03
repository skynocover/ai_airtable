import type { ScopedDb } from "./lib/db";

/** Worker 環境 binding 與 secrets。 */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  // vars
  BETTER_AUTH_URL: string;
  /** 逗號分隔的額外可信任來源(origin)。當 SPA 與 auth baseURL 不同源時需設定(例:本地 Vite :5173)。 */
  TRUSTED_ORIGINS?: string;
  // secrets(wrangler secret / .dev.vars)
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  /** 寄件地址(Resend 已驗證網域)。未設定時退回 Resend 測試寄件人。 */
  EMAIL_FROM?: string;
  // ── AI Gateway(Claude via Cloudflare AI Gateway)──
  /** Anthropic API key(Worker secret;絕不進 repo/回應)。 */
  ANTHROPIC_API_KEY: string;
  /** AI Gateway 的 Cloudflare account id + gateway 名稱(vars);用來組 gateway endpoint。 */
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_NAME?: string;
  /** 選填:直接指定 gateway base url(覆蓋上面兩者;測試/自訂用,不含 /v1/messages 尾段）。 */
  AI_GATEWAY_BASE_URL?: string;
}

/**
 * Hono context 變數。已登入請求由 context middleware 注入:
 *   - userId / workspaceId 由 session 解析(永不信任 client 傳入)
 *   - db 為已綁定該 workspace 的 scopedDb 實例
 */
export interface Variables {
  userId: string;
  workspaceId: string;
  db: ScopedDb;
}

export type AppBindings = { Bindings: Env; Variables: Variables };
