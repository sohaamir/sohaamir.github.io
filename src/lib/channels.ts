export interface Channel {
  num: 1 | 2 | 3 | 4 | 5;
  slug: string;
  label: string;
  /** Fixed one-line summary, shown in the TV menu's preview panel. */
  blurb: string;
  /** Site-relative path; pass through withBase() before use as a URL. */
  path: string;
}

const make = (num: Channel['num'], slug: string, blurb: string): Channel => ({
  num,
  slug,
  label: slug,
  blurb,
  path: `/${slug}/`,
});

export const CHANNELS: readonly Channel[] = [
  make(1, 'about', 'my background and research interests'),
  make(2, 'publications', 'an up-to-date list of my research'),
  make(3, 'cv', 'view and download my cv'),
  make(4, 'journey', 'my scientific journey in pictures'),
  make(5, 'blog', 'tutorials, life updates and more!'),
];

export function channelByKey(key: string): Channel | undefined {
  return CHANNELS.find((c) => String(c.num) === key);
}
