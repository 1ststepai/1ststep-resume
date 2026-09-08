import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const captureSource = await readFile(new URL('../1ststep-extension/generic-capture.js', import.meta.url), 'utf8');
const funnelSource = await readFile(new URL('../funnel.html', import.meta.url), 'utf8');

async function capture(page) {
  return page.evaluate(source => (0, eval)(source), captureSource);
}

async function load(page, url, body) {
  await page.route(url, route => route.fulfill({ status: 200, contentType: 'text/html', body }));
  await page.goto(url);
}

test('prefers JobPosting structured data and strips description markup', async ({ page }) => {
  await load(page, 'https://careers.example.test/jobs/123', `
    <h1>Fallback title</h1>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Senior Buyer',
      hiringOrganization: { '@type': 'Organization', name: 'Example Supply' },
      description: `<p>Lead strategic sourcing and supplier reviews.</p><p>${'Verified responsibilities. '.repeat(10)}</p>`,
    })}</script>`);
  const result = await capture(page);
  expect(result.jobTitle).toBe('Senior Buyer');
  expect(result.company).toBe('Example Supply');
  expect(result.jobDescription).toContain('Lead strategic sourcing');
  expect(result.jobDescription).not.toContain('<p>');
  expect(result.captureMethod).toBe('structured-job-posting');
});

test('captures a visible job container without site-specific selectors', async ({ page }) => {
  await load(page, 'https://jobs.example.test/opening/abc', `
    <title>Operations Lead — Careers</title>
    <meta property="og:site_name" content="Example Company">
    <h1>Operations Lead</h1>
    <section class="job-description">${'Own operational planning and cross-functional delivery. '.repeat(12)}</section>`);
  const result = await capture(page);
  expect(result.jobTitle).toBe('Operations Lead');
  expect(result.company).toBe('Example Company');
  expect(result.jobDescription.length).toBeGreaterThan(120);
  expect(result.captureMethod).toBe('visible-page');
});

test('extracts current Greenhouse Remix job data instead of the application form', async ({ page }) => {
  const description = `<p><strong>Your Impact</strong></p><p>${'Build trusted health-system partnerships and lead enterprise sales cycles. '.repeat(8)}</p>`;
  const remix = { state: { loaderData: { jobRoute: { jobPost: {
    post_type: 'job_post', title: 'Account Director, Health Systems', company_name: 'Zocdoc', content: description,
  } } } } };
  await load(page, 'https://job-boards.greenhouse.io/zocdoc/jobs/8074626', `
    <title>Job Application for Account Director, Health Systems at Zocdoc</title>
    <meta property="og:title" content="Account Director, Health Systems">
    <main class="job-post"><h2>Apply for this job</h2><form>
      <label>First Name<input></label><label>Last Name<input></label><label>Resume/CV<input type="file"></label>
      <label>Veteran Status<select></select></label><h3>Demographic Questions</h3><button>Submit application</button>
    </form></main><script>window.__remixContext = ${JSON.stringify(remix)};</script>`);
  const result = await capture(page);
  expect(result).toMatchObject({
    jobTitle: 'Account Director, Health Systems', company: 'Zocdoc', captureMethod: 'greenhouse-job-data',
  });
  expect(result.jobDescription).toContain('Build trusted health-system partnerships');
  expect(result.jobDescription).not.toContain('Demographic Questions');
  expect(result.jobDescription).not.toContain('Submit application');
});

test('fails closed when a job-like page contains only an application form', async ({ page }) => {
  await load(page, 'https://careers.example.test/jobs/123/apply', `
    <title>Apply for a role</title><main><h1>Apply for this job</h1><form>
      <label>First Name<input></label><label>Last Name<input></label><label>Resume/CV<input type="file"></label>
      <h2>Demographic Questions</h2><label>Veteran Status<select></select></label>
      <label>Disability Status<select></select></label><button>Submit application</button>
      <p>${'Application instructions only. '.repeat(12)}</p>
    </form></main>`);
  expect(await capture(page)).toBeNull();
});

test('rejects an unrelated long article', async ({ page }) => {
  await load(page, 'https://news.example.test/articles/market-update', `<title>Market update</title><h1>Market update</h1><article>${'General news copy. '.repeat(40)}</article>`);
  expect(await capture(page)).toBeNull();
});

test('legacy funnel fails clearly without inventing an output', async ({ page }) => {
  await load(page, 'https://app.1ststep.ai/funnel', funnelSource);
  await expect(page.getByRole('heading', { name: 'We couldn’t load that job.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Resume Builder' })).toBeVisible();
  await expect(page.getByText('Return to the job post and click 1stStep again')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/match score|weeks ahead|quarterly benchmarks/i);
});
