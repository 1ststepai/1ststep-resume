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

  // These selectors are read only after the user opens the extension. They
  // cover the major hosted ATS layouts without granting permanent access to
  // those sites or running an always-on content script.
  const ATS_PROFILES = [
    {
      id: 'workday', host: /(?:^|\.)myworkdayjobs\.com$/i,
      description: ['[data-automation-id="jobPostingDescription"]'],
      title: ['[data-automation-id="jobPostingHeader"] h2', '[data-automation-id="jobPostingHeader"] h1', 'h1'],
      company: ['[data-automation-id="companyName"]'],
      location: ['[data-automation-id="locations"]', '[data-automation-id="jobPostingLocation"]'],
    },
    {
      id: 'lever', host: /(?:^|\.)lever\.co$/i,
      description: ['[data-qa="job-description"]', '.posting-page .section-wrapper.page-full-width', '.posting-page .content'],
      title: ['.posting-headline h2', 'h1'],
      company: ['.posting-headline .company-name', 'meta[property="og:site_name"]'],
      location: ['.posting-categories .location', '[class*="location" i]'],
    },
    {
      id: 'ashby', host: /(?:^|\.)ashbyhq\.com$/i,
      description: ['[data-testid="job-posting-description"]', '[class*="job-posting-description" i]', '[class*="jobDescription"]'],
      title: ['[data-testid="job-posting-title"]', 'h1'],
      company: ['[data-testid="job-posting-company"]', 'meta[property="og:site_name"]'],
      location: ['[data-testid="job-posting-location"]', '[class*="location" i]'],
    },
    {
      id: 'smartrecruiters', host: /(?:^|\.)smartrecruiters\.com$/i,
      description: ['#st-jobDescription', '[data-test="job-ad-content"]', '.job-sections'],
      title: ['[data-test="job-title"]', '.job-title h1', 'h1'],
      company: ['[data-test="company-name"]', '.company-name', 'meta[property="og:site_name"]'],
      location: ['[data-test="job-location"]', '.job-location', '[class*="location" i]'],
    },
  ];
  const atsProfile = ATS_PROFILES.find(profile => profile.host.test(location.hostname)) || null;

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

  const longestVisibleText = selectors => selectors
    .flatMap(selector => [...document.querySelectorAll(selector)])
    .map(element => ({ element, text: clean(element.innerText || element.textContent || '') }))
    .filter(candidate => candidate.text.length >= 120 && !isApplicationHeavy(candidate.element, candidate.text))
    .sort((left, right) => right.text.length - left.text.length)[0]?.text || '';

  const structuredLocation = value => {
    const locations = Array.isArray(value?.jobLocation) ? value.jobLocation : [value?.jobLocation];
    const labels = locations.filter(Boolean).map(location => {
      const address = location?.address || location;
      return clean([
        address?.addressLocality,
        address?.addressRegion,
        address?.addressCountry?.name || address?.addressCountry,
      ].filter(Boolean).join(', '));
    }).filter(Boolean);
    if (/telecommute/i.test(String(value?.jobLocationType || ''))) labels.unshift('Remote');
    return [...new Set(labels)].join(' · ');
  };

  const structuredSalary = value => {
    const salary = value?.baseSalary;
    const amount = salary?.value || salary;
    if (!amount || typeof amount !== 'object') return clean(typeof amount === 'string' ? amount : '');
    const currency = clean(salary?.currency || value?.salaryCurrency || '');
    const minimum = Number(amount.minValue ?? amount.value ?? 0);
    const maximum = Number(amount.maxValue ?? 0);
    const unit = clean(amount.unitText || '');
    const range = minimum && maximum ? `${minimum}-${maximum}` : minimum ? String(minimum) : maximum ? `Up to ${maximum}` : '';
    return clean([currency, range, unit ? `per ${unit.toLowerCase()}` : ''].filter(Boolean).join(' '));
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

  const genericDescriptionSelectors = [
    '[data-testid*="job-description" i]', '[data-test*="job-description" i]',
    '[class*="job-description" i]', '[id*="job-description" i]',
    '[class*="jobDescription"]', '[id*="jobDescription"]',
  ];
  const explicitDescription = document.querySelector(genericDescriptionSelectors.join(','));
  const jobPageSignal = Boolean(structured || atsProfile || explicitDescription || /(?:job|career|position|vacan|opening|apply)/i.test(`${location.pathname} ${document.title}`));

  const structuredDescription = structured ? textFromHtml(structured.description) : '';
  const greenhouseDescription = greenhouseJob ? textFromHtml(greenhouseJob.content) : '';
  const atsDescription = atsProfile ? longestVisibleText(atsProfile.description) : '';
  const selectedDescription = clean(window.getSelection?.()?.toString?.() || '');
  const descriptionCandidates = [
    ...[
      ...genericDescriptionSelectors,
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
      : atsDescription.length >= 120
        ? atsDescription
        : selectedDescription.length >= 120
          ? selectedDescription
          : descriptionCandidates.sort((left, right) => right.text.length - left.text.length)[0]?.text || '').slice(0, MAX_DESCRIPTION_LENGTH);
  const structuredTitle = clean(structured?.title || structured?.name || '');
  const pageTitle = firstText([...(atsProfile?.title || []), 'h1', '[data-testid*="job-title" i]', '[class*="job-title" i]', 'meta[property="og:title"]']);
  const documentTitle = clean(document.title).replace(/\s+[|–—-]\s+(?:careers?|jobs?|apply|linkedin|indeed).*$/i, '');
  const jobTitle = structuredTitle || clean(greenhouseJob?.title) || pageTitle || documentTitle;

  const organization = structured?.hiringOrganization;
  const company = clean(
    (typeof organization === 'string' ? organization : organization?.name) ||
    greenhouseJob?.company_name ||
    firstText([...(atsProfile?.company || []), '[data-testid*="company" i]', '[class*="company-name" i]', '[class*="companyName"]', 'meta[property="og:site_name"]'])
  );
  const jobLocation = clean(structuredLocation(structured) || firstText(atsProfile?.location || []));
  const salaryText = clean(structuredSalary(structured));

  const url = String(location.href || '');
  if (!/^https?:\/\//i.test(url) || !jobPageSignal || !jobTitle || jobDescription.length < 120) return null;

  return {
    jobTitle: jobTitle.slice(0, 300),
    company: company.slice(0, 300),
    jobDescription,
    applyUrl: url.slice(0, 4000),
    site: String(location.hostname || 'job-page').replace(/^www\./, '').slice(0, 200),
    location: jobLocation.slice(0, 500),
    salaryText: salaryText.slice(0, 500),
    captureMethod: structured ? 'structured-job-posting'
      : greenhouseJob ? 'greenhouse-job-data'
        : atsDescription.length >= 120 ? `${atsProfile.id}-visible`
          : selectedDescription.length >= 120 ? 'selected-text'
            : 'visible-page',
  };
})();
