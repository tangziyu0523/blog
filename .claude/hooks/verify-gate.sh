#!/usr/bin/env bash
# Stop hook 守门：会话结束前强制 pnpm verify 全绿。
# 失败时 exit 2 并输出原因到 stderr，Claude 会收到并继续修复。
set -uo pipefail

input=$(cat)

# stop_hook_active=true 表示已经因本 hook 拦截过一次，放行避免死循环
if printf '%s' "$input" | grep -q '"stop_hook_active":[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

# 项目尚未初始化依赖时不拦截（如刚 clone、纯文档会话）
[ -f package.json ] || exit 0
[ -d node_modules ] || exit 0

# 工作区干净（无未提交改动）时不拦截，避免纯问答会话也跑全量校验
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
    exit 0
  fi
fi

output=$(pnpm -s verify 2>&1)
status=$?

if [ $status -ne 0 ]; then
  {
    echo "❌ verify-gate: pnpm verify 未通过（exit ${status}），请修复后再结束。"
    echo "----- 最后 60 行输出 -----"
    printf '%s\n' "$output" | tail -60
  } >&2
  exit 2
fi

exit 0
