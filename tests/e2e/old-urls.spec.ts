import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const urls = readFileSync('tests/fixtures/old-urls.txt', 'utf8').split('\n').filter(Boolean);
const LANDINGS = ['/', '/about/', '/publications/', '/cv/', '/journey/', '/blog/'];

for (const url of urls) {
  test(`old URL ${url} still resolves`, async ({ page, request }) => {
    const res = await page.goto(url);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState('load');
    const { pathname } = new URL(page.url());
    const isRealPage = pathname === url;
    expect(isRealPage || LANDINGS.includes(pathname), `landed on ${pathname}`).toBe(true);
  });
}
