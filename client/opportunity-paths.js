import { evaluateCandidateFit } from './job-intelligence.js';

export const OPPORTUNITY_PATHS = Object.freeze([
  { id: 'customer-success', sector: 'business-revenue', label: 'Customer Success', searchRole: 'customer success manager', terms: ['customer success', 'customer experience', 'client success', 'account manager', 'implementation manager', 'onboarding manager'] },
  { id: 'sales', sector: 'business-revenue', label: 'Sales & Business Development', searchRole: 'account executive', terms: ['account executive', 'business development', 'sales development', 'sales manager', 'partnerships', 'revenue'] },
  { id: 'marketing', sector: 'business-revenue', label: 'Marketing & Growth', searchRole: 'marketing manager', terms: ['marketing manager', 'growth marketing', 'demand generation', 'content marketing', 'product marketing', 'digital marketing', 'brand manager'] },
  { id: 'operations', sector: 'operations-corporate', label: 'Operations & Project Delivery', searchRole: 'operations manager', terms: ['operations manager', 'business operations', 'project manager', 'program manager', 'project coordinator', 'operations analyst', 'pmo'] },
  { id: 'procurement', sector: 'operations-corporate', label: 'Procurement & Vendor Management', searchRole: 'procurement manager', terms: ['procurement', 'purchasing', 'strategic sourcing', 'sourcing manager', 'category manager', 'buyer', 'vendor manager', 'supplier manager'] },
  { id: 'people', sector: 'operations-corporate', label: 'People & Recruiting', searchRole: 'recruiter', terms: ['recruiter', 'talent acquisition', 'people operations', 'human resources', 'hr business partner', 'people partner'] },
  { id: 'finance', sector: 'operations-corporate', label: 'Finance & Accounting', searchRole: 'financial analyst', terms: ['financial analyst', 'finance manager', 'accountant', 'accounting manager', 'controller', 'fp&a', 'treasury'] },
  { id: 'legal-compliance', sector: 'operations-corporate', label: 'Legal, Compliance & Risk', searchRole: 'compliance analyst', terms: ['compliance analyst', 'compliance manager', 'risk analyst', 'regulatory affairs', 'legal operations', 'paralegal', 'contract manager', 'privacy analyst'] },
  { id: 'administration', sector: 'operations-corporate', label: 'Administrative Support', searchRole: 'executive assistant', terms: ['executive assistant', 'administrative assistant', 'office manager', 'operations coordinator', 'chief of staff'] },
  { id: 'technology', sector: 'technology-product', label: 'Software Engineering & IT', searchRole: 'software engineer', terms: ['software engineer', 'software developer', 'web developer', 'it manager', 'systems administrator', 'cybersecurity', 'cloud engineer', 'solutions engineer', 'devops'] },
  { id: 'data-ai', sector: 'technology-product', label: 'Data, Analytics & AI', searchRole: 'data analyst', terms: ['data analyst', 'data scientist', 'data engineer', 'business intelligence', 'machine learning engineer', 'ai engineer', 'ml engineer', 'analytics manager'] },
  { id: 'product-design', sector: 'technology-product', label: 'Product, UX & Design', searchRole: 'product manager', terms: ['product manager', 'product owner', 'product operations', 'product designer', 'ux designer', 'user experience', 'ui designer', 'service designer'] },
  { id: 'healthcare', sector: 'care-education', label: 'Healthcare & Clinical', searchRole: 'healthcare administrator', terms: ['registered nurse', 'nurse practitioner', 'licensed practical nurse', 'medical assistant', 'clinical research', 'healthcare administrator', 'patient care', 'care coordinator'] },
  { id: 'education-training', sector: 'care-education', label: 'Education, Training & Learning', searchRole: 'instructional designer', terms: ['teacher', 'instructor', 'curriculum', 'instructional designer', 'learning and development', 'training manager', 'corporate trainer', 'education coordinator'] },
  { id: 'supply-logistics', sector: 'industry-field', label: 'Supply Chain & Logistics', searchRole: 'supply chain manager', terms: ['supply chain', 'logistics manager', 'logistics coordinator', 'warehouse manager', 'transportation manager', 'inventory manager', 'distribution manager', 'fleet manager'] },
  { id: 'manufacturing-quality', sector: 'industry-field', label: 'Manufacturing & Quality', searchRole: 'manufacturing manager', terms: ['manufacturing manager', 'production supervisor', 'plant manager', 'quality engineer', 'quality manager', 'continuous improvement', 'lean manufacturing', 'process engineer'] },
  { id: 'construction-facilities', sector: 'industry-field', label: 'Construction, Trades & Facilities', searchRole: 'construction manager', terms: ['construction manager', 'construction estimator', 'project superintendent', 'facilities manager', 'maintenance technician', 'electrician', 'hvac technician', 'building engineer'] },
  { id: 'retail-hospitality', sector: 'industry-field', label: 'Retail, Hospitality & Service', searchRole: 'store manager', terms: ['store manager', 'retail operations', 'hotel manager', 'hospitality manager', 'restaurant manager', 'food and beverage', 'guest services', 'customer service supervisor'] },
  { id: 'public-nonprofit', sector: 'public-community', label: 'Government, Nonprofit & Community', searchRole: 'program officer', terms: ['program officer', 'grants manager', 'fundraising manager', 'community engagement', 'public administration', 'government affairs', 'nonprofit operations', 'social services'] },
]);

