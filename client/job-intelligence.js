const FIT_BANDS = Object.freeze([
  { min: 90, label: 'Exceptional Match' },
  { min: 80, label: 'Strong Match' },
  { min: 70, label: 'Viable Match' },
  { min: 60, label: 'Stretch' },
  { min: 0, label: 'Reject' },
]);

const ROLE_FAMILIES = Object.freeze({
  procurement: ['procurement', 'purchasing', 'strategic sourcing', 'sourcing', 'category management', 'category manager', 'buyer', 'supplier management', 'vendor management', 'commercial management', 'contracts management', 'supply chain'],
  technology: ['technology procurement', 'it procurement', 'software procurement', 'cloud procurement', 'saas procurement', 'vendor management'],
  operations: ['procurement operations', 'sourcing operations', 'supply chain operations', 'commercial operations'],
});

const STOP_WORDS = new Set(['and', 'the', 'with', 'for', 'that', 'this', 'from', 'your', 'you', 'our', 'will', 'are', 'job', 'role', 'years', 'year', 'experience', 'required', 'preferred']);

const NON_RANKABLE_SCREENING = Object.freeze([
  ['Protected-trait and optional-demographic information', /\b(?:race|racial|ethnicity|ethnic|color|religion|religious|sex|gender|pregnan(?:t|cy)|sexual orientation|gender identity|national origin|marital status|disability|disabled|genetic information|veteran status|veteran|pronouns?|age|\d{2}\s*years?(?:\s+old|\s+or older))\b/i],
  ['Work authorization, citizenship, sponsorship, export-control, and clearance screening', /\b(?:work authorization|employment authorization|authorized to work|(?:u\.?s\.?\s*)?citizen(?:ship)?|immigration|visa|sponsor(?:ship)?|security clearance|clearance|export[ -]?control(?: classification)?|itar(?: classification)?|u\.?s\.? person|export administration regulations?)\b/i],
  ['Criminal-history and background-screening information', /\b(?:criminal|criminal history|criminal record|conviction|convicted|arrest record|background check|consumer report)\b/i],
  ['Health, drug, and medical-screening information', /\b(?:drug test(?:ing)?|health screen(?:ing)?|medical exam(?:ination)?|medical screen(?:ing)?)\b/i],
  ['Referral information', /\b(?:employee referral|referral source|referred by|referrer|referral)\b/i],
  ['Restrictive-agreement and outside-employment information', /\b(?:restrictive agreement|non[ -]?compete|noncompetition|outside employment|moonlighting|conflict of interest)\b/i],
]);

const NON_RANKABLE_REDACTIONS = Object.freeze([
  /\b(?:race|racial|ethnicity|ethnic|color|religion|religious|sex|gender|pregnan(?:t|cy)|sexual orientation|gender identity|national origin|marital status|disability|disabled|genetic information|veteran status|veteran|pronouns?|age|\d{2}\s*years?(?:\s+old|\s+or older))\b/gi,
  /\b(?:work authorization|employment authorization|authorized to work|(?:u\.?s\.?\s*)?citizen(?:ship)?|immigration|visa|sponsor(?:ship)?|security clearance|clearance|export[ -]?control(?: classification)?|itar(?: classification)?|u\.?s\.? person|export administration regulations?)\b/gi,
  /\b(?:criminal|criminal history|criminal record|conviction|convicted|arrest record|background check|consumer report)\b/gi,
  /\b(?:drug test(?:ing)?|health screen(?:ing)?|medical exam(?:ination)?|medical screen(?:ing)?)\b/gi,
  /\b(?:employee referral|referral source|referred by|referrer|referral)\b/gi,
  /\b(?:restrictive agreement|non[ -]?compete|noncompetition|outside employment|moonlighting|conflict of interest)\b/gi,
]);

