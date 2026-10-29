import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, posix } from 'node:path';
import { isMain } from './lib/is-main.mjs';
import { gzipSync } from 'node:zlib';

export const LIMIT = 3 * 1024 * 1024;

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const IMPORT_RE =
  /(?:\bimport\s*|\bfrom\s*|\bimport\s*\(\s*)(?:"([^"]+)"|'([^']+)')/g;

/** Static, side-effect, re-export and dynamic import specifiers (relative/absolute only). */
export function extractImports(js) {
  const out = [];
  for (const m of js.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (spec && (spec.startsWith('.') || spec.startsWith('/')) && !EXTERNAL.test(spec)) out.push(spec);
  }
  return out;
}

/** Scripts, stylesheets, modulepreloads and inline-module imports referenced from an HTML string. */
export function extractHtmlRefs(html) {
  const out = [];
  const keep = (u) => {
    if (u && !EXTERNAL.test(u)) out.push(u);
  };
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = m[1].match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (src) keep(src[1] ?? src[2]);
    else if (/\btype\s*=\s*["']?module/i.test(m[1])) extractImports(m[2]).forEach(keep);
  }
  for (const m of html.matchAll(/<link\b([^>]*)>/gi)) {
    const rel = m[1].match(/\srel\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const href = m[1].match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (rel && href && /\b(stylesheet|modulepreload)\b/i.test(rel[1] ?? rel[2])) keep(href[1] ?? href[2]);
  }
  return out;
}

/** Site base ('/' or '/new_website/') inferred from the `/_astro/` asset prefix. */
export function detectBase(urls) {
  for (const u of urls) {
    const i = u.indexOf('/_astro/');
    if (i >= 0) return u.slice(0, i + 1);
  }
  return '/';
}

/** Absolute URL (with base) -> path relative to dist. */
export function toDistPath(url, base) {
  const path = url.split('#')[0].split('?')[0];
  const b = base.endsWith('/') ? base : `${base}/`;
  return path.startsWith(b) ? path.slice(b.length) : path.replace(/^\//, '');
}

/** Resolve an import specifier found in `fromPath` (dist-relative) to a dist-relative path. */
export function resolveImport(spec, fromPath, base) {
  if (spec.startsWith('/')) return toDistPath(spec, base);
  return posix.normalize(posix.join(posix.dirname(fromPath), spec.split('?')[0]));
}

export function evaluateBudget(total, limit = LIMIT) {
  return { ok: total <= limit, total, limit };
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function listFiles(dir, exts) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => !exts || exts.some((e) => f.endsWith(e)))
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile());
}

/** Walk the room page's reachable files. Returns [{ path, bytes, gzip? }] (dist-relative paths). */
export function collect(dist) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const refs = extractHtmlRefs(html);
  const base = detectBase(refs);
  const seen = new Map();
  const queue = refs.map((u) => toDistPath(u, base));
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    const abs = join(dist, rel);
    if (!existsSync(abs)) throw new Error(`referenced file missing from dist: ${rel}`);
    const buf = readFileSync(abs);
    const entry = { path: rel, bytes: buf.length };
    if (rel.endsWith('.js')) {
      entry.gzip = gzipSync(buf).length;
      for (const spec of extractImports(buf.toString('utf8'))) queue.push(resolveImport(spec, rel, base));
    }
    seen.set(rel, entry);
  }
  const extra = [
    ...listFiles(join(dist, 'models'), ['.glb']),
    ...listFiles(join(dist, 'audio')),
    ...listFiles(join(dist, 'img'), ['room-still.webp']),
  ];
  for (const abs of extra) {
    const rel = abs.slice(dist.length).replace(/^[\\/]/, '').split('\\').join('/');
    if (!seen.has(rel)) seen.set(rel, { path: rel, bytes: statSync(abs).size });
  }
  return { base, files: [...seen.values()] };
}

function main() {
  const dist = resolve(process.argv[2] ?? 'dist');
  const { base, files } = collect(dist);
  let total = 0;
  let jsRaw = 0;
  let jsGzip = 0;
  for (const f of files) {
    total += f.bytes;
    if (f.gzip !== undefined) {
      jsRaw += f.bytes;
      jsGzip += f.gzip;
    }
    console.log(`  ${kb(f.bytes).padStart(10)}  ${f.path}`);
  }
  console.log(`base ${base}; ${files.length} files; JS ${kb(jsRaw)} raw, ${kb(jsGzip)} gzip (info only)`);
  const r = evaluateBudget(total);
  console.log(`room page total (raw): ${total} bytes (${mb(total)}) of ${r.limit} (${mb(r.limit)})`);
  if (!r.ok) {
    console.error(`check:budget FAILED: over budget by ${total - r.limit} bytes`);
    process.exit(1);
  }
  console.log('check:budget OK');
}

if (isMain(process.argv[1], import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`check:budget error: ${e.message}`);
    process.exit(1);
  }
}
