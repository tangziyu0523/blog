import { codeToHtml } from "shiki";
import { renderProse } from "@/lib/markdown";

type Block =
  | { type: "code"; lang: string; code: string }
  | { type: "prose"; text: string };

// Split markdown into fenced code blocks (rendered by Shiki) and prose chunks
// (rendered by the pure parser). Fenced code is captured whole first so its
// contents are never parsed as prose.
function tokenize(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];

  const flushProse = (): void => {
    const text = buf.join("\n");
    if (text.trim()) blocks.push({ type: "prose", text });
    buf = [];
  };

  let i = 0;
  while (i < lines.length) {
    const open = /^```(\w+)?\s*$/.exec(lines[i]);
    if (open) {
      flushProse();
      const lang = open[1] ?? "text";
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence
      blocks.push({ type: "code", lang, code: code.join("\n") });
    } else {
      buf.push(lines[i]);
      i++;
    }
  }
  flushProse();
  return blocks;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function renderBlock(block: Block): Promise<string> {
  if (block.type === "code") {
    try {
      return await codeToHtml(block.code, { lang: block.lang, theme: "github-light" });
    } catch {
      return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
    }
  }
  return renderProse(block.text);
}

export async function MarkdownRenderer({ markdown }: { markdown: string }) {
  const blocks = tokenize(markdown);
  const html = (await Promise.all(blocks.map(renderBlock))).join("\n");
  return <div className="prose-naturalist" dangerouslySetInnerHTML={{ __html: html }} />;
}
