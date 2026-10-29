import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, type Creator } from '@retorquere/bibtex-parser';
import { withBase } from './url';

/** Groups on the publications page, in display order. */
export const SECTIONS = [
  { id: 'journal', label: 'Journal articles' },
  { id: 'preprint', label: 'Preprints and working papers' },
  { id: 'software', label: 'Open-source materials' },
] as const;
export type Section = (typeof SECTIONS)[number]['id'];

export type Paper = {
  key: string;
  title: string;
  authors: string[];
  year: number;
  venue?: string;
  /** "7, no. 1", "44, no. 9: 7910–7918", "kkae010": what follows the venue in a citation (Chicago style). */
  locator?: string;
  url?: string;
  doi?: string;
  pdf?: string;
  code?: string;
  preprint?: string;
  abstract?: string;
  preview?: string;
  section: Section;
  /** Topic categories (the bib's `keywords`). */
  keywords: string[];
  bibtex: string;
};

const STRIPPED_FIELDS = ['bibtex_show', 'preview', 'pdf', 'code', 'selected', 'section', 'preprint'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const s = raw.trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  const i = MONTHS.indexOf(s.slice(0, 3));
  return i === -1 ? 0 : i + 1;
}

function formatAuthor(c: Creator): string {
  if (!c.lastName) return (c.name ?? '').trim();
  const initials = (c.firstName ?? '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((n) => `${n[0].toUpperCase()}.`)
    .join(' ');
  return initials ? `${c.lastName}, ${initials}` : c.lastName;
}

/** Remove al-folio-only field lines from a raw entry and keep the entry well-formed. */
function stripFields(input: string): string {
  const drop = new RegExp(`^\\s*(${STRIPPED_FIELDS.join('|')})\\s*=`, 'i');
  const lines = input.trim().split('\n').filter((l) => !drop.test(l));
  const text = lines.join('\n');
  return text.replace(/,(\s*\}\s*)$/, '$1');
}

/** Trimmed field text, or undefined when empty. List fields (publisher, institution) are joined. */
function clean(s: string | string[] | undefined): string | undefined {
  const v = (Array.isArray(s) ? s.join(', ') : s)?.trim();
  return v ? v : undefined;
}

export function loadPapers(bibPath: string): Paper[] {
  const text = readFileSync(resolve(process.cwd(), bibPath), 'utf8');
  const library = parse(text, { sentenceCase: false });

  const rows = library.entries.map((e) => {
    const f = e.fields;
    const pdf = clean(f.pdf);
    const preview = clean(f.preview);
    const section = (SECTIONS.find((s) => s.id === clean(f.section))?.id ?? 'journal') as Section;
    const pages = clean(f.pages)?.replace(/-+/g, '–');
    const issue = [clean(f.volume), clean(f.number) && `no. ${clean(f.number)}`].filter(Boolean).join(', ');
    const report = e.type === 'techreport' && clean(f.number) ? `No. ${clean(f.number)}` : undefined;
    const eprint = clean(f.eprint) && `arXiv:${clean(f.eprint)}`;
    const paper: Paper = {
      key: e.key,
      title: (f.title ?? '').normalize('NFC').replace(/\s+/g, ' ').trim(),
      authors: (f.author ?? []).map((c) => formatAuthor(c).normalize('NFC')),
      year: Number(f.year),
      venue: clean(f.journal) ?? clean(f.booktitle) ?? clean(f.institution) ?? clean(f.publisher),
      locator: report ?? eprint ?? ([e.type === 'techreport' ? '' : issue, pages].filter(Boolean).join(': ') || undefined),
      url: clean(f.url),
      doi: clean(f.doi),
      pdf: pdf && (/^https?:\/\//i.test(pdf) ? pdf : withBase(`/assets/pdf/${pdf}`)),
      code: clean(f.code),
      preprint: clean(f.preprint),
      abstract: clean(f.abstract),
      section,
      keywords: (f.keywords ?? []).map((k) => k.trim()).filter(Boolean),
      preview: preview && withBase(`/assets/img/publication_preview/${preview}`),
      bibtex: stripFields(e.input),
    };
    return { paper, month: monthNumber(f.month) };
  });

  rows.sort((a, b) => b.paper.year - a.paper.year || b.month - a.month);
  return rows.map((r) => r.paper);
}
