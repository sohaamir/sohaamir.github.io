import type { AstroIntegration } from 'astro';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { htmlFiles } from './base-prefix';
import { externalLinksNewTab } from '../lib/new-tab';

/** After the build, make external links in every dist HTML page open in a new tab. */
export default function newTab(): AstroIntegration {
  return {
    name: 'external-links-new-tab',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        for await (const file of htmlFiles(fileURLToPath(dir))) {
          const html = await readFile(file, 'utf8');
          const out = externalLinksNewTab(html);
          if (out !== html) await writeFile(file, out);
        }
      },
    },
  };
}
