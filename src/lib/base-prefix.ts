const SCRIPT_OR_STYLE = /(<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>)/gi;
const TAG = /<[a-zA-Z](?:"[^"]*"|'[^']*'|[^>"'])*>/g;
const URL_ATTR = /(\s(?:href|src|srcset)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi;

function normaliseBase(base: string): string {
  const b = base.startsWith('/') ? base : `/${base}`;
  return b.endsWith('/') ? b : `${b}/`;
}

function prefixUrl(url: string, base: string): string {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  if (url.startsWith(base) || url === base.slice(0, -1)) return url;
  return base + url.slice(1);
}

function prefixValue(attr: string, value: string, base: string): string {
  if (attr.toLowerCase() !== 'srcset') return prefixUrl(value, base);
  return value
    .split(',')
    .map((candidate) => {
      const lead = candidate.match(/^\s*/)![0];
      const rest = candidate.slice(lead.length);
      return lead + prefixUrl(rest.split(/\s/, 1)[0], base) + rest.slice(rest.split(/\s/, 1)[0].length);
    })
    .join(',');
}

const REFRESH_URL = /(content\s*=\s*["']\s*\d+\s*;\s*url=)(\/[^"']*)/i;

function prefixTag(tag: string, base: string): string {
  if (/http-equiv\s*=\s*["']?refresh/i.test(tag)) {
    return tag.replace(REFRESH_URL, (_w, head: string, url: string) => head + prefixUrl(url, base));
  }
  return tag.replace(URL_ATTR, (whole, head: string, dq?: string, sq?: string) => {
    const attr = head.split('=')[0].trim();
    const quote = dq !== undefined ? '"' : "'";
    return `${head}${quote}${prefixValue(attr, dq ?? sq ?? '', base)}${quote}`;
  });
}

/**
 * Prefix root-relative href/src/srcset values in HTML with `base`. Pure.
 * No-op when base is '/'. Text content and script/style bodies are untouched.
 */
export function prefixHtml(html: string, rawBase: string): string {
  const base = normaliseBase(rawBase);
  if (base === '/') return html;
  return html
    .split(SCRIPT_OR_STYLE)
    .map((part, i) => {
      if (i % 2 === 1) {
        // script/style: only its opening tag (e.g. <script src="/x.js">)
        const open = part.match(/^<[a-zA-Z](?:"[^"]*"|'[^']*'|[^>"'])*>/);
        return open ? prefixTag(open[0], base) + part.slice(open[0].length) : part;
      }
      return part.replace(TAG, (tag) => prefixTag(tag, base));
    })
    .join('');
}
