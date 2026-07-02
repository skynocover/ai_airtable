import { z } from "zod";

/** 統一的 API 錯誤格式。所有 `/api/*` 失敗回應皆為此形狀。 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const API_ERROR_CODES = {
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  VALIDATION: "validation_error",
  CONFLICT: "conflict",
  INTERNAL: "internal_error",
} as const;
