export const PIPELINE_STATUSES = Object.freeze([
  'Found',
  'Verified',
  'Package Ready',
  'Awaiting Approval',
  'Submitted',
  'Blocked',
]);

export const ACTION_TYPES = Object.freeze(['CAPTCHA', 'OTP', 'LOGIN', 'UPLOAD', 'SIGNATURE', 'NEW_QUESTION']);
export const AUTONOMY_LEVELS = Object.freeze(['prepare_only', 'autofill_review', 'auto_submit']);
export const FACT_SENSITIVITIES = Object.freeze(['standard', 'sensitive', 'highly-sensitive']);
export const FACT_VERIFICATION_STATES = Object.freeze(['unverified', 'user-confirmed', 'document-verified', 'expired']);

export const READINESS_FIELDS = Object.freeze([
  ['contact', 'Contact information'], ['address', 'Current address'], ['authorization', 'Work authorization'],
  ['sponsorship', 'Sponsorship requirement'], ['employment', 'Employment history'], ['education', 'Education history'],
  ['salary', 'Salary target and acceptable range'], ['startDate', 'Start-date or notice rule'], ['travel', 'Travel tolerance'],
  ['relocation', 'Relocation tolerance'], ['remoteGeography', 'Remote-work geography'], ['schedule', 'Schedule and time-zone availability'],
  ['outsideEmployment', 'Outside-employment and conflict policy'], ['licenses', 'Licenses and certifications'],
  ['driving', 'Driving requirement response'], ['background', 'Background-screening willingness'],
  ['drugHealth', 'Drug or health-screening willingness'], ['formerEmployerConflict', 'Former-employer, relative, government-client, and conflict answers'],
  ['references', 'References and contact permission'], ['recruiterContact', 'Recruiter communications preference'],
  ['accountCreation', 'Employer account-creation policy'], ['privacyTerms', 'Ordinary privacy-terms policy'],
  ['demographics', 'Optional demographic disclosure default'], ['exclusions', 'Excluded employers and role families'],
]);
export const DEMO_STAGES = Object.freeze([
  'Onboarding readiness', 'Mission created', 'Jobs discovered', 'Roles verified and deduplicated',
  'Documents QA passed', 'Routine questions auto-filled', 'Targeted exception queued',
  'Simulated receipt recorded', 'Interview follow-up prepared',
]);

const nextStatuses = Object.freeze({
  Found: ['Verified', 'Blocked'],
  Verified: ['Package Ready', 'Blocked'],
  'Package Ready': ['Awaiting Approval', 'Blocked'],
  'Awaiting Approval': ['Submitted', 'Blocked'],
  Blocked: ['Found', 'Verified', 'Package Ready', 'Awaiting Approval'],
  Submitted: [],
});

const asText = value => String(value ?? '').trim();
const asList = value => Array.isArray(value)
  ? value.map(asText).filter(Boolean)
  : asText(value).split(/[,\n]/).map(item => item.trim()).filter(Boolean);
const nowIso = value => value || new Date().toISOString();
const makeId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function createTruthProfile(input = {}) {
  return {
    workHistory: asList(input.workHistory),
    education: asList(input.education),
    skills: asList(input.skills),
    authorization: asText(input.authorization),
    sponsorship: asText(input.sponsorship),
    geography: asList(input.geography),
    salaryMin: Number(input.salaryMin) || null,
    salaryMax: Number(input.salaryMax) || null,
    travelTolerance: asText(input.travelTolerance),
    schedulePreferences: asList(input.schedulePreferences),
    timeZones: asList(input.timeZones),
    excludedEmployers: asList(input.excludedEmployers),
    prioritizedRoleFamilies: asList(input.prioritizedRoleFamilies),
    excludedRoleFamilies: asList(input.excludedRoleFamilies),
    outsideEmploymentConstraints: asList(input.outsideEmploymentConstraints),
    disclosureChoices: asList(input.disclosureChoices),
    explicitUnknowns: asList(input.explicitUnknowns),
    confirmedAt: asText(input.confirmedAt),
  };
}

export function truthProfileGaps(profile) {
  const p = createTruthProfile(profile);
  const gaps = [];
  if (!p.workHistory.length) gaps.push('work history');
  if (!p.education.length) gaps.push('education');
  if (!p.skills.length) gaps.push('skills');
  if (!p.authorization) gaps.push('work authorization');
  if (!p.geography.length) gaps.push('eligible geography');
  if (!p.salaryMin) gaps.push('minimum salary');
  if (!p.travelTolerance) gaps.push('travel tolerance');
  if (!p.schedulePreferences.length && !p.explicitUnknowns.some(item => /schedule/i.test(item))) gaps.push('schedule preference or explicit unknown');
  if (!p.disclosureChoices.length) gaps.push('disclosure choices');
  if (!p.confirmedAt) gaps.push('profile confirmation');
  return gaps;
}

