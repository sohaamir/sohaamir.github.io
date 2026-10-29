import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Pull simple `key: value` lines out of a Markdown file's front-matter block. */
export function frontMatter(text: string): Record<string, string> {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/^([A-Za-z_][\w-]*):[ \t]*(.*)$/gm)) {
    out[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return out;
}

/** Recursively list files under a directory. */
export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
