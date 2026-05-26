import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import type { Env } from "../types";
import { createWorkspaceForUser } from "./workspace";
import { sendResetPasswordEmail } from "./email";

/**
 * Better Auth 設定。在 Workers 上需以每請求的 `env`(含 D1 binding)建立,故為工廠函式。
 *
 * 重點:
 *   - D1 經 Kysely(kysely-d1 D1Dialect)。
 *   - 表名/欄位以 modelName/fields 映射到 0001_initial.sql 的 snake_case schema
 *     (PLAN.md §5.3 命名為真相;Better Auth 對齊之)。
 *   - credential 密碼由 Better Auth 雜湊後存於 accounts.password(非明碼)。
 *   - 註冊後自動建立 workspace:user.create.after hook。
 *   - session cookie httpOnly;secure 由 Better Auth 依 baseURL 協定自動決定
 *     (production https → secure;本地 http://localhost 例外允許)。
 */
export function createAuth(env: Env) {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // users.name 為 NOT NULL;少數 Google profile 不帶 name,退回 email 避免 insert 失敗。
            mapProfileToUser: (profile: { name?: string; email: string }) => ({
              name: profile.name || profile.email,
            }),
          },
        }
      : undefined;

  // Better Auth 會對帶 cookie 的請求做 origin 檢查,只放行 baseURL 與 trustedOrigins。
  // 開發時 SPA 在 Vite(:5173)、Worker 在 :8787,兩者不同源,故把額外可信任來源納入,
  // 否則 get-session / sign-out 等帶 cookie 的請求會被擋成「Invalid origin」。
  const trustedOrigins = [
    env.BETTER_AUTH_URL,
    ...(env.TRUSTED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []),
  ];

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: "sqlite",
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // 不要求 email 驗證即可登入(Phase 1)。
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordEmail(env, user.email, url);
      },
    },

    socialProviders: google,

    user: {
      modelName: "users",
      fields: {
        emailVerified: "email_verified",
        image: "avatar_url",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      modelName: "sessions",
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    account: {
      modelName: "accounts",
      fields: {
        userId: "user_id",
        providerId: "provider",
        accountId: "provider_account_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        scope: "scope",
        password: "password",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "verifications",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },

    advanced: {
      cookiePrefix: "ai_airtable",
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // 註冊後自動建立 workspace(email 與首次 Google 登入皆觸發此 hook)。
            // 失敗不可讓註冊整個 500(此時 user row 已 commit);僅記 log,
            // 後續第一個已登入請求會由 requireAuth 的 getOrCreateWorkspaceForUser self-heal 補建。
            try {
              await createWorkspaceForUser(env.DB, user.id, user.name);
            } catch (e) {
              console.error("[auth] 註冊後自動建立 workspace 失敗,將由 self-heal 補建", e);
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
