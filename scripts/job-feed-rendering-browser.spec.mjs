import { test, expect } from '@playwright/test';

test('job cards treat provider fields as text and attach no inline handlers', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('http://127.0.0.1:4175/app/resume');

  const result = await page.evaluate(() => {
    window.__jobFeedExecuted = 0;
    const raw = {
      job_id: "x');window.__jobFeedExecuted=1;//",
      job_title: '<img src=x onerror="window.__jobFeedExecuted=2">',
      employer_name: '</button><script>window.__jobFeedExecuted=3</script>',
      job_description: 'Remote role',
      job_apply_link: 'javascript:window.__jobFeedExecuted=4',
      apply_options: [{ publisher: 'Indeed', apply_link: 'data:text/html,pwned', is_direct: true }],
    };
    const job = normaliseMuseJob(raw);
    window._jobResults = [job];
    const card = buildJobCard(job);
    document.body.append(card);
    card.click();
    return {
      id: job.id,
      redirectUrl: job.redirect_url,
      indeedUrl: job.indeed_url,
      inlineHandlers: card.querySelectorAll('[onclick],[onerror],[onchange]').length,
      title: card.querySelector('.job-title')?.textContent,
      company: card.querySelector('.job-company')?.textContent,
      links: [...card.querySelectorAll('a')].map(link => link.href),
      executed: window.__jobFeedExecuted,
    };
  });

  expect(result.id).toMatch(/^job_[0-9a-f-]{36}$/i);
  expect(result.redirectUrl).toBe('');
  expect(result.indeedUrl).toBe('');
  expect(result.inlineHandlers).toBe(0);
  expect(result.links).toEqual([]);
  expect(result.executed).toBe(0);
  expect(result.title).toContain('<img');
  expect(result.company).toContain('<script>');
});

test('job cards retain validated identifiers and HTTPS destinations', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('http://127.0.0.1:4175/app/resume');
  const result = await page.evaluate(() => {
    const job = normaliseMuseJob({ job_id: 'provider_job-123:=', job_title: 'Engineer', job_apply_link: 'https://jobs.example.com/role?x=1' });
    const card = buildJobCard(job);
    return { id: job.id, href: card.querySelector('.btn-view-job')?.href, inlineHandlers: card.querySelectorAll('[onclick]').length };
  });
  expect(result).toEqual({ id: 'provider_job-123:=', href: 'https://jobs.example.com/role?x=1', inlineHandlers: 0 });
});
