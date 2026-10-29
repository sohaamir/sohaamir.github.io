// @ts-check
import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import basePrefix from './src/integrations/base-prefix.ts';

const base = process.env.SITE_BASE ?? '/';
const redirects = JSON.parse(readFileSync(new URL('./src/data/redirects.json', import.meta.url), 'utf8'));

export default defineConfig({
  site: 'https://sohamir.org',
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  redirects,
  integrations: [basePrefix(base)],
  // The room script bundles three.js (~610 kB min, ~160 kB gzip). The real
  // guard is the 3 MB room budget (npm run check:budget), not Vite's 500 kB hint.
  vite: { build: { chunkSizeWarningLimit: 800 } },
});
