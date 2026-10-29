/** The guide's mid sky blue (the TV menu's average colour): the dive overlay and the channel page fade-in. */
export const TV_BLUE = '#5a88d4';

/**
 * Sort collection entries into the order their ids appear in the source file.
 * Astro's content store does not promise file order, and journey.yml is
 * chronological (oldest first). Ids not found go last, in their given order.
 */
export function byFileOrder<T extends { id: string }>(entries: T[], fileText: string): T[] {
  const esc = (id: string) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const at = (id: string) => {
    const m = new RegExp(`^\\s*-?\\s*id:\\s*["']?${esc(id)}["']?\\s*$`, 'm').exec(fileText);
    return m ? m.index : Number.POSITIVE_INFINITY;
  };
  return entries
    .map((e, i) => ({ e, i, pos: at(e.id) }))
    .sort((a, b) => a.pos - b.pos || a.i - b.i)
    .map((x) => x.e);
}
