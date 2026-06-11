/** Allow only <b>/</b> tags; the server escapes all other content already. */
export function sanitizeHighlight(html: string): string {
  return html.replace(/<(?!\/?b>)[^>]*>/gi, "");
}
