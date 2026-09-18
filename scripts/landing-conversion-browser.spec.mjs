import { test, expect } from '@playwright/test';

const origin = `http://127.0.0.1:${Number(process.env.PORT || 4175)}`;

for (const [label, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  test(`signed-out landing converts without a dead end on ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/public-funnel-event', async route => {
      await route.fulfill({ status: 204, body: '' });
    });
    await page.route('**/api/public-waitlist', async route => {
      const body = route.request().postDataJSON() || {};
      if (!String(body.email || '').includes('@')) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Enter a valid email address.' }) });
        return;
      }
      const duplicate = String(body.email).toLowerCase() === 'repeat@example.com';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          duplicate,
          grantsBetaAccess: false,
          message: duplicate
            ? 'You are already on the waitlist. This does not grant Job Agent beta access.'
            : 'You are on the waitlist. This does not grant Job Agent beta access.',
        }),
      });
    });

    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('AI Job Agent that manages the job-search workload');
    await expect(page.locator('#heroLeadForm button[data-funnel-cta="primary"]')).toHaveText('Start Job Agent');
    await expect(page.locator('.nav-actions a[data-funnel-cta="primary"]')).toHaveAttribute('href', '#lead');
    await expect(page.locator('#runSteps')).toContainText('My Jobs');
    await expect(page.locator('#runSteps')).toContainText('Needs You');
    await expect(page.locator('#runSteps')).toContainText('Prepared for Review');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

    await page.locator('#waitlistEmail').fill('not-an-email');
    await page.locator('#waitlistForm button[type="submit"]').click();
    await expect(page.locator('#waitlistStatus')).toContainText('valid email');

    await page.locator('#waitlistEmail').fill('new@example.com');
    await page.locator('#waitlistForm button[type="submit"]').click();
    await expect(page.locator('#waitlistStatus')).toContainText('does not grant Job Agent beta access');

    await page.locator('#waitlistEmail').fill('repeat@example.com');
    await page.locator('#waitlistForm button[type="submit"]').click();
    await expect(page.locator('#waitlistStatus')).toContainText('already on the waitlist');

    await page.route('**/api/public-waitlist', async route => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The waitlist is temporarily unavailable. You can still email sales@1ststep.ai.' }),
      });
    });
    await page.locator('#waitlistEmail').fill('retry@example.com');
    await page.locator('#waitlistForm button[type="submit"]').click();
    await expect(page.locator('#waitlistStatus')).toContainText('sales@1ststep.ai');
    await expect(page.locator('[data-waitlist-fallback]')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('hero requires an email lead before signup continues', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/public-funnel-event', route => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/public-waitlist', async route => {
    const body = route.request().postDataJSON() || {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        duplicate: false,
        grantsBetaAccess: false,
        message: 'You are on the waitlist. This does not grant Job Agent beta access.',
        emailSaved: Boolean(body.email),
      }),
    });
  });
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.nav-actions a[data-funnel-cta="primary"]').click();
  await expect(page).toHaveURL(/#lead/);
  await expect(page.locator('#heroLeadEmail')).toBeFocused();
  await expect(page).not.toHaveURL(/\/concierge/);

  await page.locator('#heroLeadEmail').fill('not-an-email');
  await page.locator('#heroLeadForm button[type="submit"]').click();
  await expect(page.locator('#heroLeadStatus')).toContainText('valid email');
  await expect(page).not.toHaveURL(/\/concierge/);

  await page.locator('#heroLeadEmail').fill('lead@example.com');
  await Promise.all([
    page.waitForURL(/\/concierge/),
    page.locator('#heroLeadForm button[type="submit"]').click(),
  ]);
  await expect(page).toHaveURL(/\/concierge/);
});

test('already-registered visitor can still Sign in without the lead form', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/public-funnel-event', route => route.fulfill({ status: 204, body: '' }));
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.nav-signin')).toHaveAttribute('href', '/app');
  await expect(page.locator('.nav-actions a[data-funnel-cta="primary"]')).toHaveAttribute('href', '#lead');
});