export const OPPORTUNITY_SECTORS = Object.freeze([
  { id: 'business-revenue', label: 'Business & Revenue' },
  { id: 'operations-corporate', label: 'Operations & Corporate' },
  { id: 'technology-product', label: 'Technology & Product' },
  { id: 'care-education', label: 'Healthcare & Education' },
  { id: 'industry-field', label: 'Industry & Field Work' },
  { id: 'public-community', label: 'Public & Community' },
]);

const clean = value => String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const stageIndex = stage => ['Applied', 'Response', 'Recruiter Screen', 'Hiring Manager Interview', 'Final Round', 'Offer'].indexOf(stage);
const hasAuthoritativeReceipt = outcome => outcome?.authoritativeReceiptVerified === true || outcome?.receipt?.authority === 'employer-side';

function outcomeEvidenceKey(outcome = {}) {
  const evidenceHash = String(outcome.evidenceHash || outcome.receipt?.evidenceHash || '').toLowerCase();
  if (/^[a-f0-9]{64}$/.test(evidenceHash)) return `receipt:${evidenceHash}`;
  const sessionId = String(outcome.applicationSessionId || outcome.sessionId || '');
  if (/^app_[A-Za-z0-9_-]{8,160}$/.test(sessionId)) return `session:${sessionId}`;
  return `legacy:${clean(`${outcome.employer || ''}|${outcome.title || outcome.jobTitle || ''}|${outcome.requisitionId || ''}|${outcome.receivedAt || outcome.occurredAt || ''}`)}`;
}

export function authoritativeOutcomesFromApplicationSessions(sessions = []) {
  return sessions.filter(session => session?.receipt?.authority === 'employer-side' && session?.id && session?.role?.title).map(session => {
    const interviewConfirmed = session.postSubmission?.status === 'INTERVIEW'
      || (session.timeline || []).some(event => event?.kind === 'INTERVIEW_CONFIRMED');
    return {
      applicationSessionId: session.id,
      employer: String(session.role.employer || '').slice(0, 160),
      title: String(session.role.title).slice(0, 200),
      requisitionId: String(session.role.requisitionId || '').slice(0, 160),
      stage: interviewConfirmed ? 'Recruiter Screen' : 'Applied',
      authoritativeReceiptVerified: true,
      evidenceHash: String(session.receipt.evidenceHash || '').toLowerCase(),
      receivedAt: session.receipt.receivedAt || null,
      outcomeSource: interviewConfirmed ? 'user-confirmed-interview' : 'authoritative-employer-receipt',
    };
  });
}

