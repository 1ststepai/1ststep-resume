(() => {
  const MAX_DESCRIPTION_LENGTH = 50000;

  const clean = value => String(value == null ? '' : value)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const textFromHtml = value => {
    const holder = document.createElement('div');
    holder.innerHTML = String(value || '');
    return clean(holder.innerText || holder.textContent || '');
  };

  const findGreenhouseJob = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 8) return null;
    if (String(value.post_type || '').toLowerCase() === 'job_post' && value.title && value.content) return value;
    for (const child of Object.values(value)) {
      const found = findGreenhouseJob(child, depth + 1);
      if (found) return found;
    }
    return null;
  };

  const greenhouseJob = (() => {
    if (!/(?:^|\.)greenhouse\.io$/i.test(location.hostname)) return null;
    for (const script of document.querySelectorAll('script:not([src])')) {
      const source = script.textContent || '';
      const marker = source.match(/window\.__remixContext\s*=\s*/);
      if (!marker) continue;
      try {
        const context = JSON.parse(source.slice(marker.index + marker[0].length).trim().replace(/;\s*$/, ''));
        const job = findGreenhouseJob(context);
        if (job) return job;
      } catch (_) {}
    }
    return null;
  })();

  const isApplicationHeavy = (element, text) => {
    const markers = [
      /apply for this job/i, /first name/i, /last name/i, /resume\s*\/\s*cv/i,
      /submit application/i, /demographic questions/i, /veteran status/i, /disability status/i,
    ].filter(pattern => pattern.test(text)).length;
    const controls = element.querySelectorAll?.('input, select, textarea, button').length || 0;
    return markers >= 4 && controls >= 3;
  };

  const firstText = selectors => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = element?.content || element?.innerText || element?.textContent || '';
      if (clean(value)) return clean(value);
    }
    return '';
  };

  const valuesByType = (value, output = []) => {
    if (!value || typeof value !== 'object') return output;
    if (Array.isArray(value)) {
      value.forEach(item => valuesByType(item, output));
      return output;
    }
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some(type => String(type || '').toLowerCase() === 'jobposting')) output.push(value);
    Object.values(value).forEach(item => valuesByType(item, output));
    return output;
  };

  const structuredJobs = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { valuesByType(JSON.parse(script.textContent || ''), structuredJobs); } catch (_) {}
  }
  const structured = structuredJobs
    .sort((left, right) => textFromHtml(right.description).length - textFromHtml(left.description).length)[0] || null;

  const explicitDescription = document.querySelector([
    '[data-testid*="job-description" i]', '[data-test*="job-description" i]',
    '[class*="job-description" i]', '[id*="job-description" i]',
    '[class*="jobDescription"]', '[id*="jobDescription"]',
  ].join(','));
  const jobPageSignal = Boolean(structured || explicitDescription || /(?:job|career|position|vacan|opening|apply)/i.test(`${location.pathname} ${document.title}`));

  const structuredDescription = structured ? textFromHtml(structured.description) : '';
  const greenhouseDescription = greenhouseJob ? textFromHtml(greenhouseJob.content) : '';
  const descriptionCandidates = [
    ...[
      '[data-testid*="job-description" i]', '[data-test*="job-description" i]',
      '[class*="job-description" i]', '[id*="job-description" i]',
      '[class*="jobDescription"]', '[id*="jobDescription"]',
      'article', 'main', '[role="main"]',
    ].flatMap(selector => [...document.querySelectorAll(selector)].map(element => ({
      element,
      text: clean(element.innerText || element.textContent || ''),
    }))),
  ].filter(candidate => candidate.text.length >= 120 && !isApplicationHeavy(candidate.element, candidate.text));

  const jobDescription = (structuredDescription.length >= 120
    ? structuredDescription
    : greenhouseDescription.length >= 120
      ? greenhouseDescription
      : descriptionCandidates.sort((left, right) => right.text.length - left.text.length)[0]?.text || '').slice(0, MAX_DESCRIPTION_LENGTH);
  const structuredTitle = clean(structured?.title || structured?.name || '');
  const pageTitle = firstText(['h1', '[data-testid*="job-title" i]', '[class*="job-title" i]', 'meta[property="og:title"]']);
  const documentTitle = clean(document.title).replace(/\s+[|–—-]\s+(?:careers?|jobs?|apply|linkedin|indeed).*$/i, '');
  const jobTitle = structuredTitle || clean(greenhouseJob?.title) || pageTitle || documentTitle;

  const organization = structured?.hiringOrganization;
  const company = clean(
    (typeof organization === 'string' ? organization : organization?.name) ||
    greenhouseJob?.company_name ||
    firstText(['[data-testid*="company" i]', '[class*="company-name" i]', '[class*="companyName"]', 'meta[property="og:site_name"]'])
  );

  const url = String(location.href || '');
  if (!/^https?:\/\//i.test(url) || !jobPageSignal || !jobTitle || jobDescription.length < 120) return null;

  return {
    jobTitle: jobTitle.slice(0, 300),
    company: company.slice(0, 300),
    jobDescription,
    applyUrl: url.slice(0, 4000),
    site: String(location.hostname || 'job-page').replace(/^www\./, '').slice(0, 200),
    captureMethod: structured ? 'structured-job-posting' : greenhouseJob ? 'greenhouse-job-data' : 'visible-page',
  };
})();
