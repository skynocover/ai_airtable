import { z } from "zod";

/**
 * SQLite/D1 沒有原生 boolean,`email_verified` 存成 INTEGER 0/1;
 * 而 Better Auth 寫入的時間戳可能是 unix-ms 數字或 ISO 字串。
 * 這兩個 coercion 讓「直接 parse 一筆 raw D1 user row」不會因儲存表示法而炸。
 */
const sqliteBoolean = z.union([z.boolean(), z.number(), z.string()]).transform((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v === "1" || v.toLowerCase() === "true";
});

const timestampMs = z.union([z.number(), z.string()]).transform((v) => {
  if (typeof v === "number") return Math.trunc(v);
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : new Date(v).getTime();
});

/**
 * User — 對齊 PLAN.md §5.3 `users` 表。
 * 密碼雜湊由 Better Auth 管理(存於 `accounts.password`),不在此型別暴露。
 */
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  email_verified: sqliteBoolean,
  name: z.string(),
  avatar_url: z.string().url().nullable(),
  created_at: timestampMs,
  updated_at: timestampMs,
});

export type User = z.infer<typeof userSchema>;

/** 安全對外的 user 視圖(供 session/me 端點使用)。 */
export const publicUserSchema = userSchema.pick({
  id: true,
  email: true,
  name: true,
  avatar_url: true,
});

export type PublicUser = z.infer<typeof publicUserSchema>;
