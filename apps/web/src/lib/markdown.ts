/** Escape the HTML specials so authored text can never inject markup. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Allow only http(s)/mailto, root-relative, anchors, or scheme-less relative paths. */
function safeHref(url: string): string | null {
  const u = url.trim();
  if (/["'<>`\s]/.test(u)) return null;
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
  if (/^[/#]/.test(u)) return u;
  if (/^[^:]+$/.test(u)) return u; // relative path, no scheme
  return null;
}

/** Build an <img> from an already-escaped alt and a raw url, or null if unsafe. */
function renderImageTag(escapedAlt: string, url: string): string | null {
  const href = safeHref(url);
  if (!href) return null;
  return `<img src="${href}" alt="${escapedAlt}" loading="lazy">`;
}

/**
 * Inline formatting on a single line. Input is raw (unescaped); this escapes it,
 * then applies code spans (which shield their contents), links, bold, and italic.
 */
export function renderInline(raw: string): string {
  let s = escapeHtml(raw);

  // Protect inline code first so * _ [ inside it are left literal. NUL sentinels
  // never appear in authored text, so they can't collide with strings like "5".
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });

  // Images: ![alt](url). Must run before links, since ![..](..) contains [..](..).
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt: string, url: string) => {
    return renderImageTag(alt, url) ?? m;
  });

  // Links: [text](url) with href validation.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
    const href = safeHref(url);
    return href ? `<a href="${href}" rel="noopener noreferrer">${text}</a>` : m;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/(^|[^a-zA-Z0-9])_([^_]+)_(?=[^a-zA-Z0-9]|$)/g, "$1<em>$2</em>");

  // Restore code spans.
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

const UL = /^[-*+]\s+(.*)$/;
const OL = /^\d+\.\s+(.*)$/;

/**
 * Block-level prose → HTML. Splits a prose chunk (everything between fenced code
 * blocks) into headings, unordered/ordered lists, blockquotes, and paragraphs,
 * applying inline formatting to text content. Pure and string-only.
 */
export function renderProse(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  const isBlank = (l: string): boolean => l.trim() === "";

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    const imgOnly = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line);
    if (imgOnly) {
      const tag = renderImageTag(escapeHtml(imgOnly[1]), imgOnly[2]);
      if (tag) {
        out.push(`<figure class="post-image">${tag}</figure>`);
        i++;
        continue;
      }
      // unsafe src: fall through and let it render as a normal paragraph
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    if (UL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL.test(lines[i])) {
        items.push(`<li>${renderInline(UL.exec(lines[i])![1])}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (OL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL.test(lines[i])) {
        items.push(`<li>${renderInline(OL.exec(lines[i])![1])}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderInline(quoted.join(" "))}</blockquote>`);
      continue;
    }

    // Paragraph: gather until a blank line or a block starter.
    const para: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !UL.test(lines[i]) &&
      !OL.test(lines[i]) &&
      !/^>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(para.join(" "))}</p>`);
  }

  return out.join("");
}
