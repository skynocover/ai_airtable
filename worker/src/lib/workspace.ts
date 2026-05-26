import type { Workspace } from "@ai-airtable/shared";
import { globalDb, isUniqueViolation } from "./db";

/** 由名稱產生 slug 基底:小寫、非英數轉連字號、去頭尾連字號、限長。 */
function slugifyBase(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "workspace";
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * 由顯示名稱產生 workspace 名稱。
 * 注意:少數 Google profile 不帶 name,Better Auth 的 mapProfileToUser 會退回 email
 * 以滿足 users.name NOT NULL(見 auth.ts)。若直接拿來當名稱,email 會洩進 workspace 名稱
 * 與(經 slugify)公開 slug。故 email 形式的名稱一律退回通用名,不洩漏。
 */
function defaultWorkspaceName(displayName: string | null | undefined): string {
  const trimmed = (displayName ?? "").trim();
  if (trimmed && !trimmed.includes("@")) return `${trimmed} 的工作區`;
  return "我的工作區";
}

/**
 * 為 user 建立 workspace(owner = 該 user、plan = free、唯一 slug)。
 * 用於「註冊後自動建立」(Better Auth user.create.after hook)。
 *
 * 唯一性交給 DB 約束兜底,不用「先查再寫」(會有 TOCTOU 競態):
 *   - slug 撞號(idx_workspaces_slug)→ 換隨機尾碼重試。
 *   - owner 撞號(idx_workspaces_owner)→ 代表另一個並行請求已建好 → 回傳既有那筆(idempotent)。
 */
export async function createWorkspaceForUser(
  db: D1Database,
  userId: string,
  displayName: string | null | undefined,
): Promise<Workspace> {
  const g = globalDb(db);
  const name = defaultWorkspaceName(displayName);
  const base = slugifyBase(name);
  const now = Date.now();

  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name,
      slug,
      owner_id: userId,
      plan: "free",
      records_used: 0,
      screenshots_used_this_month: 0,
      ai_tokens_used_this_month: 0,
      quota_reset_at: null,
      created_at: now,
      updated_at: now,
    };
    try {
      await g.createWorkspace(workspace);
      return workspace;
    } catch (e) {
      // owner 已有 workspace(並行建立競態)→ 用既有那筆。
      if (isUniqueViolation(e, "owner_id")) {
        const existing = await g.getWorkspaceByOwner(userId);
        if (existing) return existing;
      }
      // slug 撞號 → 換尾碼重試;其他錯誤照常拋出。
      if (!isUniqueViolation(e, "slug")) throw e;
    }
  }
  throw new Error("無法為使用者產生唯一的 workspace slug");
}

/**
 * 取得 user 的 workspace;若不存在則補建(self-healing)。
 * 防止「user 已建立但 workspace 建立失敗」的部分失敗狀態把用戶卡死。
 */
export async function getOrCreateWorkspaceForUser(
  db: D1Database,
  userId: string,
  displayName: string | null | undefined,
): Promise<Workspace> {
  const g = globalDb(db);
  const existing = await g.getWorkspaceByOwner(userId);
  if (existing) return existing;
  return createWorkspaceForUser(db, userId, displayName);
}
