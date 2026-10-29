import { describe, expect, it } from 'vitest';
import { loadPapers } from '../../src/lib/papers';

const mini = loadPapers('tests/fixtures/mini.bib');
const byKey = (k: string) => mini.find((p) => p.key === k)!;

describe('loadPapers', () => {
  it('parses all entries', () => {
    expect(loadPapers('src/data/papers.bib').length).toBe(12);
  });

  it('sorted newest first (year, then month)', () => {
    const years = loadPapers('src/data/papers.bib').map((p) => p.year);
    for (let i = 1; i < years.length; i++) expect(years[i]).toBeLessThanOrEqual(years[i - 1]);
    expect(mini.map((p) => p.key)).toEqual(['accent2024', 'mini2024', 'pub2023']);
  });

  it('strips al-folio fields from bibtex', () => {
    for (const p of [...loadPapers('src/data/papers.bib'), ...mini]) {
      expect(p.bibtex).not.toMatch(/bibtex_show|preview|\bpdf\s*=|\bcode\s*=|selected/);
      expect(p.bibtex).toMatch(/^@\w+\{/);
      expect(p.bibtex).not.toMatch(/,\s*\}\s*$/);
    }
    expect(byKey('mini2024').bibtex).toContain('doi');
  });

  it('formats authors as Last, Initials.', () => {
    expect(byKey('mini2024').authors).toEqual(['Sohail, A.', 'Zhang, L.']);
  });

  it('handles LaTeX accents and braces in titles', () => {
    expect(byKey('mini2024').title).toBe('The Bayesian brain');
    expect(byKey('accent2024').title).toBe('Cognition in São Paulo');
    expect(byKey('accent2024').authors[0]).toBe('Karataş, K.');
  });

  it('venue falls back to publisher', () => {
    expect(byKey('mini2024').venue).toBe('Test Journal');
    expect(byKey('pub2023').venue).toBe('Zenodo');
  });

  it('resolves pdf and preview URLs', () => {
    expect(byKey('mini2024').pdf).toBe('/assets/pdf/mini.pdf');
    expect(byKey('mini2024').preview).toBe('/assets/img/publication_preview/mini.png');
    expect(byKey('mini2024').code).toBe('https://example.org/code');
    expect(byKey('accent2024').pdf).toBe('https://example.org/remote.pdf');
    expect(byKey('pub2023').pdf).toBeUndefined();
  });
});
