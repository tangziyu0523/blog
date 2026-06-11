import type { ApiError } from "@blog/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Don't set a JSON Content-Type for FormData bodies — the browser must add
  // the multipart boundary itself, and setting it manually breaks the upload.
  const isFormData = init?.body instanceof FormData;
  const headers = isFormData
    ? { ...(init?.headers ?? {}) }
    : { "Content-Type": "application/json", ...(init?.headers ?? {}) };

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  // 204 No Content — callers MUST declare T as void.
  if (res.status === 204) return undefined as unknown as T;
  // Tolerate non-JSON bodies (e.g. a gateway returning an HTML 502) so failures
  // surface as ApiClientError instead of an opaque SyntaxError from res.json().
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body as ApiError | null;
    throw new ApiClientError(e?.code ?? "INTERNAL", e?.message ?? "Request failed");
  }
  return body as T;
}
