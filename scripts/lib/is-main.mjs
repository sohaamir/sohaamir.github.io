import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True when this module is the process entry point (symlink-safe; falls back to resolve() if realpath fails). */
export function isMain(argv1, metaUrl) {
  if (!argv1) return false;
  const self = fileURLToPath(metaUrl);
  let entry;
  try {
    entry = realpathSync(argv1);
  } catch {
    entry = resolve(argv1);
  }
  let selfReal = self;
  try {
    selfReal = realpathSync(self);
  } catch {
    /* keep self */
  }
  return entry === selfReal;
}
