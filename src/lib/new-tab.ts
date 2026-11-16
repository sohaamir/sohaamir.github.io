const SCRIPT_OR_STYLE = /(<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>)/gi;
const ANCHOR = /<a\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const TARGET = /\starget\s*=/i;
const REL = /(\srel\s*=\s*)(?:"([^"]*)"|'([^']*)')/i;

/** True for absolute http(s) or protocol-relative URLs, i.e. links that leave the site. */
export function isExternal(href: string): boolean {
  return /^(?:https?:)?\/\//i.test(href.trim());
}

function rewriteAnchor(tag: string): string {
  const m = tag.match(HREF);
  if (!m || !isExternal(m[1] ?? m[2] ?? '') || TARGET.test(tag)) return tag;
  let out = tag;
  const rel = out.match(REL);
  if (rel) {
    const values = new Set((rel[2] ?? rel[3] ?? '').split(/\s+/).filter(Boolean));
    values.add('noopener');
    out = out.replace(REL, `$1"${[...values].join(' ')}"`);
  } else {
    out = out.replace(/\s*\/?>$/, (end) => ` rel="noopener"${end}`);
  }
  return out.replace(/\s*\/?>$/, (end) => ` target="_blank"${end}`);
}

/**
 * Make every external <a> in an HTML document open in a new tab
 * (target="_blank" rel="noopener"). Pure. Anchors that already set a target,
 * internal links, and script/style bodies are untouched.
 */
export function externalLinksNewTab(html: string): string {
  return html
    .split(SCRIPT_OR_STYLE)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(ANCHOR, rewriteAnchor)))
    .join('');
}
