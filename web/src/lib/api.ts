import type {
  Collection,
  CollectionSchemaJson,
  RecordItem,
  SchemaOperation,
  WorkspacePublic,
} from "@ai-airtable/shared";

export interface RecordListResult {
  records: RecordItem[];
  total: number;
  limit: number;
  offset: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 共用的 fetch:統一帶 cookie、401 導回登入頁、非 2xx 轉成 ApiError。回傳原始 Response。 */
async function rawRequest(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

  // 401 → session 失效,導回登入頁(task 7.5)。
  if (res.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "unauthorized", "請先登入");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? "error",
      body?.error?.message ?? "發生錯誤,請稍後再試",
    );
  }

  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await rawRequest(path, init);
  return (await res.json()) as T;
}

export interface ListRecordsParams {
  sort?: string;
  filter?: string;
  limit?: number;
  offset?: number;
}

export const api = {
  getWorkspace: () => request<WorkspacePublic>("/api/v1/workspace"),
  updateWorkspace: (name: string) =>
    request<WorkspacePublic>("/api/v1/workspace", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  // ── Collections ──
  listCollections: () =>
    request<{ collections: Collection[] }>("/api/v1/collections").then((r) => r.collections),
  getCollection: (id: string) => request<Collection>(`/api/v1/collections/${id}`),
  createCollection: (body: {
    name: string;
    icon?: string;
    description?: string;
    fields?: unknown[];
  }) =>
    request<Collection>("/api/v1/collections", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  applyOperations: (id: string, schemaVersion: number, operations: SchemaOperation[]) =>
    request<Collection>(`/api/v1/collections/${id}/operations`, {
      method: "POST",
      body: JSON.stringify({ schema_version: schemaVersion, operations }),
    }),

  // ── Records ──
  listRecords: (collectionId: string, params: ListRecordsParams = {}) => {
    const qs = new URLSearchParams();
    if (params.sort) qs.set("sort", params.sort);
    if (params.filter) qs.set("filter", params.filter);
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return request<RecordListResult>(
      `/api/v1/collections/${collectionId}/records${q ? `?${q}` : ""}`,
    );
  },
  createRecord: (collectionId: string, data: Record<string, unknown>) =>
    request<RecordItem>(`/api/v1/collections/${collectionId}/records`, {
      method: "POST",
      body: JSON.stringify({ data }),
    }),
  updateRecord: (recordId: string, data: Record<string, unknown>) =>
    request<RecordItem>(`/api/v1/records/${recordId}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
    }),
  deleteRecord: (recordId: string) =>
    request<{ ok: true }>(`/api/v1/records/${recordId}`, { method: "DELETE" }),

  /** 觸發 CSV 下載(回傳 blob URL 由呼叫端處理)。走 rawRequest → 401 一樣導回登入頁。 */
  exportCsv: async (collectionId: string): Promise<Blob> => {
    const res = await rawRequest(`/api/v1/collections/${collectionId}/records/export`, {
      method: "POST",
    });
    return res.blob();
  },
};

export type { Collection, CollectionSchemaJson, RecordItem };
