const GENERIC_ROLE_QUALIFIERS = new Set([
  'manager', 'management', 'director', 'lead', 'leader', 'head', 'senior', 'sr', 'junior', 'jr',
  'principal', 'staff', 'associate', 'specialist', 'officer', 'vice', 'president', 'vp',
]);

export const JOB_RELEVANCE_POLICY_VERSION = 'title-family-v1';

function text(value) {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function roleTerms(role) {
  return text(role).toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2 && !['and', 'the', 'job', 'jobs', 'role', 'roles', 'remote'].includes(term));
}

function expandedRoleTerms(role) {
  const requested = roleTerms(role);
  const expanded = new Set(requested);
  const familyTerms = {
    procurement: ['procurement', 'purchasing', 'buyer', 'sourcing', 'category'],
    buyer: ['buyer', 'procurement', 'purchasing', 'sourcing', 'category'],
    purchasing: ['purchasing', 'procurement', 'buyer', 'sourcing'],
    sourcing: ['sourcing', 'procurement', 'buyer', 'purchasing', 'category'],
  };
  for (const term of requested) for (const synonym of familyTerms[term] || []) expanded.add(synonym);
  return [...expanded];
}

function roleRequestMatches(title, role) {
  const requested = roleTerms(role);
  if (!requested.length) return false;
  const procurementFamily = requested.some(term => ['procurement', 'buyer', 'purchasing', 'sourcing'].includes(term));
  if (procurementFamily) return expandedRoleTerms(role).filter(term => !GENERIC_ROLE_QUALIFIERS.has(term)).some(term => title.includes(term));
  const functional = requested.filter(term => !GENERIC_ROLE_QUALIFIERS.has(term));
  const required = functional.length ? functional : requested;
  return required.length > 1 ? required.every(term => title.includes(term)) : required.some(term => title.includes(term));
}

export function jobTitleMatchesMission(job, mission = {}) {
  const title = text(job?.title).toLowerCase();
  if (!title) return false;
  const requestedRoles = [...new Set([mission.role, ...(Array.isArray(mission.roleFamilies) ? mission.roleFamilies : [])].map(text).filter(Boolean))];
  if (requestedRoles.length && !requestedRoles.some(role => roleRequestMatches(title, role))) return false;
  if ((mission.excludedRoleFamilies || []).some(excluded => expandedRoleTerms(excluded).some(term => title.includes(term)))) return false;
  return true;
}

export function restoredJobCardIsRelevant(role, mission = {}) {
  const status = text(role?.status) || 'Found';
  if (status !== 'Found') return true;
  return jobTitleMatchesMission(role, mission);
}