const clean = value => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const list = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value).split(/[;,\n]/).map(item => item.trim()).filter(Boolean);
const tokens = value => new Set(clean(value).toLowerCase().split(/[^a-z0-9+#.]+/).filter(term => term.length > 2 && !STOP_WORDS.has(term)));

function sentences(value) {
  const abbreviationMarker = '\u2024';
  return clean(value)
    .replace(/\bU\.S\./gi, match => match.replaceAll('.', abbreviationMarker))
    .split(/(?<=[.!?])\s+|\s*[•·]\s*|\n+/)
    .map(item => item.replaceAll(abbreviationMarker, '.').trim())
    .filter(item => item.length > 12);
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function nonRankableSignals(...values) {
  const source = values.flat(Infinity).map(value => clean(value)).filter(Boolean).join('\n');
  return NON_RANKABLE_SCREENING.filter(([, pattern]) => pattern.test(source)).map(([label]) => label);
}

function rankableText(value) {
  let output = clean(value);
  for (const pattern of NON_RANKABLE_REDACTIONS) output = output.replace(pattern, ' ');
  output = output.replace(/\b(?:must|shall|required to|ability to|willing(?:ness)? to)\s+(?:be|have|pass|complete|undergo|provide|disclose)\b/gi, ' ');
  return clean(output);
}

function rankableList(values) {
  return list(values).map(rankableText).filter(value => tokens(value).size > 0);
}

export function classifyFitScore(score) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  return FIT_BANDS.find(band => safeScore >= band.min)?.label || 'Reject';
}

export function extractStructuredRequirements(job = {}) {
  const description = clean(job.description || job.jobDescription);
  const rawLines = sentences(description);
  const screeningSignals = nonRankableSignals(rawLines);
  const lines = rawLines.map(rankableText).filter(Boolean);
  const required = lines.filter(line => /\b(required|must|minimum|you have|qualifications?)\b/i.test(line));
  const preferred = lines.filter(line => /\b(preferred|nice to have|ideally|bonus)\b/i.test(line));
  const responsibilities = lines.filter(line => /\b(responsib|you will|you’ll|own |lead |manage |develop |execute |partner )/i.test(line));
  const rankableDescription = lines.join(' ');
  const years = [...rankableDescription.matchAll(/\b(\d{1,2})\s*\+?\s*(?:to\s*\d{1,2}\s*)?years?\b/gi)].map(match => Number(match[1])).filter(value => value > 0 && value < 30);
  const technologies = unique(lines.flatMap(line => [...line.matchAll(/\b(SAP|Oracle|Coupa|Ariba|Workday|Salesforce|SQL|Excel|AWS|Azure|GCP|ERP|CRM|SaaS|Ivalua|Jaggaer)\b/gi)].map(match => match[1])));
  const leadership = lines.filter(line => /\b(lead|manage|mentor|director|people manager|cross-functional|stakeholder)\b/i.test(line));
  const education = lines.filter(line => /\b(bachelor|master|mba|degree|education)\b/i.test(line));
  const authorization = rawLines.filter(line => NON_RANKABLE_SCREENING[1][1].test(line));
  return {
    required: unique(required), preferred: unique(preferred), responsibilities: unique(responsibilities),
    yearsExperience: years.length ? Math.max(...years) : null,
    domainExperience: unique(lines.filter(line => /\b(procurement|sourcing|supplier|vendor|category|contract|commercial|supply chain)\b/i.test(line))),
    technology: technologies, leadership: unique(leadership), education: unique(education),
    location: clean(job.location || job.geographyEligibility) || 'Unknown',
    remoteRequirements: clean(job.workplaceType || job.remoteEligibility) || 'Unknown',
    travel: clean(job.travel) || 'Unknown', compensation: clean(job.salaryDisclosure) || 'Unknown',
    workAuthorization: unique(authorization), nonRankableScreening: screeningSignals, employmentType: clean(job.employmentType) || 'Unknown',
  };
}

function overlapScore(need, evidence) {
  const wanted = tokens(need);
  const known = tokens(evidence);
  if (!wanted.size) return .65;
  const matches = [...wanted].filter(term => known.has(term)).length;
  return Math.min(1, matches / Math.max(2, Math.min(8, wanted.size)));
}

function expandedCandidateTerms(profile = {}, mission = {}) {
  const raw = [rankableList(profile.skills), rankableList(profile.workHistory), rankableList(profile.prioritizedRoleFamilies), rankableList(mission.role), rankableList(mission.roleFamilies)].flat().join(' ');
  const expanded = new Set([...tokens(raw)]);
  for (const [family, terms] of Object.entries(ROLE_FAMILIES)) {
    if (terms.some(term => raw.toLowerCase().includes(term)) || raw.toLowerCase().includes(family)) terms.forEach(term => tokens(term).forEach(token => expanded.add(token)));
  }
  return [...expanded].join(' ');
}

export function evaluateCandidateFit(job = {}, profile = {}, mission = {}) {
  const requirements = job.requirements || extractStructuredRequirements(job);
  const evidence = expandedCandidateTerms(profile, mission);
  const rankableRequirements = {
    required: rankableList(requirements.required), preferred: rankableList(requirements.preferred),
    responsibilities: rankableList(requirements.responsibilities), domainExperience: rankableList(requirements.domainExperience),
    technology: rankableList(requirements.technology), leadership: rankableList(requirements.leadership), education: rankableList(requirements.education),
  };
  const rankableWorkHistory = rankableList(profile.workHistory).join(' ');
  const rankableEducation = rankableList(profile.education).join(' ');
  const titleAndWork = `${rankableText(job.title || '')} ${rankableRequirements.responsibilities.join(' ')} ${rankableRequirements.domainExperience.join(' ')}`;
  const hardDisqualifiers = [];
  const exclusions = list(profile.excludedEmployers).map(item => item.toLowerCase());
  if (exclusions.some(item => clean(job.employer).toLowerCase().includes(item))) hardDisqualifiers.push('Employer is excluded by confirmed preference');
  if (mission.salaryMin && job.salaryMax && Number(job.salaryMax) < Number(mission.salaryMin)) hardDisqualifiers.push('Maximum disclosed compensation is below the hard floor');
  const wantedModes = list(mission.workModes || mission.workMode);
  const listedMode = /hybrid/i.test(`${job.workplaceType} ${job.location}`) ? 'Hybrid' : job.remote === true || /remote/i.test(`${job.workplaceType} ${job.remoteEligibility}`) ? 'Remote' : 'On-site';
  if (wantedModes.length && !wantedModes.includes('Any') && !wantedModes.includes(listedMode)) hardDisqualifiers.push(`${listedMode} conflicts with the saved work-setting filter`);

  const components = {
    experienceAlignment: Math.round(overlapScore(rankableRequirements.required.join(' '), `${evidence} ${rankableWorkHistory}`) * 18),
    functionalAlignment: Math.round(overlapScore(titleAndWork, evidence) * 20),
    industryTransferability: Math.round(overlapScore(rankableRequirements.domainExperience.join(' '), evidence) * 10),
    seniority: /\b(?:director|vice president|vp|head of)\b/i.test(rankableText(job.title || '')) && !/\b(?:director|head|lead|manager)\b/i.test(evidence) ? 3 : 10,
    technologyDomain: Math.round(overlapScore(rankableRequirements.technology.join(' '), evidence) * 10),
    leadership: Math.round(overlapScore(rankableRequirements.leadership.join(' '), `${evidence} ${rankableWorkHistory}`) * 8),
    location: hardDisqualifiers.some(item => /work-setting/i.test(item)) ? 0 : 10,
    compensation: hardDisqualifiers.some(item => /compensation/i.test(item)) ? 0 : (job.salaryMax || job.salaryMin ? 7 : 4),
    education: rankableRequirements.education.length ? Math.round(overlapScore(rankableRequirements.education.join(' '), rankableEducation) * 4) : 4,
    screeningNeutral: 3,
  };
  let score = Object.values(components).reduce((sum, value) => sum + value, 0);
  if (hardDisqualifiers.length) score = Math.min(59, score);
  score = Math.max(0, Math.min(100, score));
  const classification = classifyFitScore(score);
  const credibleInterviewPath = score >= 70 && !hardDisqualifiers.length;
  const matchedEvidence = Object.entries(components).filter(([key, value]) => key !== 'screeningNeutral' && value > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([key]) => key.replace(/([A-Z])/g, ' $1').toLowerCase());
  const rationale = credibleInterviewPath
    ? `Credible interview path based on ${matchedEvidence.join(', ')}.`
    : hardDisqualifiers[0] || 'Insufficient verified alignment to justify application effort.';
  return {
    score, classification, credibleInterviewPath, hardDisqualifiers, components, matchedEvidence, rationale, requirements,
    notRankedSignals: [...new Set([
      ...(requirements.nonRankableScreening || []),
      ...(requirements.workAuthorization?.length ? ['Work authorization, citizenship, sponsorship, export-control, and clearance screening'] : []),
      ...nonRankableSignals(job.title, requirements.required, requirements.preferred, requirements.responsibilities, profile.skills, profile.workHistory, profile.education, profile.prioritizedRoleFamilies, mission.role, mission.roleFamilies),
    ])],
  };
}

export function descriptionSimilarity(left, right) {
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(term => b.has(term)).length;
  return intersection / (a.size + b.size - intersection);
}

export function publicJobsAreDuplicate(left = {}, right = {}) {
  const sameEmployer = clean(left.employer).toLowerCase() === clean(right.employer).toLowerCase();
  if (!sameEmployer) return false;
  const leftReq = clean(left.requisitionId).toLowerCase(); const rightReq = clean(right.requisitionId).toLowerCase();
  if (leftReq && rightReq && leftReq === rightReq) return true;
  const sameTitle = clean(left.title).toLowerCase() === clean(right.title).toLowerCase();
  const sameLocation = clean(left.location).toLowerCase() === clean(right.location).toLowerCase();
  return sameTitle && sameLocation && descriptionSimilarity(left.description || left.jobDescription, right.description || right.jobDescription) >= .72;
}

export function upsertHiringEcosystem(records = [], job = {}, checkedAt = new Date().toISOString()) {
  const key = `${clean(job.employer).toLowerCase()}|${clean(job.provider || job.sourceProvider).toLowerCase()}`;
  const record = {
    key, employer: clean(job.employer), ats: clean(job.provider || job.sourceProvider) || 'Unknown',
    careerUrl: clean(job.jobUrl || job.sourceUrl || job.applyUrl || job.directEmployerUrl),
    structuredDiscoveryMethod: clean(job.sourceEvidence) || 'Direct employer requisition',
    relevantDepartments: unique([...(job.requirements?.domainExperience || []), clean(job.title)]).slice(0, 8),
    lastChecked: checkedAt, matchingOpenRequisitions: unique([clean(job.requisitionId)]),
  };
  const existing = records.find(item => item.key === key);
  if (!existing) return [record, ...records];
  return records.map(item => item.key === key ? { ...item, ...record, matchingOpenRequisitions: unique([...(item.matchingOpenRequisitions || []), ...record.matchingOpenRequisitions]) } : item);
}

export function acquisitionFunnel(outcomes = []) {
  const stages = ['Applied', 'Response', 'Recruiter Screen', 'Hiring Manager Interview', 'Final Round', 'Offer'];
  const verified = outcomes.filter(item => item?.authoritativeReceiptVerified === true || item?.receipt?.authority === 'employer-side');
  const counts = Object.fromEntries(stages.map(stage => [stage, verified.filter(item => stages.indexOf(item.stage) >= stages.indexOf(stage)).length]));
  const applied = counts.Applied || 0;
  return { counts, verifiedSampleSize: applied, interviewYield: applied ? Number(((counts['Recruiter Screen'] / applied) * 100).toFixed(1)) : null, offerYield: applied ? Number(((counts.Offer / applied) * 100).toFixed(1)) : null };
}
