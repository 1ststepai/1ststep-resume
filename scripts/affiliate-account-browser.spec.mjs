import { expect, test } from '@playwright/test';

const appUrl = process.env.AFFILIATE_BROWSER_URL || 'http://127.0.0.1:4175/app.html';

test('signed-out account view routes partner applicants to normal account access', async ({ page }) => {
  await page.route('**/api/affiliates?view=mine', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'AUTH_REQUIRED' }) }));
  await page.goto(appUrl);
  await page.evaluate(() => window.openProfileModal());
  await expect(page.locator('#affiliateAccountContent')).toContainText('Sign in or create your standard 1stStep.ai account');
  await expect(page.locator('#affiliateAccountContent a[href="/login.html?mode=sign-up"]')).toBeVisible();
  await expect(page.locator('#affiliateAccountContent a[href="/login.html"]')).toBeVisible();
});

test('approved account sees only its private affiliate dashboard', async ({ page }) => {
  await page.route('**/api/affiliates?view=mine', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      available: true,
      commissionsEnabled: false,
      minimumPayoutCents: 5000,
      partner: { id: 'private-id', code: 'preview-partner', name: 'Preview Partner', status: 'active', clicks: 7, referrals: 3, conversions: 1, pendingCents: 1170, payableCents: 2340, paidCents: 3510, payoutConfigured: false },
      payouts: [{ id: 'private-payout', amountCents: 3510, currency: 'usd', method: 'paypal', paidAt: '2026-09-10T00:00:00.000Z' }],
    }),
  }));
  await page.goto(appUrl);
  await page.evaluate(() => window.openProfileModal());
  const account = page.locator('#affiliateAccountContent');
  await expect(account).toContainText('Affiliate Dashboard · Approved');
  await expect(account).toContainText('Referral code: preview-partner');
  await expect(account).toContainText('7');
  await expect(account).toContainText('3');
  await expect(account).toContainText('$11.70');
  await expect(account.locator('#affiliateLink')).toHaveValue('https://app.1ststep.ai/?ref=preview-partner&utm_source=partner&utm_medium=referral');
  await expect(account.locator('#affiliatePayoutEmail')).toBeVisible();
  await expect(account).toContainText('Terms · Support');
});
