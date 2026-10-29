import type { AstroIntegration } from 'astro';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { prefixHtml } from '../lib/base-prefix';

async function* htmlFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith('.html')) yield full;
  }
}

/**
 * Markdown bodies emit root-relative links Astro does not prefix with `base`.
 * After the build, prefix them in dist HTML (only when base is not '/').
 */
export default function basePrefix(base: string): AstroIntegration {
  return {
    name: 'base-prefix',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        if (base === '/' || base === '') return;
        const root = fileURLToPath(dir);
        for await (const file of htmlFiles(root)) {
          const html = await readFile(file, 'utf8');
          const out = prefixHtml(html, base);
          if (out !== html) await writeFile(file, out);
        }
      },
    },
  };
}
