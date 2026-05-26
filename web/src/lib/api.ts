import type { WorkspacePublic } from "@ai-airtable/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

  return (await res.json()) as T;
}

export const api = {
  getWorkspace: () => request<WorkspacePublic>("/api/v1/workspace"),
  updateWorkspace: (name: string) =>
    request<WorkspacePublic>("/api/v1/workspace", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
};
