import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error plain .mjs script, no types
import { isMain } from '../../scripts/lib/is-main.mjs';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'is-main-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('isMain', () => {
  it('is true for a symlinked argv[1] pointing at the module, false otherwise', () => {
    const dir = tmp();
    const real = join(dir, 'real.mjs');
    writeFileSync(real, '');
    const link = join(dir, 'link.mjs');
    symlinkSync(real, link);
    const url = pathToFileURL(real).href;
    expect(isMain(real, url)).toBe(true);
    expect(isMain(link, url)).toBe(true);
    expect(isMain(join(dir, 'other.mjs'), url)).toBe(false);
    expect(isMain(undefined, url)).toBe(false);
  });
});

describe('check-links CLI via a symlinked path', () => {
  it('actually runs (exits 1 on a nonexistent dist dir) instead of silently exiting 0', () => {
    const dir = tmp();
    const link = join(dir, 'check-links-link.mjs');
    symlinkSync(resolve('scripts/check-links.mjs'), link);
    const r = spawnSync(process.execPath, [link, join(dir, 'nonexistent')], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ENOENT');
  });
});
