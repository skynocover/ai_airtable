import { z } from "zod";

/**
 * 7 種(且僅 7 種)field types(PLAN.md §2.4)。
 * 金額沒有獨立型別 —— 用 `number` + 欄位上的 `currency` 顯示設定表達。
 * Phase 2+ 再加:select_multi / datetime / url / file / image。
 */
export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "select_single",
  "date",
  "email",
  "phone",
] as const;

export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof fieldTypeSchema>;

/** select_single 必須帶非空 options;供 fieldSchema / fieldInputSchema 共用的 refine。 */
function requireSelectOptions(
  f: { type: FieldType; options?: string[] },
  ctx: z.RefinementCtx,
): void {
  if (f.type === "select_single" && (!f.options || f.options.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "select_single 欄位必須提供至少一個 option",
      path: ["options"],
    });
  }
}

/**
 * Field —— 一個欄位的完整定義(存在 `collections.current_schema_json.fields[]`)。
 * `id`(`fld_` 前綴)、`order`(顯示序,等同陣列索引)由 server 端決定。
 * select_single 必須帶非空 `options`(下方 refine 強制)。
 */
export const fieldSchema = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1, "欄位名稱不能空白").max(100, "欄位名稱過長"),
    type: fieldTypeSchema,
    required: z.boolean().default(false),
    order: z.number().int(),
    // type-specific config
    options: z.array(z.string().min(1)).optional(), // select_single
    currency: z.string().optional(), // number 金額顯示,如 'TWD'
    multiline: z.boolean().optional(), // text
    // validation
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    // semantics / display
    ai_hint: z.string().optional(),
    hidden_in_public: z.boolean().optional(),
  })
  .superRefine(requireSelectOptions);

export type Field = z.infer<typeof fieldSchema>;

/** Collection 的 schema snapshot(`current_schema_json` 的形狀)。 */
export const collectionSchemaJsonSchema = z.object({
  fields: z.array(fieldSchema),
});

export type CollectionSchemaJson = z.infer<typeof collectionSchemaJsonSchema>;

/**
 * 建立欄位 / add_field 的輸入(client 提供)。`id` / `order` 可省略,由 server 端生成。
 * `type` 不在 7 種內 → enum 直接拒(拒絕未知 field type)。
 */
export const fieldInputSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "欄位名稱不能空白").max(100, "欄位名稱過長"),
    type: fieldTypeSchema,
    required: z.boolean().optional(),
    order: z.number().int().optional(),
    options: z.array(z.string().min(1)).optional(),
    currency: z.string().optional(),
    multiline: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    ai_hint: z.string().optional(),
    hidden_in_public: z.boolean().optional(),
  })
  .superRefine(requireSelectOptions);

export type FieldInput = z.infer<typeof fieldInputSchema>;

/**
 * update_field_meta 可改的中繼資料。**明確排除 `type`**:Phase 1 不支援 change_field_type,
 * 用 `z.never()` 讓任何帶 `type` 的請求在 parse 階段直接失敗(對齊「拒絕 change_field_type」)。
 * 同樣不可改 `id`。
 */
export const fieldMetaUpdatesSchema = z.object({
  type: z.never().optional(),
  id: z.never().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().min(1)).optional(),
  currency: z.string().optional(),
  multiline: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  ai_hint: z.string().optional(),
  hidden_in_public: z.boolean().optional(),
});

export type FieldMetaUpdates = z.infer<typeof fieldMetaUpdatesSchema>;

/** 五種 SchemaOperation(PLAN.md §2.3)。Phase 1 不含 change_field_type。 */
export const schemaOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_field"),
    field: fieldInputSchema,
    at_order: z.number().int().nonnegative().optional(),
  }),
  z.object({ op: z.literal("remove_field"), field_id: z.string() }),
  z.object({
    op: z.literal("rename_field"),
    field_id: z.string(),
    new_name: z.string().trim().min(1).max(100),
  }),
  z.object({
    op: z.literal("update_field_meta"),
    field_id: z.string(),
    updates: fieldMetaUpdatesSchema,
  }),
  z.object({ op: z.literal("reorder_fields"), field_ids: z.array(z.string()) }),
]);

export type SchemaOperation = z.infer<typeof schemaOperationSchema>;

// ───── Collection 資料模型 ─────

/** Record 來源。本 change 只產生 manual;screenshot/form 由後續 change 寫入。 */
export const recordSourceSchema = z.enum(["manual", "screenshot", "form"]);
export type RecordSource = z.infer<typeof recordSourceSchema>;

/** Collection DB 列(workspace-scoped)。`current_schema_json` 為字串,API 層解析為物件。 */
export const collectionRowSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  slug: z.string(),
  icon: z.string().nullable(),
  description: z.string().nullable(),
  schema_version: z.number().int(),
  current_schema_json: z.string(),
  deleted_at: z.number().int().nullable(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

export type CollectionRow = z.infer<typeof collectionRowSchema>;

/** Collection 對外回傳形狀(schema 已解析為物件)。 */
export interface Collection {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  schema_version: number;
  schema: CollectionSchemaJson;
  created_at: number;
  updated_at: number;
}

/** `POST /api/v1/collections` 請求 body。 */
export const createCollectionSchema = z.object({
  name: z.string().trim().min(1, "名稱不能空白").max(100, "名稱過長(上限 100 字)"),
  icon: z.string().trim().max(8).optional(),
  description: z.string().trim().max(500).optional(),
  fields: z.array(fieldInputSchema).max(100).optional(),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

/** `PATCH /api/v1/collections/:id` 請求 body(name / icon / description)。 */
export const updateCollectionSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    icon: z.string().trim().max(8).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "沒有要更新的欄位" });

export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

/** `POST /api/v1/collections/:id/operations` 請求 body(帶樂觀鎖基準)。 */
export const applyOperationsSchema = z.object({
  schema_version: z.number().int().nonnegative(),
  operations: z.array(schemaOperationSchema).min(1, "至少需要一個 operation"),
});

export type ApplyOperationsInput = z.infer<typeof applyOperationsSchema>;
