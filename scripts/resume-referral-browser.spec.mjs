import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../resume-tailor-landing/standalone/index.html', import.meta.url), 'utf8');

test('resume.1ststep.ai carries partner referral into the Job Agent start at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://resume.1ststep.ai/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://resume.1ststep.ai/?ref=Coach_Sam&utm_source=partner');
  const start = page.locator('.fs-actions .fs-btn-primary').first();
  await expect(start).toHaveText('Start Job Agent — free');
  const url = new URL(await start.getAttribute('href'));
  expect(url.pathname).toBe('/login.html');
  expect(url.searchParams.get('returnTo')).toBe('/concierge?ref=Coach_Sam&utm_source=partner');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect((await start.boundingBox()).y).toBeLessThan(844);
});

test('resume.1ststep.ai links stay clean without referral parameters', async ({ page }) => {
  await page.route('https://resume.1ststep.ai/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://resume.1ststep.ai/');
  expect(await page.locator('.fs-actions .fs-btn-primary').first().getAttribute('href')).toBe('https://app.1ststep.ai/login.html?mode=sign-up&returnTo=%2Fconcierge');
});
