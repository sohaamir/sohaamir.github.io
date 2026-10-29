import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const CHANNELS = [
  ['about', 1],
  ['publications', 2],
  ['cv', 3],
  ['journey', 4],
  ['blog', 5],
] as const;

for (const [slug, num] of CHANNELS) {
  test(`channel /${slug}/ renders with badge and h1`, async ({ page }) => {
    const res = await page.goto(`/${slug}/`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('.badge')).toHaveText(`CH 0${num} · ${slug}`);
    await expect(page.locator('h1').first()).toBeVisible();
  });
}

test('pressing 4 on /about/ goes to /journey/', async ({ page }) => {
  await page.goto('/about/');
  await page.keyboard.press('4');
  await expect(page).toHaveURL(/\/journey\/$/);
});

test('Escape on /cv/ goes to /?tv=1', async ({ page }) => {
  await page.goto('/cv/');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/\?tv=1$/);
});

test('publications lists 12 papers', async ({ page }) => {
  await page.goto('/publications/');
  await expect(page.locator('article.paper')).toHaveCount(12);
});

test('cv embeds the pdf and offers a download', async ({ page }) => {
  await page.goto('/cv/');
  await expect(page.locator('object[type="application/pdf"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /download/i })).toHaveAttribute('href', /academic_cv\.pdf$/);
});

test('about brain GIF is lazy-loaded with reserved size', async ({ page }) => {
  await page.goto('/about/');
  const gif = page.locator('img[src$="/assets/img/my_brain.gif"]');
  await expect(gif).toHaveCount(1);
  await expect(gif).toHaveAttribute('loading', 'lazy');
  await expect(gif).toHaveAttribute('decoding', 'async');
  await expect(gif).toHaveAttribute('width', '224');
  await expect(gif).toHaveAttribute('height', '201');
});

test('journey images are lazy', async ({ page }) => {
  await page.goto('/journey/');
  const imgs = page.locator('main img');
  expect(await imgs.count()).toBe(32);
  for (const img of await imgs.all()) {
    await expect(img).toHaveAttribute('loading', 'lazy');
  }
});

test('journey images follow journey.yml order, oldest first', async ({ page }) => {
  const yml = readFileSync('src/content/journey.yml', 'utf8');
  const expected = [...yml.matchAll(/^\s+image:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  await page.goto('/journey/');
  const srcs = await page.locator('main img').evaluateAll((els) => els.map((e) => (e.getAttribute('src') ?? '').split('/').pop()));
  expect(srcs).toEqual(expected);
  expect(srcs[0]).toBe('chemistry.png');
  expect(srcs.at(-1)).toBe('pascl_group_photo.jpeg');
});

test('404 page offers the channels', async ({ page }) => {
  const res = await page.goto('/nope/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('link', { name: /room/i })).toBeVisible();
});

test.describe('viewport sweep', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const paths = [
    ...CHANNELS.map(([s]) => `/${s}/`),
  ];
  for (const path of paths) {
    test(`no horizontal overflow at 390px on ${path}`, async ({ page }) => {
      await page.goto(path);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(w).toBeLessThanOrEqual(390);
    });
  }
});

test('sitemap.xml lists the four channels; robots.txt points at it', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  for (const [slug] of CHANNELS) expect(xml).toContain(`<loc>https://sohamir.org/${slug}/</loc>`);
  expect(xml).not.toContain('404');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Allow: /');
  expect(robots).toContain('Sitemap: https://sohamir.org/sitemap.xml');
});
