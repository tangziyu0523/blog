import { codeToHtml } from "shiki";

type Block =
  | { type: "code"; lang: string; code: string }
  | { type: "text"; text: string };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Tokenize markdown into atomic code blocks + prose blocks. Fenced code is
// captured whole (including internal blank lines) BEFORE prose is split on
// blank lines, so code samples never get shredded into stray paragraphs.
function tokenize(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];

  const flushProse = (): void => {
    const joined = buf.join("\n");
    for (const para of joined.split(/\n\n+/)) {
      const t = para.trim();
      if (t) blocks.push({ type: "text", text: t });
    }
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

async function renderBlock(block: Block): Promise<string> {
  if (block.type === "code") {
    try {
      return await codeToHtml(block.code, { lang: block.lang, theme: "github-light" });
    } catch {
      // Unknown language → plain escaped code block (avoid a render-time throw).
      return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
    }
  }
  const text = block.text;
  if (text.startsWith("# ")) return `<h1>${escapeHtml(text.slice(2))}</h1>`;
  if (text.startsWith("## ")) return `<h2>${escapeHtml(text.slice(3))}</h2>`;
  return `<p>${escapeHtml(text)}</p>`;
}

export async function MarkdownRenderer({ markdown }: { markdown: string }) {
  const blocks = tokenize(markdown);
  const html = (await Promise.all(blocks.map(renderBlock))).join("\n");
  return <div className="prose-naturalist" dangerouslySetInnerHTML={{ __html: html }} />;
}
