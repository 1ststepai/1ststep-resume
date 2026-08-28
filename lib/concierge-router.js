const JOB_TERMS = /\b(job|jobs|career|careers|resume|résumé|cover letter|application|apply|interview|linkedin|salary|compensation|remote|hybrid|onsite|recruiter|employer|workday|greenhouse|lever|position|role)\b/i;
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
  const countMatch = text.match(/\b(\d{1,3})\b(?=[^.!?]{0,60}\b(?:jobs?|applications?)\b)/i);
  const salaryMatch = text.match(/(?:\$\s*)(\d{2,3})(?:\s*(k|,?000))?|\b(\d{2,3})\s*k\s*(?:\+|minimum|min|or more|and up)?/i);
  const roleMatch = text.match(/(?:for|as|need|want)\s+(?:me\s+)?(?:\d+\s+)?(?:remote\s+|hybrid\s+|onsite\s+)?(.+?)\s+(?:jobs?|roles?|positions?|applications?)\b/i);
  const locationMatch = text.match(/\b(?:in|near|around|within)\s+([A-Z][A-Za-z .'-]{2,35})(?:[,.]|\s+(?:with|at|for|paying|salary)|$)/);
  const salaryNumber = salaryMatch ? Number(salaryMatch[1] || salaryMatch[3]) : 0;
  const parsedSalary = salaryMatch ? salaryNumber * ((salaryMatch[2] || '').toLowerCase() === 'k' || salaryNumber < 1000 ? 1000 : 1) : prior.salaryMin || null;

  return {
    target: Math.min(50, Math.max(1, countMatch ? Number(countMatch[1]) : prior.target || 10)),
    workMode: /\bremote\b/i.test(text) ? 'Remote' : /\bhybrid\b/i.test(text) ? 'Hybrid' : /\bonsite|on-site\b/i.test(text) ? 'On-site' : prior.workMode || '',
    salaryMin: parsedSalary,
    role: roleMatch ? roleMatch[1].replace(/^(?:a|an|the)\s+/i, '').trim() : prior.role || '',
    location: locationMatch ? locationMatch[1].trim() : prior.location || '',
  };
}

export function missionGaps(mission, hasResume) {
  const gaps = [];
  if (!hasResume) gaps.push('a saved resume');
  if (!mission.role) gaps.push('target role or job title');
  if (!mission.workMode) gaps.push('remote, hybrid, or on-site preference');
  if (!mission.salaryMin) gaps.push('minimum salary');
  return gaps;
}

export function buildSearchLinks(mission) {
  const terms = [mission.role, mission.workMode, mission.location].filter(Boolean).join(' ');
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
