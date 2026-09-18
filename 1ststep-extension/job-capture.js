/** User-invoked, value-free job-page capture. No form values are read. */
(function () {
  if (globalThis.__firstStepJobCaptureInstalled) return;
  globalThis.__firstStepJobCaptureInstalled = true;

  const clean = (value, limit = 50_000) => String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit);

  function textFromHtml(value) {
    const node = document.createElement('div');
    node.innerHTML = String(value || '');
    return clean(node.textContent || '');
  }

  function jobPosting(value) {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (const item of value) { const found = jobPosting(item); if (found) return found; }
      return null;
    }
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some(type => String(type || '').toLowerCase() === 'jobposting')) return value;
    return jobPosting(value['@graph']);
  }

  function structuredJob() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { const found = jobPosting(JSON.parse(script.textContent || 'null')); if (found) return found; } catch (_) {}
    }
    return null;
  }

  function firstText(selectors, limit) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = clean(element?.innerText || element?.textContent || '', limit);
      if (value) return value;
    }
    return '';
  }

  function organizationName(value) {
    if (typeof value === 'string') return clean(value, 160);
    return clean(value?.name || '', 160);
  }

  function locationText(value) {
    const places = Array.isArray(value) ? value : value ? [value] : [];
    return clean(places.map(place => {
      if (typeof place === 'string') return place;
      const address = place?.address || place;
      return [address?.addressLocality, address?.addressRegion, address?.addressCountry?.name || address?.addressCountry]
        .filter(Boolean).join(', ');
    }).filter(Boolean).join(' · '), 240);
  }

  function salaryText(value) {
    if (!value || typeof value !== 'object') return '';
    const amount = value.value || value;
    const range = amount.minValue && amount.maxValue ? `${amount.minValue}-${amount.maxValue}` : amount.value || amount.minValue || amount.maxValue || '';
    return clean([value.currency, range, amount.unitText].filter(Boolean).join(' '), 160);
  }

  function pageLooksLikeJob(structured, description) {
    if (structured) return true;
    const signal = `${document.title} ${location.pathname} ${description.slice(0, 2_000)}`;
    return /\b(job|jobs|career|careers|position|role|apply|employment|responsibilities|qualifications)\b/i.test(signal);
  }

  function extractJob() {
    const structured = structuredJob();
    const title = clean(structured?.title, 240) || firstText([
      '[itemprop="title"]', '[data-testid*="job-title" i]', '[class*="job-title" i]',
      '[class*="jobTitle"]', 'main h1', 'article h1', 'h1'
    ], 240);
    const company = organizationName(structured?.hiringOrganization) || firstText([
      '[itemprop="hiringOrganization"] [itemprop="name"]', '[itemprop="hiringOrganization"]',
      '[data-testid*="company" i]', '[class*="company-name" i]', '[class*="companyName"]'
    ], 160) || clean(document.querySelector('meta[property="og:site_name"]')?.content, 160);
    const description = textFromHtml(structured?.description) || firstText([
      '[itemprop="description"]', '[data-testid*="job-description" i]', '#job-description',
      '#jobDescription', '.job-description', '.jobDescription', '[class*="job-description" i]',
      '[class*="jobDescription"]', 'main', 'article'
    ], 50_000);

    if (!title || description.length < 200 || !pageLooksLikeJob(structured, description)) return null;
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const applyUrl = /^https?:/i.test(canonical || '') ? canonical : location.href;
    return {
      site: 'job-page',
      sourceLabel: location.hostname.replace(/^www\./i, ''),
      jobId: clean(structured?.identifier?.value || structured?.identifier || '', 160),
      jobTitle: title,
      company,
      jobDescription: description,
      location: locationText(structured?.jobLocation) || clean(structured?.jobLocationType, 160),
      salary: salaryText(structured?.baseSalary),
      employmentType: clean(Array.isArray(structured?.employmentType) ? structured.employmentType.join(', ') : structured?.employmentType, 160),
      postedDate: clean(structured?.datePosted, 40),
      applyUrl,
    };
  }

  globalThis.__firstStepExtractJob = extractJob;
  if (globalThis.chrome?.runtime?.onMessage) chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action !== 'CAPTURE_JOB_PAGE') return false;
    sendResponse({ success: true, job: extractJob() });
    return false;
  });
})();
