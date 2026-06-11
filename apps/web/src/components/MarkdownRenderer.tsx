import { codeToHtml } from "shiki";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Minimal renderer: fenced code via Shiki, ATX headings, paragraphs.
// Richer markdown (lists/tables/inline) is a later slice per spec non-goals;
// the { markdown } interface stays stable so callers don't change.
async function renderBlock(block: string): Promise<string> {
  const fence = block.match(/^```(\w+)?\n([\s\S]*?)```$/);
  if (fence) {
    const lang = fence[1] ?? "text";
    const code = fence[2];
    try {
      return await codeToHtml(code, { lang, theme: "github-light" });
    } catch {
      // Unknown language → plain escaped code block (avoid a render-time throw).
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
  }
  if (block.startsWith("# ")) return `<h1>${escapeHtml(block.slice(2))}</h1>`;
  if (block.startsWith("## ")) return `<h2>${escapeHtml(block.slice(3))}</h2>`;
  return `<p>${escapeHtml(block)}</p>`;
}

export async function MarkdownRenderer({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n\n+/);
  const html = (await Promise.all(blocks.map(renderBlock))).join("\n");
  return <div className="prose-naturalist" dangerouslySetInnerHTML={{ __html: html }} />;
}
