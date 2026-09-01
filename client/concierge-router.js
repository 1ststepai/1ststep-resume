const JOB_TERMS = /\b(job|jobs|career|careers|resume|résumé|cv|cover letter|application|apply|interview|linkedin|salary|compensation|remote|hybrid|onsite|recruiter|employer|workday|greenhouse|lever|position|role|approval|batch|desk|pipeline|overnight|continue|prepare|skip|exclude|receipt|follow-up|onboarding|readiness|autonomy)\b/i;
const UNSAFE_TERMS = /\b(password|passcode|one[- ]?time code|otp|captcha|security answer|bypass|hack|credential|steal|exploit|malware|phish)\b/i;
const PROTECTED_RANKING = /\b(rank|filter|exclude|prefer|avoid)\b[\s\S]{0,50}\b(age|race|religion|gender|sex|pregnan|disabilit|ethnic|national origin|marital status)\b/i;

export function classifyConciergeMessage(input) {
  const text = String(input || '').trim();
  if (!text) return { kind: 'empty' };
  if (UNSAFE_TERMS.test(text)) return { kind: 'blocked', reason: 'credentials' };
  if (PROTECTED_RANKING.test(text)) return { kind: 'blocked', reason: 'protected-trait' };
  if (!JOB_TERMS.test(text)) return { kind: 'off-topic' };
  return { kind: 'job' };
}

