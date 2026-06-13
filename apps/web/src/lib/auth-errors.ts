const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "邮箱或密码错误",
  EMAIL_TAKEN: "该邮箱已注册，请直接登录",
  ACCOUNT_LOCKED: "尝试过多，账号已锁定，请 15 分钟后再试",
  RATE_LIMITED: "操作过于频繁，请稍后再试",
  EMAIL_TAKEN_BIND_REQUIRED: "该邮箱已用邮箱密码注册，请用密码登录",
  GITHUB_ALREADY_BOUND: "该 GitHub 账号已绑定到其他用户",
  CANNOT_UNBIND_LAST_METHOD: "这是你唯一的登录方式，无法解绑",
  INVALID_UPLOAD: "图片不符合要求（≤2MB，jpg/png/webp）",
  VALIDATION_ERROR: "输入有误，请检查后重试",
  TOKEN_EXPIRED: "登录已过期，请重新登录",
  TOKEN_INVALID: "登录已过期，请重新登录",
};

/** Map an API ErrorCode to Chinese copy; fall back to the backend message, then a generic line. */
export function authErrorMessage(code: string | undefined, fallback?: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback ?? "操作失败，请重试";
}
