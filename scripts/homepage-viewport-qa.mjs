// Visual + behavioral QA for the marketing homepage across real viewports.
// Usage: node scripts/homepage-viewport-qa.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] || 'http://localhost:4321';
const OUT = process.argv[3] || 'artifacts/homepage-qa';

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-1024', width: 1024, height: 1366 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-360', width: 360, height: 780 },
];

let failures = 0;
const note = (ok, message) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
};

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`));

  const response = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  note(response.status() < 400, `${viewport.name} · homepage responded ${response.status()}`);

  // Landmarks and heading structure
  const h1Count = await page.locator('h1').count();
  note(h1Count === 1, `${viewport.name} · exactly one h1 (found ${h1Count})`);
  note(await page.locator('main#main').count() === 1, `${viewport.name} · main landmark present`);
  note((await page.title()).length > 10, `${viewport.name} · document title set`);

  // Keyboard: from a freshly loaded page the first Tab must reach the skip link.
  // Run this before any click so focus has not been moved by an earlier interaction.
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => ({
    cls: document.activeElement?.className || '',
    outline: getComputedStyle(document.activeElement).outlineStyle,
  }));
  note(firstFocus.cls.includes('skip'), `${viewport.name} · first Tab reaches skip link (got "${firstFocus.cls}")`);
  note(firstFocus.outline !== 'none', `${viewport.name} · focused element has a visible outline`);

  // No horizontal overflow anywhere on the page
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  note(overflow.scrollWidth <= overflow.clientWidth + 1, `${viewport.name} · no horizontal overflow (${overflow.scrollWidth} vs ${overflow.clientWidth})`);

  // The hero CTA must point into the app
  const heroCta = page.locator('a.btn-primary').first();
  note((await heroCta.getAttribute('href')) === '/app', `${viewport.name} · primary CTA targets /app`);

  // Two product paths render. The Chrome assistant is a Job Agent capability, not a
  // third peer product, so a third card reappearing is a regression.
  note(await page.locator('.path').count() === 2, `${viewport.name} · two product paths render`);
  const pathText = await page.locator('#paths').innerText();
  note(!/assisted apply|chrome (assistant|extension)/i.test(pathText),
    `${viewport.name} · no assisted-apply claim while the handoff is flag-gated off`);

  // Testimonials: with no approved quotes the grid must stay hidden and
  // the truthful principles block must show instead.
  note(await page.locator('#quotesGrid').isHidden(), `${viewport.name} · testimonial grid hidden with no verified quotes`);
  note(await page.locator('#principles').isVisible(), `${viewport.name} · product-principle block shown instead`);
  const quoteCards = await page.locator('#quotesGrid .quote').count();
  note(quoteCards === 0, `${viewport.name} · zero fabricated testimonials rendered`);

  // Capture the fold BEFORE any interaction, so the shot shows the hero rather
  // than wherever a later click scrolled to. Blur first so the focused skip link
  // from the keyboard check above does not appear in the screenshot.
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({ path: `${OUT}/${viewport.name}-fold.png` });

  // FAQ accordion opens
  const firstFaq = page.locator('.faq details').first();
  await firstFaq.locator('summary').click();
  note(await firstFaq.evaluate(el => el.open), `${viewport.name} · FAQ accordion opens`);

  // Touch targets on primary actions
  const ctaBox = await heroCta.boundingBox();
  note(ctaBox && ctaBox.height >= 44, `${viewport.name} · primary CTA height >= 44px (${Math.round(ctaBox?.height || 0)}px)`);

  // Mobile menu behavior
  if (viewport.width <= 1080) {
    const toggle = page.locator('#navToggle');
    note(await toggle.isVisible(), `${viewport.name} · mobile menu toggle visible`);
    await toggle.click();
    note(await page.locator('#navSheet').evaluate(el => el.classList.contains('is-open')), `${viewport.name} · mobile menu opens`);
    note((await toggle.getAttribute('aria-expanded')) === 'true', `${viewport.name} · toggle reports aria-expanded`);
    await page.keyboard.press('Escape');
    note(!(await page.locator('#navSheet').evaluate(el => el.classList.contains('is-open'))), `${viewport.name} · Escape closes mobile menu`);
  } else {
    note(await page.locator('.nav-links').isVisible(), `${viewport.name} · desktop nav links visible`);
  }

  // Scroll through the page so every scroll-reveal has fired, then capture.
  // A fullPage screenshot does not itself trigger IntersectionObserver.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 90));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(700);
  const stillHidden = await page.locator('.reveal:not(.is-in)').count();
  note(stillHidden === 0, `${viewport.name} · every reveal section became visible after scrolling (${stillHidden} still hidden)`);
  await page.screenshot({ path: `${OUT}/${viewport.name}-full.png`, fullPage: true });

  note(consoleErrors.length === 0, `${viewport.name} · no console errors${consoleErrors.length ? ` -> ${consoleErrors.slice(0, 3).join(' | ')}` : ''}`);
  note(failedRequests.length === 0, `${viewport.name} · no failed requests${failedRequests.length ? ` -> ${failedRequests.slice(0, 3).join(' | ')}` : ''}`);

  await context.close();
}

// ── Reduced motion ───────────────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const hidden = await page.locator('.reveal:not(.is-in)').count();
  note(hidden === 0, `reduced-motion · all reveal content visible without animation (${hidden} still hidden)`);
  const doneSteps = await page.locator('#runSteps .step.is-done').count();
  note(doneSteps === 5, `reduced-motion · agent card renders completed state (${doneSteps}/5)`);
  await page.screenshot({ path: `${OUT}/reduced-motion.png`, fullPage: true });
  await context.close();
}

// ── Content must not depend on JavaScript ────────────────────────────────────
// The reveal animation hides content until JS reveals it. If home.js ever fails
// to load, every section must still render rather than staying invisible.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  note(await page.locator('h1').isVisible(), 'no-JS · hero heading visible');
  note(await page.locator('#paths .path').first().isVisible(), 'no-JS · product path cards visible');
  note(await page.locator('#faq details').first().isVisible(), 'no-JS · FAQ visible');
  const invisible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.reveal')).filter(el => Number(getComputedStyle(el).opacity) < 0.9).length);
  note(invisible === 0, `no-JS · no section left at zero opacity (${invisible} hidden)`);
  await page.screenshot({ path: `${OUT}/no-javascript.png`, fullPage: true });
  await context.close();
}

// ── `/` never redirects, for anyone ──────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  for (const q of ['', '?jobCaptureId=capture_test_0001&mode=cover_letter', '?token=x',
                   '?restore=1', '?session=y', '?ref=z', '?welcome=extension', '?home=1']) {
    await page.goto(`${BASE}/${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    note(new URL(page.url()).pathname === '/', `no redirect \u00b7 "/${q}" stays on the homepage`);
  }
  await page.evaluate(() => {
    localStorage.setItem('1ststep_welcomed', '1');
    localStorage.setItem('1ststep_profile', '{}');
  });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  note(new URL(page.url()).pathname === '/', 'no redirect \u00b7 returning user stays on the homepage');
  await page.evaluate(() => localStorage.clear());
  await context.close();
}


// ── The app itself still loads at /app ───────────────────────────────────────
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const response = await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  note(response.status() < 400, `/app · workspace responded ${response.status()}`);
  note(await page.locator('#welcomeOverlay').count() === 1, '/app · three-step onboarding overlay present');
  note(await page.locator('#fileInput').count() === 1, '/app · workspace DOM intact (#fileInput)');
  await page.screenshot({ path: `${OUT}/app-workspace.png` });
  await context.close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'All homepage QA checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
