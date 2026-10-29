import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { frontMatter, walk } from './helpers';

const root = join(__dirname, '..', '..');
const content = join(root, 'src/content');
const pub = join(root, 'public');
const read = (p: string) => readFileSync(p, 'utf8');
const mdFiles = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.md'));

describe('content migration', () => {
  it('has at least 13 news items', () => {
    expect(mdFiles(join(content, 'news')).length).toBeGreaterThanOrEqual(13);
  });

  it('has 32 journey images and every file exists in public/', () => {
    const yml = read(join(content, 'journey.yml'));
    const ids = [...yml.matchAll(/^- id: (\S+)$/gm)].map((m) => m[1]);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
    const images = [...yml.matchAll(/^ {2}image: (\S+)$/gm)].map((m) => m[1]);
    expect(images).toHaveLength(32);
    for (const img of images) {
      expect(existsSync(join(pub, 'assets/img/gallery', img)), img).toBe(true);
    }
  });

  it('has every PDF referenced by papers.bib in public/assets/pdf/', () => {
    const bib = read(join(root, 'src/data/papers.bib'));
    const pdfs = [...bib.matchAll(/\bpdf\s*=\s*\{([^}]+)\}/g)].map((m) => m[1]);
    expect(pdfs.length).toBeGreaterThan(0);
    for (const p of pdfs) expect(existsSync(join(pub, 'assets/pdf', p)), p).toBe(true);
  });

  it('has every publication preview image from papers.bib in public/', () => {
    const bib = read(join(root, 'src/data/papers.bib'));
    for (const m of bib.matchAll(/\bpreview\s*=\s*\{([^}]+)\}/g)) {
      expect(existsSync(join(pub, 'assets/img/publication_preview', m[1])), m[1]).toBe(true);
    }
  });

  it('has every root-relative /assets/ image referenced in content present in public/', () => {
    for (const f of walk(content)) {
      if (!/\.(md|yml)$/.test(f)) continue;
      for (const m of read(f).matchAll(/\/assets\/(?:img|pdf)\/[^\s"'<>)]+/g)) {
        const rel = m[0].split('?')[0];
        // code samples in the website-guide post mention favicon paths that are not real assets
        if (rel.startsWith('/assets/img/favicon/')) continue;
        expect(existsSync(join(pub, rel)), `${f} -> ${rel}`).toBe(true);
      }
    }
  });

  // Private strings (e.g. the date of birth) that must never reach the site, one per line in the
  // git-ignored .private/forbidden.txt, so the repo itself never contains them. Skipped without it.
  const forbiddenFile = join(root, '.private/forbidden.txt');
  const forbidden = existsSync(forbiddenFile) ? read(forbiddenFile).split('\n').map((l) => l.trim()).filter(Boolean) : [];
  it.skipIf(!forbidden.length)('contains no private strings under src/ or public/', () => {
    for (const dir of ['src', 'public']) {
      for (const f of walk(join(root, dir))) {
        if (!/\.(md|yml|yaml|ts|astro|json|bib|html|svg|css|js|txt)$/.test(f)) continue;
        for (const s of forbidden) expect(read(f).includes(s), f).toBe(false);
      }
    }
  });

  it('leaves no al-folio liquid tags in src/content/', () => {
    for (const f of walk(content)) {
      const text = read(f);
      expect(text, f).not.toContain('{%');
      expect(text, f).not.toContain('{{');
    }
  });
});
