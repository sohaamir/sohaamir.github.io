const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Render the tiny Markdown subset used in YAML/front-matter strings
 * (links, **bold**, *italic*) to safe inline HTML. Everything else is escaped.
 */
export function inlineMarkdown(src: string): string {
  const links: string[] = [];
  // Pull links out first so their URLs are not touched by emphasis rules.
  const withoutLinks = src.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const external = /^https?:\/\//i.test(url);
    const attrs = external ? ' rel="noopener"' : '';
    links.push(`<a href="${escapeHtml(url)}"${attrs}>${escapeHtml(text)}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  const html = escapeHtml(withoutLinks)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => links[Number(i)]);
}