export function mergeAuthoritativeOutcomeEvidence(outcomes = [], sessions = []) {
  const merged = [...authoritativeOutcomesFromApplicationSessions(sessions), ...outcomes.filter(hasAuthoritativeReceipt)];
  const seen = new Set();
  return merged.filter(outcome => {
    const key = outcomeEvidenceKey(outcome);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function classifyOpportunityPath(input = {}) {
  const haystack = clean(`${input.title || input.jobTitle || ''} ${input.description || input.jobDescription || ''}`);
  if (!haystack) return null;
  return OPPORTUNITY_PATHS
    .map(path => ({ path, score: path.terms.reduce((total, term) => total + (haystack.includes(term) ? Math.max(2, term.split(' ').length) : 0), 0) }))
    .sort((left, right) => right.score - left.score)[0]?.score > 0
    ? OPPORTUNITY_PATHS.map(path => ({ path, score: path.terms.reduce((total, term) => total + (haystack.includes(term) ? Math.max(2, term.split(' ').length) : 0), 0) })).sort((left, right) => right.score - left.score)[0].path
    : null;
}

function profileSignal(path, profile = {}, resumeText = '') {
  const haystack = clean([
    ...(profile.skills || []), ...(profile.workHistory || []), ...(profile.prioritizedRoleFamilies || []), resumeText,
  ].join(' '));
  return path.terms.reduce((total, term) => total + (haystack.includes(term) ? Math.max(2, term.split(' ').length) : 0), 0);
}

export function suggestedOpportunityPaths(profile = {}, resumeText = '', limit = 4) {
  const ranked = OPPORTUNITY_PATHS
    .map(path => ({ ...path, profileSignal: profileSignal(path, profile, resumeText) }))
    .sort((left, right) => right.profileSignal - left.profileSignal || OPPORTUNITY_PATHS.findIndex(path => path.id === left.id) - OPPORTUNITY_PATHS.findIndex(path => path.id === right.id));
  const matching = ranked.filter(path => path.profileSignal > 0);
  const ordered = matching.length ? [...matching, ...ranked.filter(path => path.profileSignal === 0)] : ranked;
  return ordered.slice(0, Math.max(1, limit));
}

export function opportunityPathOutcomeEvidence(path, outcomes = [], { minimumDirectionalSample = 5, minimumReliableSample = 20 } = {}) {
  const pathOutcomes = outcomes.filter(outcome => hasAuthoritativeReceipt(outcome) && stageIndex(outcome.stage) >= 0).filter(outcome => {
    if (outcome.roleFamily) return clean(outcome.roleFamily) === path.id || clean(outcome.roleFamily) === clean(path.label);
    return classifyOpportunityPath(outcome)?.id === path.id;
  });
  const sampleSize = pathOutcomes.length;
  const screens = pathOutcomes.filter(outcome => stageIndex(outcome.stage) >= stageIndex('Recruiter Screen')).length;
  const offers = pathOutcomes.filter(outcome => stageIndex(outcome.stage) >= stageIndex('Offer')).length;
  const directional = sampleSize >= Math.max(5, Number(minimumDirectionalSample) || 5);
  const reliable = sampleSize >= Math.max(20, Number(minimumReliableSample) || 20);
  return {
    sampleSize, screens, offers,
    interviewRate: directional ? Math.round((screens / sampleSize) * 100) : null,
    offerRate: directional ? Math.round((offers / sampleSize) * 100) : null,
    outcomeConfidence: reliable ? 'reliable' : directional ? 'directional' : sampleSize ? 'early' : 'learning',
  };
}

export function rankOpportunityPaths({ jobs = [], supplyByPath = {}, outcomes = [], profile = {}, resumeText = '', minimumDirectionalSample = 5, minimumReliableSample = 20 } = {}) {
  const supplied = path => Math.max(0, Number(supplyByPath?.[path.id]) || 0);
  const maxSupply = Math.max(1, ...OPPORTUNITY_PATHS.map(path => supplied(path) || jobs.filter(job => classifyOpportunityPath(job)?.id === path.id).length));
  return OPPORTUNITY_PATHS.map(path => {
    const pathJobs = jobs.filter(job => classifyOpportunityPath(job)?.id === path.id);
    const scoredJobs = pathJobs.map(job => Number.isFinite(Number(job.fitScore))
      ? Number(job.fitScore)
      : evaluateCandidateFit(job, profile, { role: path.searchRole }).score);
    const qualified = scoredJobs.filter(score => score >= 70);
    const outcomeEvidence = opportunityPathOutcomeEvidence(path, outcomes, { minimumDirectionalSample, minimumReliableSample });
    const { sampleSize, screens, offers, interviewRate, offerRate, outcomeConfidence } = outcomeEvidence;
    const averageFit = scoredJobs.length ? Math.round(scoredJobs.reduce((sum, score) => sum + score, 0) / scoredJobs.length) : 0;
    const openings = supplied(path) || pathJobs.length;
    const supplyScore = openings / maxSupply;
    const fitSignal = averageFit ? averageFit / 100 : Math.min(1, profileSignal(path, profile, resumeText) / 10);
    const directional = outcomeConfidence === 'directional' || outcomeConfidence === 'reliable';
    const reliable = outcomeConfidence === 'reliable';
    const outcomeSignal = directional ? interviewRate / 100 : null;
    const rankScore = Math.round((outcomeSignal === null
      ? (fitSignal * .6) + (supplyScore * .4)
      : reliable
        ? (fitSignal * .5) + (supplyScore * .35) + (outcomeSignal * .15)
        : (fitSignal * .56) + (supplyScore * .39) + (outcomeSignal * .05)) * 100);
    return {
      ...path, rankScore, openings, verifiedOpeningsAnalyzed: pathJobs.length, qualifiedOpenings: qualified.length,
      averageFit, topFit: scoredJobs.length ? Math.max(...scoredJobs) : 0,
      sampleSize, screens, offers, interviewRate, offerRate,
      outcomeConfidence,
      evidence: { supply: 'current direct-employer feed scan', fit: 'confirmed profile and requisition requirements', outcomes: 'authoritative employer receipts plus user-confirmed interview outcomes only' },
    };
  }).filter(path => path.openings || path.profileSignal || profileSignal(path, profile, resumeText))
    .sort((left, right) => right.rankScore - left.rankScore || right.qualifiedOpenings - left.qualifiedOpenings || left.label.localeCompare(right.label));
}
