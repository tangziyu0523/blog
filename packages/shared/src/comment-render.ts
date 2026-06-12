const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);
}

/**
 * 评论 Markdown 子集渲染：粗体 / 行内代码 / http(s) 链接 / 换行。
 * 先转义全部 HTML，再对白名单子集做结构化替换——用户原始 HTML 永不进入 DOM。
 * 顺序：先行内代码（保护反引号内文本不被后续规则改写），再粗体、链接、换行。
 */
export function renderCommentMarkdown(md: string): string {
  let s = escapeHtml(md);
  s = s.replace(/`([^`\n]+)`/g, (_m, c: string) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, (_m, c: string) => `<strong>${c}</strong>`);
  s = s.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`,
  );
  s = s.replace(/\n/g, '<br>');
  return s;
}
