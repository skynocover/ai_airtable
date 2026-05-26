import { z } from "zod";

/** Phase 1 只有免費版;`plan` 欄位預設 free,不做 plan 分支邏輯。 */
export const workspacePlanSchema = z.enum(["free", "pro"]);
export type WorkspacePlan = z.infer<typeof workspacePlanSchema>;

/**
 * Workspace — 對齊 PLAN.md §5.3 `workspaces` 表。
 * quota counter 欄位在本 change(foundation)建出但不啟用邏輯(留給 quota-limits)。
 */
export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  owner_id: z.string(),
  plan: workspacePlanSchema,
  records_used: z.number().int(),
  screenshots_used_this_month: z.number().int(),
  ai_tokens_used_this_month: z.number().int(),
  quota_reset_at: z.number().int().nullable(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

export type Workspace = z.infer<typeof workspaceSchema>;

/** `GET /api/v1/workspace` 對外回傳的基本資訊(spec: id/name/slug/plan)。 */
export const workspacePublicSchema = workspaceSchema.pick({
  id: true,
  name: true,
  slug: true,
  plan: true,
});

export type WorkspacePublic = z.infer<typeof workspacePublicSchema>;

/** `PATCH /api/v1/workspace` 請求 body:改名。空白名稱(trim 後為空)被拒。 */
export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "工作區名稱不能空白").max(100, "工作區名稱過長(上限 100 字)"),
});

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
