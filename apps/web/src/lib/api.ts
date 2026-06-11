import type { ApiError } from "@blog/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json();
  if (!res.ok) {
    const e = body as ApiError;
    throw new ApiClientError(e?.code ?? "INTERNAL", e?.message ?? "Request failed");
  }
  return body as T;
}
