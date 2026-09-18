import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const captureScript = fileURLToPath(new URL('../1ststep-extension/job-capture.js', import.meta.url));

async function extract(page, html, url = 'https://careers.example.com/jobs/ops-123') {
  await page.route(url, route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto(url);
  await page.addScriptTag({ path: captureScript });
  return page.evaluate(() => globalThis.__firstStepExtractJob());
}

test('captures a structured job posting without form values', async ({ page }) => {
  const secret = 'PRIVATE-CANDIDATE-ANSWER-9274';
  const job = await extract(page, `
    <title>Operations Lead | Example Careers</title>
    <link rel="canonical" href="https://careers.example.com/jobs/ops-123">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Operations Lead',
      hiringOrganization: { '@type': 'Organization', name: 'Example Industries' },
      description: `<p>Lead operational planning, reporting, vendor coordination, and continuous improvement across a growing team.</p><p>${'Clear responsibilities and qualifications. '.repeat(8)}</p>`,
      identifier: { value: 'OPS-123' }, datePosted: '2026-09-08', employmentType: 'FULL_TIME',
      jobLocation: { address: { addressLocality: 'Newark', addressRegion: 'NJ', addressCountry: 'US' } },
      baseSalary: { currency: 'USD', value: { minValue: 100000, maxValue: 125000, unitText: 'YEAR' } },
    })}</script>
    <form><label>Private answer<input value="${secret}"></label><textarea>${secret}</textarea></form>
  `);

  expect(job).toMatchObject({
    jobTitle: 'Operations Lead', company: 'Example Industries', jobId: 'OPS-123',
    location: 'Newark, NJ, US', salary: 'USD 100000-125000 YEAR', employmentType: 'FULL_TIME',
    postedDate: '2026-09-08', applyUrl: 'https://careers.example.com/jobs/ops-123',
  });
  expect(JSON.stringify(job)).not.toContain(secret);
});

test('captures a generic complete posting after the user invokes it', async ({ page }) => {
  const description = 'Own project delivery, stakeholder communication, reporting, and process improvement. '.repeat(8);
  const job = await extract(page, `
    <title>Project Coordinator Job</title>
    <meta property="og:site_name" content="Northwind Logistics">
    <main><h1>Project Coordinator</h1><section class="job-description">${description}</section></main>
  `, 'https://jobs.example.org/openings/project-coordinator');
  expect(job.jobTitle).toBe('Project Coordinator');
  expect(job.company).toBe('Northwind Logistics');
  expect(job.jobDescription.length).toBeGreaterThan(200);
});

test('rejects a normal page that is not a complete job posting', async ({ page }) => {
  const result = await extract(page, '<title>About us</title><main><h1>Our company</h1><p>Welcome to our website.</p></main>', 'https://example.com/about');
  expect(result).toBeNull();
});
