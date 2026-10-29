import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMain } from './lib/is-main.mjs';

const ATTR = /\s(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** Internal href/src/srcset targets found in an HTML string. */
export function extractTargets(html) {
  const out = [];
  for (const m of html.matchAll(ATTR)) {
    const value = m[2] ?? m[3] ?? '';
    const candidates =
      m[1].toLowerCase() === 'srcset' ? value.split(',').map((c) => c.trim().split(/\s+/)[0]) : [value];
    for (const c of candidates) {
      if (c && !EXTERNAL.test(c)) out.push(c);
    }
  }
  for (const m of html.matchAll(/<meta[^>]*http-equiv=["']?refresh[^>]*content=["']\s*\d+\s*;\s*url=([^"']+)/gi)) {
    if (!EXTERNAL.test(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * Resolve a target against base and dist; `exists(absPath)` is injected for testing.
 * Relative targets (no leading slash) are not checked.
 */
export function resolveTarget(target, base, dist, exists) {
  const path = target.split('#')[0].split('?')[0];
  if (!path.startsWith('/')) return { ok: true };
  const b = base.endsWith('/') ? base : `${base}/`;
  if (b !== '/' && !path.startsWith(b) && path !== b.slice(0, -1)) {
    return { ok: false, reason: `missing base ${b}` };
  }
  const rel = decodeURIComponent(path.slice(b.length > 1 && path.startsWith(b) ? b.length : 1));
  const file = join(dist, rel);
  const candidates = rel === '' || rel.endsWith('/') ? [join(file, 'index.html')] : [file, join(file, 'index.html')];
  return candidates.some((c) => exists(c)) ? { ok: true } : { ok: false, reason: 'not found' };
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (name.endsWith('.html')) yield full;
  }
}

function main() {
  const dist = resolve(process.argv[2] ?? 'dist');
  const base = process.env.SITE_BASE ?? '/';
  const exists = (p) => existsSync(p) && statSync(p).isFile();
  const problems = [];
  let pages = 0;
  for (const file of walk(dist)) {
    pages++;
    const page = file.slice(dist.length);
    for (const target of new Set(extractTargets(readFileSync(file, 'utf8')))) {
      const r = resolveTarget(target, base, dist, exists);
      if (!r.ok) problems.push(`${page}: ${target} (${r.reason})`);
    }
  }
  if (problems.length) {
    console.error(`check-links: ${problems.length} broken link(s)\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`check-links: ${pages} pages OK (base ${base})`);
}

if (isMain(process.argv[1], import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`check-links error: ${e.message}`);
    process.exit(1);
  }
}