export function parseMission(input, prior = {}) {
  const text = String(input || '').trim();
  const countMatch = text.match(/\b(\d{1,3})\b(?=[^.!?]{0,140}\b(?:jobs?|roles?|positions?|applications?)\b)/i);
  const salaryMatch = text.match(/(?:\$\s*)(\d{2,3})(?:\s*(k|,?000))?|\b(\d{2,3})\s*k\s*(?:\+|minimum|min|or more|and up)?/i);
  const roleMatch = text.match(/\b(?:find|search(?:\s+for)?|look(?:\s+for)?|need|want|as|for)\s+(?:me\s+)?(?:\d+\s+)?(.+?)\s+(?:jobs?|roles?|positions?|applications?)\b/i);
  const locationMatch = text.match(/\b(?:in|near|around|within)\s+([A-Z][A-Za-z .'-]{2,35})(?:,\s*([A-Z]{2}))?(?:[,.]|\s+(?:with|at|for|paying|salary)|$)/);
  const excludeMatch = text.match(/\b(?:skip|exclude|avoid)\s+(.+?)\s+(?:roles?|jobs?|positions?)\b/i);
  const prepareMatch = text.match(/\bprepare\s+(?:the\s+)?(?:strongest\s+)?(\d{1,2})\b/i);
  const recurringMatch = text.match(/\b(\d{1,2})\s+(?:jobs?|applications?)\s+(?:every|per)\s+day\b/i);
  const deadlineMatch = text.match(/\bby\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))(?=\s|$|[,!?])/i);
  const salaryNumber = salaryMatch ? Number(salaryMatch[1] || salaryMatch[3]) : 0;
  const parsedSalary = salaryMatch ? salaryNumber * ((salaryMatch[2] || '').toLowerCase() === 'k' || salaryNumber < 1000 ? 1000 : 1) : prior.salaryMin || null;
  const employmentTypes = [];
  if (/\bfull[- ]?time\b/i.test(text)) employmentTypes.push('Full-time');
  if (/\bpart[- ]?time\b/i.test(text)) employmentTypes.push('Part-time');
  if (/\b(?:contract|contractor|freelance)\b/i.test(text)) employmentTypes.push('Contract');
  if (/\b(?:temporary|temp)\b/i.test(text)) employmentTypes.push('Temporary');
  if (/\b(?:internship|intern)\b/i.test(text)) employmentTypes.push('Internship');
  if (/\bseasonal\b/i.test(text)) employmentTypes.push('Seasonal');
  const parsedRole = roleMatch ? roleMatch[1]
    .replace(/^(?:a|an|the|me)\s+/i, '')
    .replace(/\b(?:remote|hybrid|on[- ]?site|onsite|in[- ]?office)\b/gi, ' ')
    .replace(/\b(?:full[- ]?time|part[- ]?time|contract(?:or)?|freelance|temporary|temp|internship|seasonal)\b/gi, ' ')
    .replace(/\b(?:or|and)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() : '';
  const asRoleMatch = text.match(/\bas\s+(?:(?:a|an)\s+)?([A-Za-z][A-Za-z0-9 /&+-]{1,80}?)(?:[,.]|$)/i);
  const workModes = [];
  if (/\bremote\b/i.test(text)) workModes.push('Remote');
  if (/\bhybrid\b/i.test(text)) workModes.push('Hybrid');
  if (/\b(?:onsite|on-site|on site|in[- ]office|in the office|office-based)\b/i.test(text)) workModes.push('On-site');
  const normalizedWorkModes = workModes.length ? [...new Set(workModes)]
    : prior.workModes?.length ? prior.workModes
      : prior.workMode && prior.workMode !== 'Flexible' ? [prior.workMode] : ['Any'];
  const workMode = normalizedWorkModes.length > 1 ? 'Flexible' : normalizedWorkModes[0];

  return {
    target: Math.min(50, Math.max(1, countMatch ? Number(countMatch[1]) : prior.target || 10)),
    workMode,
    workModes: normalizedWorkModes,
    employmentTypes: employmentTypes.length ? [...new Set(employmentTypes)] : prior.employmentTypes?.length ? prior.employmentTypes : ['Full-time'],
    salaryMin: parsedSalary,
    role: parsedRole || asRoleMatch?.[1]?.trim() || prior.role || '',
    location: locationMatch ? [locationMatch[1].trim(), locationMatch[2]].filter(Boolean).join(', ') : prior.location || '',
    excludedRoleFamilies: excludeMatch
      ? [...new Set([...(prior.excludedRoleFamilies || []), excludeMatch[1].trim()])]
      : prior.excludedRoleFamilies || [],
    prepareCount: prepareMatch ? Number(prepareMatch[1]) : prior.prepareCount || null,
    recurringDailyTarget: recurringMatch ? Number(recurringMatch[1]) : prior.recurringDailyTarget || null,
    runMode: /\bcontinue\s+overnight\b/i.test(text) ? 'overnight-requested' : prior.runMode || 'interactive',
    deadline: deadlineMatch ? deadlineMatch[1] : prior.deadline || '',
  };
}

export function missionGaps(mission, hasResume) {
  const gaps = [];
  if (!hasResume) gaps.push('a saved resume');
  if (!mission.role) gaps.push('target role or job title');
  const workModes = mission.workModes?.length ? mission.workModes : mission.workMode ? [mission.workMode] : [];
  if (!workModes.length) gaps.push('remote, hybrid, on-site, or any-location preference');
  if (workModes.some(mode => ['Hybrid', 'On-site'].includes(mode)) && !mission.location) gaps.push('city or commuting area for hybrid/on-site roles');
  if (!Array.isArray(mission.employmentTypes) || !mission.employmentTypes.length) gaps.push('employment type');
  return gaps;
}

export function conciergeStateGuidance(input = {}) {
  const mission = input.mission || {};
  const counts = input.counts || {};
  const unresolved = Array.isArray(input.unresolved) ? input.unresolved : [];
  const openActions = Number(input.openActions) || 0;
  const target = Number(mission.target) || 0;
  const submitted = Number(counts.Submitted) || 0;
  if (openActions) return {
    priority: 'human-action',
    headline: `${openActions} application${openActions === 1 ? '' : 's'} need a quick human step.`,
    detail: 'Clear the targeted login, OTP, CAPTCHA, signature, or new-question blockers while the rest of the pipeline continues.',
    actions: [{ label: 'Review human actions', prompt: 'Show my human action queue' }, { label: 'Continue other jobs', prompt: 'Continue with the unblocked jobs' }],
  };
  if (!input.hasResume) return {
    priority: 'resume', headline: 'Let’s create your master resume first.',
    detail: 'Tell me your career story naturally, answer a short verified-facts interview, or upload an existing PDF, DOCX, or TXT file.',
    actions: [{ label: 'Tell me who I am', prompt: 'Let me tell you who I am and build my resume' }, { label: 'Guided questions', prompt: 'Build my resume with guided questions' }, { label: 'Upload resume', prompt: 'Upload my resume' }],
  };
  const missingMission = missionGaps(mission, true);
  if (missingMission.length) return {
    priority: 'mission', headline: `Your search needs ${missingMission[0]}.`,
    detail: `Add ${missingMission.join(', ')} so I can filter out weak or ineligible roles before packaging them.`,
    actions: [{ label: 'Complete mission', prompt: 'Help me complete my job mission' }, { label: 'Use smart defaults', prompt: 'Use remote roles at $100k minimum' }],
  };
  if (unresolved.length) return {
    priority: 'readiness', headline: `Your mission is set; ${unresolved.length} reusable application answer${unresolved.length === 1 ? '' : 's'} remain.`,
    detail: `The next unresolved item is ${unresolved[0].label}. Answer it once so matching forms can reuse it safely.`,
    actions: [{ label: 'Answer next question', prompt: 'Answer next application question' }, { label: 'Review mission', prompt: 'Review my current mission' }],
  };
  if ((counts.Verified || 0) > 0 || (counts['Verified - Package Preparation'] || 0) > 0) return {
    priority: 'packages', headline: 'Verified roles are waiting for resume packages.',
    detail: 'Generate and inspect the strongest role-specific resumes before anything reaches an approval or submission gate.',
    actions: [{ label: 'Prepare strongest roles', prompt: 'Prepare the strongest verified roles' }, { label: 'Open pipeline', prompt: 'Open the application pipeline' }],
  };
  if ((counts['Package Ready'] || 0) > 0 || (counts['Awaiting Approval'] || 0) > 0) return {
    priority: 'approval', headline: 'Application packages are ready for the next controlled step.',
    detail: 'Review the named employer-role pairs and any material exceptions before transmission.',
    actions: [{ label: 'Review ready packages', prompt: 'Review package-ready applications' }, { label: 'Open approvals', prompt: 'Open approval batches' }],
  };
  return {
    priority: 'discovery', headline: target ? `${submitted} of ${target} applications have authoritative receipts.` : 'Your foundation is ready for a focused search.',
    detail: 'Next I should discover direct-employer roles, verify the live Apply path, remove duplicates, and surface only eligible matches.',
    actions: [{ label: 'Find matching jobs', prompt: `Find ${Math.max(1, target - submitted || 10)} matching jobs` }, { label: 'Review mission', prompt: 'Review my current mission' }],
  };
}

export function buildSearchLinks(mission) {
  const modes = mission.workModes?.length ? mission.workModes : [mission.workMode];
  const terms = [mission.role, ...modes.filter(mode => mode && mode !== 'Any'), ...(mission.employmentTypes || []), mission.location].filter(Boolean).join(' ');
  const q = encodeURIComponent(terms || 'jobs');
  return [
    { label: 'Google Jobs', url: `https://www.google.com/search?q=${q}+jobs` },
    { label: 'LinkedIn', url: `https://www.linkedin.com/jobs/search/?keywords=${q}` },
    { label: 'Indeed', url: `https://www.indeed.com/jobs?q=${q}` },
    { label: 'Greenhouse employers', url: `https://www.google.com/search?q=site%3Aboards.greenhouse.io+${q}` },
    { label: 'Lever employers', url: `https://www.google.com/search?q=site%3Ajobs.lever.co+${q}` },
    { label: 'Workday employers', url: `https://www.google.com/search?q=site%3Amyworkdayjobs.com+${q}` },
  ];
}
