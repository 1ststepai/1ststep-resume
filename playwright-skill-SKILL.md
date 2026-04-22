---
name: playwright-skill
description: Complete browser automation with Playwright. Auto-detects dev servers, writes clean test scripts to /tmp. Test pages, fill forms, take screenshots, check responsive design, validate UX, test login flows, check links, automate any browser task.
---

# Playwright Browser Automation Skill

## Overview

General-purpose browser automation via Playwright. Write and execute custom scripts that test pages, validate UI flows, take screenshots, and check responsive design.

## Setup (First Time)

```bash
# After placing this skill folder in ~/.claude/skills/playwright-skill:
cd ~/.claude/skills/playwright-skill
npm run setup
```

Installs Playwright and Chromium browser. One-time requirement.

## Critical Workflow

### Step 1: Auto-detect dev servers (for localhost testing)
```bash
SKILL_DIR=~/.claude/skills/playwright-skill
cd $SKILL_DIR && node -e "require('./lib/helpers').detectDevServers().then(s => console.log(JSON.stringify(s)))"
```

- Single server found → use automatically
- Multiple servers found → ask user which to test
- No servers found → request URL or offer startup assistance

### Step 2: Write test script to /tmp

**NEVER write test files to the skill directory. Always use `/tmp/playwright-test-*.js`.**

```javascript
// /tmp/playwright-test-page.js
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3001'; // parameterize always

(async () => {
  const browser = await chromium.launch({ headless: false }); // visible by default
  const page = await browser.newPage();

  await page.goto(TARGET_URL);
  console.log('Page loaded:', await page.title());

  await page.screenshot({ path: '/tmp/screenshot.png', fullPage: true });
  console.log('📸 Screenshot saved to /tmp/screenshot.png');

  await browser.close();
})();
```

### Step 3: Execute
```bash
SKILL_DIR=~/.claude/skills/playwright-skill
cd $SKILL_DIR && node run.js /tmp/playwright-test-page.js
```

## Common Patterns

### Test Responsive Design
```javascript
const viewports = [
  { name: 'Desktop', width: 1920, height: 1080 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Mobile', width: 375, height: 667 },
];
for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.screenshot({ path: `/tmp/${vp.name.toLowerCase()}.png`, fullPage: true });
}
```

### Test Login Flow
```javascript
await page.fill('input[type="email"]', 'user@example.com');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard');
console.log('✅ Login successful');
```

### Fill and Submit Form
```javascript
await page.fill('#name', 'Test User');
await page.fill('#email', 'test@example.com');
await page.fill('#message', 'Hello!');
await page.click('button[type="submit"]');
await page.waitForSelector('.success-message');
```

### Check for Broken Links
```javascript
const links = await page.locator('a[href^="http"]').all();
for (const link of links) {
  const href = await link.getAttribute('href');
  try {
    const res = await page.request.head(href);
    console.log(res.ok() ? `✅ ${href}` : `❌ ${href} (${res.status()})`);
  } catch (e) {
    console.log(`❌ ${href} (error: ${e.message})`);
  }
}
```

## Tips

- Use `slowMo: 50-100` in `chromium.launch()` for debugging visual interactions
- Use `page.waitForSelector()` to confirm elements are ready before interacting
- Screenshots go to `/tmp` — OS cleans them up automatically
- `headless: false` keeps browser visible for real-time observation

## For 1stStep.ai Testing

Use playwright-skill to:
- Screenshot all four tabs (Resume Tailor, Job Search, Applications, Tailored Resumes) at desktop and mobile sizes
- Test the resume upload flow end-to-end
- Validate that tailored resume history persists across tab switches
- Check for broken UI elements or layout overflow on mobile viewports