export function normalizeEmployer(value) {
  return asText(value).toLowerCase().replace(/\b(incorporated|inc|llc|ltd|corporation|corp|company|co)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeTitle(value) {
  return asText(value).toLowerCase().replace(/\b(sr|senior)\.?\b/g, 'senior').replace(/\b(jr|junior)\.?\b/g, 'junior').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeJobUrl(value) {
  try {
    const url = new URL(asText(value));
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'source', 'ref', 'referrer'].forEach(key => url.searchParams.delete(key));
    return `${url.origin}${url.pathname.replace(/\/$/, '')}${url.searchParams.size ? `?${url.searchParams}` : ''}`.toLowerCase();
  } catch { return asText(value).toLowerCase().replace(/\/$/, ''); }
}

export function roleDedupeKey(role) {
  const employer = normalizeEmployer(role.employer);
  const title = normalizeTitle(role.title);
  const requisition = asText(role.requisitionId).toLowerCase();
  const url = normalizeJobUrl(role.directEmployerUrl || role.url);
  return requisition ? `${employer}|${title}|req:${requisition}` : `${employer}|${title}|url:${url}`;
}

export function createDeskState(input = {}) {
  return {
    version: 2,
    truthProfile: createTruthProfile(input.truthProfile),
    reusableFacts: Array.isArray(input.reusableFacts) ? input.reusableFacts : [],
    standingPolicies: Array.isArray(input.standingPolicies) ? input.standingPolicies : [],
    autonomy: {
      level: AUTONOMY_LEVELS.includes(input.autonomy?.level) ? input.autonomy.level : 'autofill_review',
      successfulAuditedApplications: Number(input.autonomy?.successfulAuditedApplications) || 0,
      updatedAt: asText(input.autonomy?.updatedAt),
    },
    demo: input.demo || null,
    readinessDraft: input.readinessDraft || null,
    roles: Array.isArray(input.roles) ? input.roles : [],
    approvalBatches: Array.isArray(input.approvalBatches) ? input.approvalBatches : [],
    actionQueue: Array.isArray(input.actionQueue) ? input.actionQueue : [],
    auditEvents: Array.isArray(input.auditEvents) ? input.auditEvents : [],
  };
}

function extractResumeSection(resumeText, headingPatterns) {
  const lines = asText(resumeText).split(/\r?\n/).map(line => line.trim());
  const start = lines.findIndex(line => headingPatterns.some(pattern => pattern.test(line)));
  if (start < 0) return '';
  const collected = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (collected.length && /^[A-Z][A-Z &/+-]{2,35}$/.test(line) && line.length < 40) break;
    if (line) collected.push(line);
    if (collected.join('\n').length > 2400) break;
  }
  return collected.join('\n').trim();
}

export function buildReadinessDraftFromSources(input = {}, at) {
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
  const truth = createTruthProfile(input.truthProfile);
  const resumeText = asText(input.resumeText);
  const proposals = [];
  const add = (fieldKey, value, source, sensitivity = 'standard', confidence = 1) => {
    if (!asText(value) || proposals.some(item => item.fieldKey === fieldKey)) return;
    const label = READINESS_FIELDS.find(([key]) => key === fieldKey)?.[1];
    if (label) proposals.push({ fieldKey, label, value: asText(value), source, sensitivity, confidence });
  };
  const fullName = [profile.firstName, profile.lastName].map(asText).filter(Boolean).join(' ');
  add('contact', [fullName, asText(profile.email), asText(profile.phone)].filter(Boolean).join(' · '), 'saved-profile', 'sensitive', 1);
  add('address', asText(profile.address), 'saved-profile', 'highly-sensitive', 1);
  add('employment', truth.workHistory.join('\n') || extractResumeSection(resumeText, [/^(?:professional )?experience$/i, /^employment(?: history)?$/i, /^work history$/i]), truth.workHistory.length ? 'confirmed-truth-profile' : 'saved-resume-section', 'standard', truth.workHistory.length ? 1 : .86);
  add('education', truth.education.join('\n') || extractResumeSection(resumeText, [/^education$/i, /^academic background$/i]), truth.education.length ? 'confirmed-truth-profile' : 'saved-resume-section', 'standard', truth.education.length ? 1 : .86);
  add('licenses', extractResumeSection(resumeText, [/^certifications?(?: & licenses)?$/i, /^licenses?(?: & certifications)?$/i]), 'saved-resume-section', 'standard', .86);
  add('authorization', truth.authorization, 'confirmed-truth-profile', 'sensitive', 1);
  add('sponsorship', truth.sponsorship, 'confirmed-truth-profile', 'sensitive', 1);
  add('salary', truth.salaryMin ? `${truth.salaryMin}${truth.salaryMax ? `-${truth.salaryMax}` : '+'}` : '', 'confirmed-truth-profile', 'sensitive', 1);
  add('travel', truth.travelTolerance, 'confirmed-truth-profile', 'standard', 1);
  add('remoteGeography', truth.geography.join(', '), 'confirmed-truth-profile', 'standard', 1);
  add('schedule', [...truth.schedulePreferences, ...truth.timeZones].join(', '), 'confirmed-truth-profile', 'standard', 1);
  add('outsideEmployment', truth.outsideEmploymentConstraints.join(', '), 'confirmed-truth-profile', 'sensitive', 1);
  add('demographics', truth.disclosureChoices.find(item => /demographic/i.test(item)), 'confirmed-truth-profile', 'sensitive', 1);
  add('exclusions', [...truth.excludedEmployers, ...truth.excludedRoleFamilies].join(', '), 'confirmed-truth-profile', 'standard', 1);
  return { id: makeId('readiness-draft'), proposals, createdAt: nowIso(at), status: 'pending', sources: [...new Set(proposals.map(item => item.source))] };
}

export function stageReadinessDraft(inputState, draft, at) {
  let state = createDeskState(inputState);
  if (!draft?.proposals?.length) throw new Error('No reusable facts were found in the saved resume or profile.');
  state = { ...state, readinessDraft: { ...draft, status: 'pending' } };
  return audit(state, 'READINESS_DRAFT_STAGED', draft.id, { proposalCount: draft.proposals.length, sources: draft.sources }, at);
}

export function confirmReadinessDraft(inputState, at) {
  let state = createDeskState(inputState);
  const draft = state.readinessDraft;
  if (!draft?.proposals?.length || draft.status !== 'pending') throw new Error('No pending readiness draft to confirm.');
  for (const proposal of draft.proposals) {
    state = confirmReusableFact(state, {
      ...proposal, confirmed: true, verificationState: 'user-confirmed', autoReuse: true,
    }, at);
  }
  state = { ...state, readinessDraft: { ...draft, status: 'confirmed', confirmedAt: nowIso(at) } };
  return audit(state, 'READINESS_DRAFT_CONFIRMED', draft.id, { proposalCount: draft.proposals.length }, at);
}

export function discardReadinessDraft(inputState, at) {
  let state = createDeskState(inputState);
  const draftId = state.readinessDraft?.id || 'readiness-draft';
  state = { ...state, readinessDraft: null };
  return audit(state, 'READINESS_DRAFT_DISCARDED', draftId, {}, at);
}

function normalizeScope(scope = {}) {
  return {
    missionIds: asList(scope.missionIds),
    employers: asList(scope.employers),
    roleFamilies: asList(scope.roleFamilies),
    geography: asList(scope.geography),
    salaryMin: Number(scope.salaryMin) || null,
    salaryMax: Number(scope.salaryMax) || null,
  };
}

export function confirmReusableFact(inputState, input, at) {
  let state = createDeskState(inputState);
  const fieldKey = asText(input.fieldKey);
  if (!READINESS_FIELDS.some(([key]) => key === fieldKey)) throw new Error('Unknown readiness field.');
  if (input.confirmed !== true) throw new Error('Reusable facts must be explicitly confirmed.');
  if (!asText(input.value)) throw new Error('A confirmed reusable fact needs a value.');
  const stamp = nowIso(at);
  const existing = state.reusableFacts.find(item => item.fieldKey === fieldKey);
  const fact = {
    id: existing?.id || makeId('fact'), fieldKey, label: READINESS_FIELDS.find(([key]) => key === fieldKey)[1],
    value: asText(input.value), verificationState: FACT_VERIFICATION_STATES.includes(input.verificationState) ? input.verificationState : 'user-confirmed',
    source: asText(input.source) || 'readiness-interview',
    sensitivity: FACT_SENSITIVITIES.includes(input.sensitivity) ? input.sensitivity : 'standard',
    scope: normalizeScope(input.scope), createdAt: existing?.createdAt || stamp, updatedAt: stamp,
    expiresAt: asText(input.expiresAt) || null, autoReuse: input.autoReuse === true,
  };
  state = { ...state, reusableFacts: existing
    ? state.reusableFacts.map(item => item.id === existing.id ? fact : item)
    : [fact, ...state.reusableFacts] };
  return audit(state, existing ? 'REUSABLE_FACT_UPDATED' : 'REUSABLE_FACT_CONFIRMED', fact.id, {
    fieldKey, verificationState: fact.verificationState, sensitivity: fact.sensitivity, autoReuse: fact.autoReuse,
  }, at);
}

export function deleteReusableFact(inputState, factId, at) {
  let state = createDeskState(inputState);
  const fact = state.reusableFacts.find(item => item.id === factId);
  if (!fact) throw new Error('Reusable fact not found.');
  state = { ...state, reusableFacts: state.reusableFacts.filter(item => item.id !== factId) };
  return audit(state, 'REUSABLE_FACT_DELETED', factId, { fieldKey: fact.fieldKey }, at);
}

export function setStandingPolicy(inputState, input, at) {
  let state = createDeskState(inputState);
  const policyKey = asText(input.policyKey);
  if (!policyKey || input.confirmed !== true) throw new Error('Standing policies require a key and explicit confirmation.');
  const stamp = nowIso(at);
  const existing = state.standingPolicies.find(item => item.policyKey === policyKey);
  const policy = {
    id: existing?.id || makeId('policy'), policyKey, decision: asText(input.decision),
    scope: normalizeScope(input.scope), source: asText(input.source) || 'readiness-interview',
    sensitivity: FACT_SENSITIVITIES.includes(input.sensitivity) ? input.sensitivity : 'standard',
    createdAt: existing?.createdAt || stamp, updatedAt: stamp, expiresAt: asText(input.expiresAt) || null,
  };
  if (!policy.decision) throw new Error('Standing policy decision is required.');
  state = { ...state, standingPolicies: existing
    ? state.standingPolicies.map(item => item.id === existing.id ? policy : item)
    : [policy, ...state.standingPolicies] };
  return audit(state, existing ? 'STANDING_POLICY_UPDATED' : 'STANDING_POLICY_CONFIRMED', policy.id, { policyKey, decision: policy.decision }, at);
}

export function setAutonomyLevel(inputState, level, at) {
  let state = createDeskState(inputState);
  if (!AUTONOMY_LEVELS.includes(level)) throw new Error('Unknown autonomy level.');
  state = { ...state, autonomy: { ...state.autonomy, level, updatedAt: nowIso(at) } };
  return audit(state, 'AUTONOMY_LEVEL_CHANGED', 'autonomy', { level }, at);
}

export function readinessStatus(inputState, at) {
  const state = createDeskState(inputState);
  const now = new Date(at || Date.now()).getTime();
  const completed = new Set(state.reusableFacts.filter(fact =>
    fact.verificationState !== 'unverified' && fact.verificationState !== 'expired' &&
    (!fact.expiresAt || new Date(fact.expiresAt).getTime() > now)
  ).map(fact => fact.fieldKey));
  const unresolved = READINESS_FIELDS.filter(([key]) => !completed.has(key)).map(([key, label]) => ({ key, label }));
  const score = Math.round(((READINESS_FIELDS.length - unresolved.length) / READINESS_FIELDS.length) * 100);
  return { score, complete: unresolved.length === 0, unresolved };
}

const FIELD_ALIASES = Object.freeze({
  authorization: ['work authorization', 'authorized to work', 'legally authorized'], sponsorship: ['sponsorship', 'visa sponsorship'],
  salary: ['salary expectation', 'desired compensation', 'compensation range'], startDate: ['start date', 'notice period'],
  travel: ['willing to travel', 'travel requirement'], relocation: ['willing to relocate', 'relocation'],
  remoteGeography: ['remote location', 'work location', 'state of residence'], schedule: ['work schedule', 'time zone', 'core hours'],
  outsideEmployment: ['outside employment', 'conflict of interest', 'moonlighting'], licenses: ['license', 'certification'],
  driving: ['driver license', 'driving record'], background: ['background check', 'criminal background'],
  drugHealth: ['drug screen', 'health screening', 'medical screening'], references: ['professional references', 'contact references'],
  demographics: ['gender', 'race', 'ethnicity', 'veteran status', 'disability status'],
});
const EXCEPTION_PATTERNS = [
  ['signature', /certif|electronic signature|sign (?:this|below)/i], ['material-consent', /arbitration|biometric|credit check|non[- ]compete|outside employment restriction/i],
  ['unusual-screening', /polygraph|medical exam|health information|drug test/i], ['conflict', /government client|relative.*(?:work|employ)|former employer.*conflict/i],
];
const HUMAN_ACTION_PATTERNS = [['CAPTCHA', /captcha|not a robot/i], ['OTP', /one[- ]time|verification code|otp/i], ['LOGIN', /sign in|log in/i], ['UPLOAD', /upload/i], ['SIGNATURE', /signature|sign here/i]];
const POLICY_QUESTION_PATTERNS = [
  ['ordinary-privacy', /privacy policy|privacy notice|data processing/i],
  ['create-account', /create (?:an )?(?:employer )?account|register an account/i],
  ['optional-demographics', /optional demographic|prefer not to answer/i],
  ['transmit-profile', /submit|transmit|send.*(?:resume|profile)/i],
  ['routine-screening', /screening answer|application question/i],
];
const normalizeQuestion = value => asText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function scopeAllows(scope, context = {}) {
  const normalized = normalizeScope(scope);
  if (normalized.employers.length && !normalized.employers.some(item => normalizeEmployer(item) === normalizeEmployer(context.employer))) return false;
  if (normalized.roleFamilies.length && !normalized.roleFamilies.some(item => normalizeTitle(context.title).includes(normalizeTitle(item)))) return false;
  if (normalized.salaryMin && Number(context.salaryMin) < normalized.salaryMin) return false;
  if (normalized.salaryMax && Number(context.salaryMax) > normalized.salaryMax) return false;
  return true;
}

export function resolveApplicationQuestion(inputState, input, at) {
  const state = createDeskState(inputState);
  const wording = asText(input.question);
  const normalized = normalizeQuestion(wording);
  const human = HUMAN_ACTION_PATTERNS.find(([, pattern]) => pattern.test(wording));
  if (human) return { kind: 'human-action', actionType: human[0], confidence: 1, reason: 'Human-controlled browser step' };
  if (input.context?.changedTerms || input.context?.materialQualificationGap) return { kind: 'targeted-exception', exceptionType: 'changed-terms-or-gap', confidence: 1, reason: 'Changed terms or material qualification gap' };
  if (input.context?.authorizedSalaryMin && Number(input.context.salaryMin) < Number(input.context.authorizedSalaryMin)) return { kind: 'targeted-exception', exceptionType: 'compensation-outside-band', confidence: 1, reason: 'Compensation is below the authorized band' };
  if (input.context?.authorizedSalaryMax && Number(input.context.salaryMax) > Number(input.context.authorizedSalaryMax)) return { kind: 'targeted-exception', exceptionType: 'compensation-outside-band', confidence: 1, reason: 'Compensation is above the authorized band' };
  const exception = EXCEPTION_PATTERNS.find(([, pattern]) => pattern.test(wording));
  if (exception) return { kind: 'targeted-exception', exceptionType: exception[0], confidence: 1, reason: 'Employer-specific or material certification/consent' };
  const policyMatch = POLICY_QUESTION_PATTERNS.find(([, pattern]) => pattern.test(wording));
  if (policyMatch) {
    const policy = state.standingPolicies.find(item => item.policyKey === policyMatch[0] && scopeAllows(item.scope, input.context));
    if (policy) return { kind: 'standing-policy', policyId: policy.id, value: policy.decision, confidence: .94, wording };
  }
  const inferredKeys = Object.entries(FIELD_ALIASES).filter(([, aliases]) => aliases.some(alias => normalized.includes(normalizeQuestion(alias)))).map(([key]) => key);
  const requestedKey = asText(input.fieldKey);
  const fieldKey = requestedKey || (inferredKeys.length === 1 ? inferredKeys[0] : '');
  const semanticConfidence = requestedKey ? 1 : inferredKeys.length === 1 ? .94 : 0;
  if (!fieldKey || semanticConfidence < (Number(input.confidenceThreshold) || .92)) return { kind: 'ask-once', confidence: semanticConfidence, reason: 'New or ambiguous factual question' };
  const fact = state.reusableFacts.find(item => item.fieldKey === fieldKey && item.autoReuse && ['user-confirmed', 'document-verified'].includes(item.verificationState));
  const expired = fact?.expiresAt && new Date(fact.expiresAt).getTime() <= new Date(at || Date.now()).getTime();
  if (!fact || expired || !scopeAllows(fact.scope, input.context)) return { kind: 'ask-once', fieldKey, confidence: semanticConfidence, reason: expired ? 'Stored answer expired' : 'No verified reusable fact in scope' };
  return { kind: 'safe-fact', fieldKey, factId: fact.id, value: fact.value, confidence: semanticConfidence, wording };
}

export function canAutoSubmit(inputState, role, fieldDecisions = []) {
  const state = createDeskState(inputState);
  const readiness = readinessStatus(state);
  const blockers = [];
  if (state.autonomy.level !== 'auto_submit') blockers.push('autonomy level is not Auto-submit');
  if (!readiness.complete) blockers.push('readiness interview is incomplete');
  if (state.autonomy.successfulAuditedApplications < 1) blockers.push('no successful audited application baseline');
  if (!role || verificationGaps(role).length) blockers.push('role is not fully verified');
  if (fieldDecisions.some(item => !['safe-fact', 'standing-policy'].includes(item.kind))) blockers.push('one or more fields require review or human action');
  return { allowed: blockers.length === 0, blockers };
}

export function recordFieldAnswer(inputState, input, at) {
  let state = createDeskState(inputState);
  if (!asText(input.roleId) || !asText(input.question) || !asText(input.decisionKind)) throw new Error('Role, exact question wording, and decision kind are required.');
  return audit(state, 'APPLICATION_FIELD_ANSWERED', asText(input.roleId), {
    question: asText(input.question), decisionKind: asText(input.decisionKind), factId: asText(input.factId) || null,
    policyId: asText(input.policyId) || null, confidence: Number(input.confidence) || 0,
    documentVersion: asText(input.documentVersion) || null,
  }, at);
}

export function exportReadinessData(inputState) {
  const state = createDeskState(inputState);
  return JSON.stringify({ version: state.version, exportedAt: nowIso(), reusableFacts: state.reusableFacts, standingPolicies: state.standingPolicies, autonomy: state.autonomy }, null, 2);
}

export function createSalesDemo(inputState, autonomyLevel = 'autofill_review', at) {
  let state = createDeskState(inputState);
  if (!AUTONOMY_LEVELS.includes(autonomyLevel)) throw new Error('Unknown demo autonomy level.');
  const stamp = nowIso(at);
  const demo = {
    id: makeId('demo'), simulated: true, autonomyLevel, stageIndex: 0, startedAt: stamp,
    candidate: { name: 'Jordan Example', location: 'Columbus, Ohio', note: 'Synthetic candidate; no real personal data.' },
    mission: { target: 3, roleFamilies: ['Procurement Analyst', 'Buyer'], workMode: 'Remote US', salaryMin: 85000, salaryMax: 115000 },
    fixtures: [
      { id: 'demo-role-1', employer: 'Northstar Components', title: 'Procurement Analyst', requisitionId: 'DEMO-PA-104', directEmployerUrl: 'https://careers.example.test/jobs/DEMO-PA-104', salaryMin: 90000, salaryMax: 108000 },
      { id: 'demo-role-2', employer: 'Northstar Components, Inc.', title: 'Procurement Analyst', requisitionId: 'DEMO-PA-104', directEmployerUrl: 'https://careers.example.test/jobs/DEMO-PA-104?ref=demo', duplicate: true },
      { id: 'demo-role-3', employer: 'Atlas Supply Labs', title: 'Buyer', requisitionId: 'DEMO-BUY-22', directEmployerUrl: 'https://jobs.example.test/DEMO-BUY-22', salaryMin: 87000, salaryMax: 102000 },
    ],
    trace: [{ stage: DEMO_STAGES[0], kind: 'automatic', at: stamp, explanation: 'Synthetic readiness fixture is complete; all reusable answers are explicitly labeled as demo data.' }],
    simulatedReceipt: null,
  };
  state = { ...state, demo };
  return audit(state, 'SALES_DEMO_STARTED', demo.id, { simulated: true, autonomyLevel }, at);
}

export function advanceSalesDemo(inputState, at) {
  let state = createDeskState(inputState);
  if (!state.demo) throw new Error('Sales demo has not started.');
  if (state.demo.stageIndex >= DEMO_STAGES.length - 1) return state;
  const stageIndex = state.demo.stageIndex + 1;
  const explanations = [
    '',
    'Mission filters are inside the synthetic candidate’s standing salary, geography, and role-family policies.',
    'Three fixture records were found from synthetic direct-employer sources; no live provider or employer was contacted.',
    'The requisition key suppressed one duplicate and retained two unique roles with fixture Apply-path evidence.',
    'Fixture DOCX/PDF versions passed the simulated two-page render and ATS text-order checks.',
    'Verified synthetic facts answered authorization, location, notice period, and travel; ordinary privacy terms matched a standing policy.',
    'An employer-specific electronic certification is outside standing authorization and requires a targeted person decision.',
    'A simulated employer confirmation ID and document version were recorded; nothing was transmitted.',
    'The simulated tracker linked the submitted fixture document version to a phone-screen brief and follow-up reminder.',
  ];
  const kinds = ['automatic', 'automatic', 'automatic', 'automatic', 'automatic', 'automatic', 'human-required', 'simulated', 'automatic'];
  const stamp = nowIso(at);
  const demo = {
    ...state.demo, stageIndex,
    trace: [...state.demo.trace, { stage: DEMO_STAGES[stageIndex], kind: kinds[stageIndex], at: stamp, explanation: explanations[stageIndex] }],
    simulatedReceipt: stageIndex >= 7 ? {
      simulated: true, confirmationId: 'SIM-DEMO-84721', submittedAt: stamp,
      documentVersion: 'jordan-example-procurement-analyst-v1', transmission: 'none',
    } : state.demo.simulatedReceipt,
  };
  state = { ...state, demo };
  return audit(state, 'SALES_DEMO_ADVANCED', demo.id, { simulated: true, stage: DEMO_STAGES[stageIndex], kind: kinds[stageIndex] }, at);
}

export function resetSalesDemo(inputState, at) {
  let state = createDeskState(inputState);
  const demoId = state.demo?.id || 'demo';
  state = { ...state, demo: null };
  return audit(state, 'SALES_DEMO_RESET', demoId, { simulated: true }, at);
}

export function updateTruthProfile(inputState, profile, at) {
  let state = createDeskState(inputState);
  const truthProfile = createTruthProfile({ ...profile, confirmedAt: nowIso(at) });
  state = { ...state, truthProfile };
  return audit(state, 'TRUTH_PROFILE_CONFIRMED', 'truth-profile', { gaps: truthProfileGaps(truthProfile) }, at);
}

function audit(state, type, entityId, details = {}, at) {
  return {
    ...state,
    auditEvents: [...state.auditEvents, { id: makeId('audit'), type, entityId, details, at: nowIso(at) }],
  };
}

export function addRole(inputState, input, at) {
  let state = createDeskState(inputState);
  const role = {
    id: asText(input.id) || makeId('role'),
    employer: asText(input.employer),
    title: asText(input.title),
    requisitionId: asText(input.requisitionId),
    directEmployerUrl: normalizeJobUrl(input.directEmployerUrl || input.url),
    sourceUrl: normalizeJobUrl(input.sourceUrl),
    sourceType: asText(input.sourceType) || 'unknown',
    applyPathActive: input.applyPathActive === true,
    remoteEligibility: asText(input.remoteEligibility),
    geographyEligibility: asText(input.geographyEligibility),
    salaryMin: Number(input.salaryMin) || null,
    salaryMax: Number(input.salaryMax) || null,
    salaryDisclosure: asText(input.salaryDisclosure),
    postedDate: asText(input.postedDate),
    travel: asText(input.travel),
    schedule: asText(input.schedule),
    materialGaps: asList(input.materialGaps),
    recruiterContact: asText(input.recruiterContact),
    attestations: asList(input.attestations),
    jobDescription: asText(input.jobDescription),
    status: 'Found',
    statusHistory: [{ status: 'Found', reason: 'Role captured', at: nowIso(at) }],
    packageEvidence: null,
    packageDraft: input.packageDraft || null,
    approvalBatchId: null,
    receipt: null,
    createdAt: nowIso(at),
    updatedAt: nowIso(at),
  };
  if (!role.employer || !role.title || !role.directEmployerUrl) throw new Error('Employer, title, and direct employer URL are required.');
  const key = roleDedupeKey(role);
  const duplicateIndex = state.roles.findIndex(existing => roleDedupeKey(existing) === key);
  if (duplicateIndex >= 0) {
    const existing = state.roles[duplicateIndex];
    const updated = { ...existing, statusHistory: [...existing.statusHistory, { status: existing.status, reason: 'Duplicate rediscovered and suppressed', at: nowIso(at) }], updatedAt: nowIso(at) };
    state = { ...state, roles: state.roles.map((item, index) => index === duplicateIndex ? updated : item) };
    state = audit(state, 'ROLE_DUPLICATE_SUPPRESSED', existing.id, { key }, at);
    return { state, role: updated, duplicate: true };
  }
  state = { ...state, roles: [role, ...state.roles] };
  state = audit(state, 'ROLE_CAPTURED', role.id, { key, employer: role.employer, title: role.title }, at);
  return { state, role, duplicate: false };
}

export function recordGeneratedPackage(inputState, roleId, input, at) {
  let state = createDeskState(inputState);
  const role = state.roles.find(item => item.id === roleId);
  if (!role) throw new Error('Role not found.');
  if (!['Verified', 'Package Ready'].includes(role.status)) throw new Error('A role must be Verified before generating its package.');
  if (!asText(input.historyId) || !asText(input.documentVersion) || !asText(input.resumeText)) throw new Error('Generated package history ID, document version, and resume text are required.');
  const packageDraft = {
    historyId: asText(input.historyId), documentVersion: asText(input.documentVersion),
    resumeText: asText(input.resumeText), coverLetterText: asText(input.coverLetterText),
    atsIssues: asList(input.atsIssues), generatedAt: nowIso(input.generatedAt || at),
    source: 'existing-tailor-pipeline', qaStatus: 'draft',
  };
  const updated = { ...role, packageDraft, updatedAt: nowIso(at) };
  state = { ...state, roles: state.roles.map(item => item.id === roleId ? updated : item) };
  return audit(state, 'PACKAGE_DRAFT_GENERATED', roleId, {
    historyId: packageDraft.historyId, documentVersion: packageDraft.documentVersion,
    hasCoverLetter: Boolean(packageDraft.coverLetterText), atsIssueCount: packageDraft.atsIssues.length,
  }, at);
}

export function verificationGaps(role) {
  const gaps = [];
  if (role.sourceType !== 'direct-employer') gaps.push('direct employer source');
  if (!/^https:\/\//.test(role.directEmployerUrl || '')) gaps.push('HTTPS direct employer URL');
  if (role.applyPathActive !== true) gaps.push('active Apply path');
  if (!role.requisitionId) gaps.push('requisition ID');
  if (!role.remoteEligibility) gaps.push('remote eligibility');
  if (!role.geographyEligibility) gaps.push('geography eligibility');
  if (!role.salaryMin && !role.salaryMax && !role.salaryDisclosure) gaps.push('salary or explicit unknown');
  if (!role.postedDate) gaps.push('posting date or explicit unknown');
  if (!role.travel) gaps.push('travel or explicit unknown');
  if (!role.schedule) gaps.push('schedule/core hours or explicit unknown');
  return gaps;
}

export function packageGaps(evidence = {}) {
  const gaps = [];
  if (!asText(evidence.documentVersion)) gaps.push('document version');
  const formats = asList(evidence.formats).map(item => item.toUpperCase());
  if (!formats.includes('DOCX') || !formats.includes('PDF')) gaps.push('DOCX and PDF');
  if (evidence.atsTextExtracted !== true) gaps.push('ATS text extraction');
  if (evidence.pagesInspected !== true) gaps.push('rendered page inspection');
  if (Number(evidence.pageCount) !== 2) gaps.push('verified two-page length');
  return gaps;
}

export function transitionRole(inputState, roleId, nextStatus, evidence = {}, at) {
  let state = createDeskState(inputState);
  const role = state.roles.find(item => item.id === roleId);
  if (!role) throw new Error('Role not found.');
  if (!PIPELINE_STATUSES.includes(nextStatus)) throw new Error('Unknown pipeline status.');
  if (!nextStatuses[role.status]?.includes(nextStatus)) throw new Error(`Cannot move ${role.status} to ${nextStatus}.`);

  let patch = {};
  if (nextStatus === 'Verified') {
    const gaps = verificationGaps(role);
    if (gaps.length) throw new Error(`Verification incomplete: ${gaps.join(', ')}.`);
    patch.verifiedAt = nowIso(at);
  }
  if (nextStatus === 'Package Ready') {
    const gaps = packageGaps(evidence);
    if (gaps.length) throw new Error(`Package QA incomplete: ${gaps.join(', ')}.`);
    if (role.packageDraft && role.packageDraft.documentVersion !== asText(evidence.documentVersion)) throw new Error('QA document version must match the generated package draft.');
    patch.packageEvidence = { ...evidence, formats: asList(evidence.formats), verifiedAt: nowIso(at) };
  }
  if (nextStatus === 'Awaiting Approval') {
    const batch = state.approvalBatches.find(item => item.id === evidence.approvalBatchId && item.roleIds.includes(roleId));
    if (!batch || batch.status !== 'approved') throw new Error('An approved named batch containing this role is required.');
    patch.approvalBatchId = batch.id;
  }
  if (nextStatus === 'Submitted') {
    const receipt = evidence.receipt || {};
    if (!asText(receipt.submittedAt) || (!asText(receipt.confirmationId) && !asText(receipt.confirmationUrl)) || !asText(receipt.documentVersion)) {
      throw new Error('Authoritative receipt timestamp, confirmation ID/URL, and submitted document version are required.');
    }
    if (receipt.documentVersion !== role.packageEvidence?.documentVersion) throw new Error('Receipt document version must match the approved package version.');
    patch.receipt = { employer: role.employer, role: role.title, requisitionId: role.requisitionId, ...receipt };
  }
  if (nextStatus === 'Blocked') patch.blockedReason = asText(evidence.reason) || 'User action required';

  const updated = {
    ...role,
    ...patch,
    status: nextStatus,
    statusHistory: [...role.statusHistory, { status: nextStatus, reason: asText(evidence.reason) || `Moved to ${nextStatus}`, at: nowIso(at) }],
    updatedAt: nowIso(at),
  };
  state = { ...state, roles: state.roles.map(item => item.id === roleId ? updated : item) };
  return audit(state, 'ROLE_STATUS_CHANGED', roleId, { from: role.status, to: nextStatus }, at);
}

export function createApprovalBatch(inputState, input, at) {
  let state = createDeskState(inputState);
  const roleIds = [...new Set(asList(input.roleIds))];
  const roles = state.roles.filter(role => roleIds.includes(role.id));
  if (!asText(input.name)) throw new Error('Approval batch name is required.');
  if (!roles.length || roles.some(role => role.status !== 'Package Ready')) throw new Error('Approval batches may contain Package Ready roles only.');
  const batch = {
    id: makeId('batch'),
    name: asText(input.name),
    roleIds,
    status: 'draft',
    roleSnapshots: roles.map(role => ({
      roleId: role.id,
      employer: role.employer,
      title: role.title,
      requisitionId: role.requisitionId,
      salaryMin: role.salaryMin,
      salaryMax: role.salaryMax,
      travel: role.travel,
      materialGaps: role.materialGaps,
      recruiterContact: role.recruiterContact,
      attestations: role.attestations,
      documentVersion: role.packageEvidence?.documentVersion,
    })),
    disclosures: asList(input.disclosures),
    createdAt: nowIso(at),
    approvedAt: null,
  };
  state = { ...state, approvalBatches: [batch, ...state.approvalBatches] };
  state = audit(state, 'APPROVAL_BATCH_CREATED', batch.id, { name: batch.name, roleIds }, at);
  return { state, batch };
}

export function approveBatch(inputState, batchId, at) {
  let state = createDeskState(inputState);
  const batch = state.approvalBatches.find(item => item.id === batchId);
  if (!batch) throw new Error('Approval batch not found.');
  if (!batch.disclosures.length) throw new Error('Batch disclosures are required before approval.');
  const approved = { ...batch, status: 'approved', approvedAt: nowIso(at) };
  state = { ...state, approvalBatches: state.approvalBatches.map(item => item.id === batchId ? approved : item) };
  return audit(state, 'APPROVAL_BATCH_APPROVED', batchId, { roleIds: batch.roleIds }, at);
}

export function addActionItem(inputState, input, at) {
  let state = createDeskState(inputState);
  if (!ACTION_TYPES.includes(input.type)) throw new Error('Unsupported action type.');
  if (!state.roles.some(role => role.id === input.roleId)) throw new Error('Action queue role not found.');
  const item = { id: makeId('action'), roleId: input.roleId, type: input.type, summary: asText(input.summary), status: 'open', createdAt: nowIso(at), resolvedAt: null };
  state = { ...state, actionQueue: [item, ...state.actionQueue] };
  state = audit(state, 'ACTION_REQUIRED', item.id, { roleId: item.roleId, type: item.type }, at);
  return { state, item };
}

export function resolveActionItem(inputState, actionId, at) {
  let state = createDeskState(inputState);
  const item = state.actionQueue.find(entry => entry.id === actionId);
  if (!item) throw new Error('Action item not found.');
  state = { ...state, actionQueue: state.actionQueue.map(entry => entry.id === actionId ? { ...entry, status: 'resolved', resolvedAt: nowIso(at) } : entry) };
  return audit(state, 'ACTION_RESOLVED', actionId, { roleId: item.roleId }, at);
}

export function pipelineCounts(state) {
  return PIPELINE_STATUSES.reduce((counts, status) => ({ ...counts, [status]: state.roles.filter(role => role.status === status).length }), {});
}

export function importLegacyEntries(inputState, applications = [], tailored = [], at) {
  let state = createDeskState(inputState);
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  for (const entry of [...applications, ...tailored]) {
    const employer = entry.employer || entry.company;
    const title = entry.title || entry.jobTitle;
    const directEmployerUrl = entry.directEmployerUrl || entry.jobUrl || entry.url;
    if (!employer || !title || !directEmployerUrl) { skipped++; continue; }
    const result = addRole(state, {
      employer,
      title,
      requisitionId: entry.requisitionId || entry.jobId || '',
      directEmployerUrl,
      sourceUrl: directEmployerUrl,
      sourceType: 'unknown',
      remoteEligibility: entry.location || 'Unknown',
      geographyEligibility: 'Unknown',
      salaryDisclosure: entry.salary || 'Unknown',
      postedDate: 'Unknown',
      travel: 'Unknown',
      schedule: 'Unknown',
      materialGaps: [`Imported status "${entry.status || 'unknown'}" requires fresh evidence`],
    }, at);
    state = result.state;
    if (result.duplicate) duplicates++; else imported++;
  }
  return { state, imported, duplicates, skipped };
}
