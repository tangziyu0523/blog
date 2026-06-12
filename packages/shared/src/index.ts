/** 前后端共享的统一 API 错误结构（见 CLAUDE.md 铁律 9）。 */
export interface ApiError {
  code: string;
  message: string;
  traceId: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

export function fail(code: string, message: string, traceId: string): ApiResponse<never> {
  return { data: null, error: { code, message, traceId } };
}

export * from './errors.ts';
export * from './auth.ts';
export * from './post.ts';
export * from './comment.ts';
export * from './comment-render.ts';
