import { createHash } from 'node:crypto';
import { PROHIBITED_CREDENTIAL_KEY, PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';

const CONTRACTIONS = Object.freeze([
  [/\bwon't\b/g, 'will not'], [/\bcan't\b/g, 'cannot'], [/\bcannot\b/g, 'cannot'],
  [/\baren't\b/g, 'are not'], [/\bisn't\b/g, 'is not'], [/\bwasn't\b/g, 'was not'],
  [/\bweren't\b/g, 'were not'], [/\bdon't\b/g, 'do not'], [/\bdoesn't\b/g, 'does not'],
  [/\bdidn't\b/g, 'did not'], [/\bcouldn't\b/g, 'could not'], [/\bwouldn't\b/g, 'would not'],
  [/\bshouldn't\b/g, 'should not'], [/\bhaven't\b/g, 'have not'], [/\bhasn't\b/g, 'has not'],
  [/\bhadn't\b/g, 'had not'], [/\bmustn't\b/g, 'must not'], [/\bain't\b/g, 'is not'],
]);

export function normalizeQuestion(value) {
  let normalized = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  for (const [pattern, replacement] of CONTRACTIONS) normalized = normalized.replace(pattern, replacement);
  normalized = normalized.replace(/n't\b/g, ' not');
  return normalized.replace(/\s+/g, ' ').trim();
}

export const APPLICATION_EFFICIENCY_SCHEMA_VERSION = 1;
export const START_AVAILABILITY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const LEARNING_STATE_CLASSES = Object.freeze({
  CONFIRMED_FACT: 'CONFIRMED_FACT',
  USER_PREFERENCE: 'USER_PREFERENCE',
  DERIVED_BUT_REVIEWABLE: 'DERIVED_BUT_REVIEWABLE',
  UNKNOWN_NEEDS_USER: 'UNKNOWN_NEEDS_USER',
});

export const IMPROVEMENT_CANDIDATE_TYPES = Object.freeze([
  'repeated-ats-question', 'unreliable-extraction', 'unnecessary-interruption',
  'common-failure-point', 'slow-workflow-stage', 'poor-match-discovery-source',
]);

const SECRET_KEY = PROHIBITED_CREDENTIAL_KEY;
const SECRET_VALUE = PROHIBITED_SECRET_VALUE;
const PERSONAL_INFORMATION = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_OR_NATIONAL_ID = /\+?\d[\d().\-\s]{6,}\d|\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{3}-\d{2}-\d{4}\b/;
const STREET_ADDRESS = /\b\d{1,6}\s+[A-Za-z][A-Za-z.'\-]*(?:\s+[A-Za-z][A-Za-z.'\-]*){0,3}\s+(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|court|ct\.?|way|place|pl\.?)\b/i;
const EMPLOYER_OR_ENTITY = /\b(?:inc|llc|ltd|corp|corporation|incorporated|company)\b\.?/i;
const FIRST_PERSON_CONTENT = /\b(?:i am|i'm|i can|i will|i live|i currently|i have|my name|my salary|my resume)\b/i;
const ATS_OR_QUESTION = /\?|\b(?:are you|will you|what is|what was|what is your|when can|do you|have you|please provide|describe your)\b/i;
const RESUME_YEARS = /\b\d+\s+years?\b/i;
const HEX_DIGEST = /^[a-f0-9]{32,64}$/i;
const SAFE_EFFICIENCY_PROSE_WORDS = new Set([
  'reduce', 'repeated', 'ordinary', 'exact-match', 'interruptions',
  'reuse', 'confirmed', 'work-authorization', 'answers', 'after', 'one', 'review',
  'leave', 'production', 'behavior', 'unchanged',
]);
const POLARITY_BLOCK = /\b(?:not|never|no longer|unable|without|lack|lacks|lacking|lost|denied|expired|cannot|revoked|pending|false that)\b|\b(?:un|in)(?:authorized|eligible)\b|\b(?:have no|has no|had no|with no|no need|no requirement)\b/;
const IMPLICIT_SCOPE = /\bour\b|\bthis (?!your|is|are|was|were|the|a|an|my)\w+\b|\bheadquarters\b|\b(?:join|with|for) us\b/;
export const ALLOWED_EQUIVALENT_PROVENANCE = new Set([
  'user answered application question',
  'explicit candidate confirmation',
  'candidate confirmation',
  'document-verified',
  'document verified',
]);
export const EFFICIENCY_REASON_CODES = Object.freeze([
  'unspecified', 'http_429', 'ats_timeout', 'ats_unavailable', 'ats_unspecified', 'ats_rate_limited',
]);
const EFFICIENCY_OPERATIONAL_STRINGS = new Set([
  ...IMPROVEMENT_CANDIDATE_TYPES,
  ...EFFICIENCY_REASON_CODES,
  'proposed',
  'requires-review',
  'observe-measure-propose-test-independent-verification-owner-approval',
  'EMPLOYER_ATS_FAILURE',
]);
const MIXED_CASE_IDENTIFIER = /[A-Za-z]*[A-Z][a-z]+[A-Z][A-Za-z]*/;
const TELEMETRY_URL_OR_PATH = /:\/\/|mailto:|\bwww\.|\//i;
const QUESTION_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'you', 'your', 'yours', 'what', 'when', 'where', 'who', 'whom', 'which', 'why', 'how',
  'will', 'would', 'can', 'could', 'should', 'may', 'please', 'kindly',
  'to', 'in', 'of', 'for', 'at', 'on', 'by', 'from', 'with', 'as',
  'i', 'me', 'my', 'we', 'it', 'its', 'if', 'or', 'and',
  'now_or_future',
]);

export const ATOMIC_ANSWER_INTENTS = Object.freeze([
  { id: 'work_authorization', confirmation: 'always', allowsPreference: false, fieldKeys: ['authorization'], patterns: [/legally (?:authorized|eligible) to work/, /authorized to work/, /work authorization/, /right to work/, /eligible to work/] },
  { id: 'sponsorship', confirmation: 'always', allowsPreference: false, fieldKeys: ['sponsorship'], patterns: [/require visa sponsorship/, /need visa sponsorship/, /visa sponsorship/, /require sponsorship/, /need sponsorship/, /immigration sponsorship/, /\bh-?1b\b/] },
  { id: 'current_location', confirmation: 'always', allowsPreference: false, fieldKeys: ['location', 'currentCity'], patterns: [/current city/, /current location/, /city of residence/, /where do you (?:currently )?live/] },
  { id: 'relocation_willingness', confirmation: 'always', allowsPreference: true, fieldKeys: ['relocation'], patterns: [/willing to relocate/, /open to relocation/] },
  { id: 'desired_compensation', confirmation: 'always', allowsPreference: true, fieldKeys: ['desiredSalary', 'desiredCompensation'], patterns: [/salary expectation/, /compensation expectation/, /desired (?:pay|salary|compensation)/, /pay expectation/] },
  { id: 'start_availability', confirmation: 'review', allowsPreference: false, fieldKeys: ['availability', 'startDate'], patterns: [/when can you start/, /earliest start date/, /available to start/, /start date/, /earliest start/] },
  { id: 'legal_first_name', confirmation: 'review', allowsPreference: false, fieldKeys: ['firstName'], patterns: [/legal first name/, /\byour first name\b/, /first name/, /^first name$/] },
  { id: 'legal_last_name', confirmation: 'review', allowsPreference: false, fieldKeys: ['lastName'], patterns: [/legal last name/, /\byour last name\b/, /family name/, /last name/, /^last name$/] },
  { id: 'email', confirmation: 'review', allowsPreference: false, fieldKeys: ['email'], patterns: [/email address/, /\byour email\b/, /email/, /^email$/] },
  { id: 'phone', confirmation: 'review', allowsPreference: false, fieldKeys: ['phone'], patterns: [/phone number/, /mobile number/, /\byour phone\b/, /phone/, /^phone$/] },
  { id: 'current_employer', confirmation: 'review', allowsPreference: false, fieldKeys: ['currentEmployer'], patterns: [/current employer/, /current company/] },
  { id: 'current_job_title', confirmation: 'review', allowsPreference: false, fieldKeys: ['currentJobTitle'], patterns: [/current job title/, /current title/] },
  { id: 'previous_employer', confirmation: 'review', allowsPreference: false, fieldKeys: ['previousEmployer'], patterns: [/previous employer/, /former employer/] },
  { id: 'previous_job_title', confirmation: 'review', allowsPreference: false, fieldKeys: ['previousJobTitle'], patterns: [/previous job title/, /previous title/, /former (?:job )?title/] },
  { id: 'highest_education_level', confirmation: 'review', allowsPreference: false, fieldKeys: ['educationLevel', 'highestEducation'], patterns: [/highest (?:level of )?education/, /highest degree/] },
  { id: 'degree_type', confirmation: 'review', allowsPreference: false, fieldKeys: ['degreeType'], patterns: [/degree type/, /type of degree/] },
  { id: 'degree_field', confirmation: 'review', allowsPreference: false, fieldKeys: ['degreeField'], patterns: [/field of study/, /degree field/, /\byour major\b/] },
  { id: 'school_name', confirmation: 'review', allowsPreference: false, fieldKeys: ['schoolName'], patterns: [/school (?:name|attended)/, /college (?:name|attended)/] },
]);

export const CANONICAL_ANSWER_INTENTS = ATOMIC_ANSWER_INTENTS;
export const ATOMIC_INTENT_STALENESS_MS = Object.freeze({
  start_availability: START_AVAILABILITY_MAX_AGE_MS,
});

const clone = value => JSON.parse(JSON.stringify(value));
const text = (value, max = 160) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

function currentFactVersion(fact) {
  return fact?.versions?.find(item => item.version === fact.currentVersion) || null;
}

function contentFreeViolation(path) {
  throw new Error(`Personal information is not allowed in efficiency records: ${path}`);
}

function maskSingleIntentConnectives(normalized) {
  return normalized.replace(/\bnow or in the future\b/g, 'now_or_future');
}

export function isCompoundQuestion(question) {
  const raw = String(question || '');
  if (/[,;:]/.test(raw) || /[\u2013\u2014]/.test(raw) || /--/.test(raw) || /\//.test(raw)) return true;
  const normalized = normalizeQuestion(question);
  if (!normalized) return false;
  const masked = maskSingleIntentConnectives(normalized);
  if (/\band\b|\bor\b|\bas well as\b|\balong with\b|\bin addition to\b/.test(masked)) return true;
  if ((masked.match(/\?/g) || []).length > 1) return true;
  const clauses = masked.match(/(?:^|[.!?]\s+)(?:are|will|what|when|where|who|why|how|do|does|did|have|has|please)\b/g) || [];
  return clauses.length > 1;
}

export function hasImplicitEmployerScope(question) {
  const normalized = normalizeQuestion(question).replace(/\bthe us\b/g, 'the_united_states').replace(/\bunited states\b/g, 'the_united_states');
  return IMPLICIT_SCOPE.test(normalized);
}

function accountedForRemainder(normalized, intent) {
  const masked = maskSingleIntentConnectives(normalized);
  let accounted = '';
  for (const pattern of intent.patterns) {
    const match = masked.match(pattern);
    if (match && match[0].length > accounted.length) accounted = match[0];
  }
  if (!accounted) return masked;
  return masked.replace(accounted, ' ');
}

export function hasUnresolvedSemanticRemainder(question, intent) {
  const remainder = accountedForRemainder(normalizeQuestion(question), intent)
    .replace(/[?!.,;:/\u2013\u2014()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = remainder.split(/\s+/).filter(Boolean).filter(token => token.length > 1 && !QUESTION_STOPWORDS.has(token));
  return tokens.length > 0;
}

function contentFreeViolationPath(value, path) {
  if (EFFICIENCY_OPERATIONAL_STRINGS.has(value)) return;
  if (TELEMETRY_URL_OR_PATH.test(value)) contentFreeViolation(path);
  if (MIXED_CASE_IDENTIFIER.test(value.replace(/\s+/g, ''))) contentFreeViolation(path);
  if (/[A-Z]/.test(value.slice(1))) contentFreeViolation(path);
  if (SECRET_VALUE.test(value)) throw new Error(`Secrets are not allowed in efficiency records: ${path}`);
  if (PERSONAL_INFORMATION.test(value)) contentFreeViolation(path);
  if (PHONE_OR_NATIONAL_ID.test(value) || STREET_ADDRESS.test(value) || EMPLOYER_OR_ENTITY.test(value)) contentFreeViolation(path);
  if (FIRST_PERSON_CONTENT.test(value) || ATS_OR_QUESTION.test(value) || RESUME_YEARS.test(value)) contentFreeViolation(path);
  const words = value.toLowerCase().split(/[^a-z0-9'_-]+/).filter(Boolean);
  if (!words.length || words.some(word => !SAFE_EFFICIENCY_PROSE_WORDS.has(word))) contentFreeViolation(path);
  if (classifyCanonicalIntent(value)) contentFreeViolation(path);
}

function assertContentFree(value, path = 'efficiency') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertContentFree(item, `${path}.${index}`));
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) throw new Error(`Credentials are not allowed in efficiency records: ${path}.${key}`);
      assertContentFree(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value !== 'string') return;
  if (HEX_DIGEST.test(value)) return;
  contentFreeViolationPath(value, path);
}

function contentFreeReasonCode(value) {
  const reasonCode = text(value, 80) || 'unspecified';
  if (reasonCode.includes('://') || MIXED_CASE_IDENTIFIER.test(reasonCode.replace(/\s+/g, ''))) {
    throw new Error('ATS failure reason codes in efficiency records must be content-free.');
  }
  if (!EFFICIENCY_REASON_CODES.includes(reasonCode)) throw new Error('ATS failure reason codes in efficiency records must be content-free.');
  assertContentFree(reasonCode, 'efficiency.reasonCode');
  return reasonCode;
}

export function classifyCanonicalIntent(question) {
  const normalized = normalizeQuestion(question);
  if (!normalized || POLARITY_BLOCK.test(normalized)) return null;
  if (isCompoundQuestion(question)) return null;
  const matches = ATOMIC_ANSWER_INTENTS.filter(intent => intent.patterns.some(pattern => pattern.test(normalized)));
  if (matches.length !== 1) return null;
  if (hasUnresolvedSemanticRemainder(question, matches[0])) return null;
  return matches[0];
}

function provenanceKey(version = {}) {
  return text(version.provenance || version.originalSource || version.source, 160).toLowerCase();
}

function provenanceIsEligible(version = {}) {
  if (version.inferred === true) return false;
  return ALLOWED_EQUIVALENT_PROVENANCE.has(provenanceKey(version));
}

export function memoryVersionIsReusable(version, { question, now = Date.now() } = {}) {
  if (!version) return false;
  if (version.scope?.expiresAt && Date.parse(version.scope.expiresAt) <= now) return false;
  const intent = classifyCanonicalIntent(question) || (version.scope?.question ? classifyCanonicalIntent(version.scope.question) : null);
  const maxAge = intent ? ATOMIC_INTENT_STALENESS_MS[intent.id] : null;
  if (!maxAge) return true;
  if (version.scope?.expiresAt && Date.parse(version.scope.expiresAt) > now) return true;
  const recorded = Date.parse(version.scope?.recordedAt || version.confirmedAt || '') || 0;
  return recorded > 0 && (now - recorded) <= maxAge;
}

function hasExactMemoryMatch(vault, { question, applicationId, employer, now }) {
  const normalized = normalizeQuestion(question);
  return (vault?.facts || []).some(fact => {
    const version = currentFactVersion(fact);
    const scope = version?.scope;
    return fact.status === 'active' && scope?.memory === true && normalizeQuestion(scope.question) === normalized
      && memoryVersionIsReusable(version, { question, now })
      && (scope.kind === 'candidate' || scope.kind === 'application' && scope.applicationId === applicationId || scope.kind === 'employer' && scope.employer === employer);
  });
}

export function classifyLearningState(input = {}) {
  const verification = text(input.verificationState || input.verificationStatus, 40);
  const category = text(input.category || input.scope?.category, 40).toLowerCase();
  const provenance = text(input.provenance || input.originalSource || input.source, 160).toLowerCase();
  const userConfirmed = input.userConfirmed === true || verification === 'user-confirmed';
  const allowlisted = !provenance || ALLOWED_EQUIVALENT_PROVENANCE.has(provenance);
  const inferred = input.inferred === true || (provenance && !allowlisted);
  if (!text(input.value, 600) && input.normalizedValue == null) return LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER;
  if (inferred) return userConfirmed ? LEARNING_STATE_CLASSES.DERIVED_BUT_REVIEWABLE : LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER;
  if (category === 'preference' && userConfirmed) return LEARNING_STATE_CLASSES.USER_PREFERENCE;
  if (userConfirmed || verification === 'document-verified') return LEARNING_STATE_CLASSES.CONFIRMED_FACT;
  return LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER;
}

function sourceClassEligible(intent, version) {
  if (!provenanceIsEligible(version)) return false;
  const sourceClass = classifyLearningState({
    value: version.value,
    verificationState: version.verificationState,
    category: version.scope?.category,
    provenance: version.provenance,
    userConfirmed: version.verificationState === 'user-confirmed',
  });
  if (sourceClass === LEARNING_STATE_CLASSES.USER_PREFERENCE) return intent.allowsPreference === true;
  return sourceClass === LEARNING_STATE_CLASSES.CONFIRMED_FACT;
}

function scopeCompatible(version, input, question) {
  const scopeKind = version.scope?.kind;
  const applicationId = version.scope?.applicationId;
  const targetImplicit = hasImplicitEmployerScope(question);
  const sourceImplicit = hasImplicitEmployerScope(version.scope?.question);
  if (targetImplicit || sourceImplicit) return scopeKind === 'application' && applicationId === input.applicationId;
  if (scopeKind === 'application') return applicationId === input.applicationId;
  if (scopeKind === 'employer') return version.scope.employer === input.employer;
  return scopeKind === 'candidate' || !scopeKind;
}

function scopeRank(version, input) {
  const scopeKind = version.scope?.kind;
  if (scopeKind === 'application' && version.scope.applicationId === input.applicationId) return 0;
  if (scopeKind === 'employer' && version.scope.employer === input.employer) return 1;
  if (scopeKind === 'candidate' || !scopeKind) return 2;
  return 9;
}

export function proposeEquivalentAnswer(vault, input = {}, now = Date.now()) {
  const question = String(input.question || '').trim();
  const intent = classifyCanonicalIntent(question);
  if (!intent || vault?.consent?.status !== 'granted' || !vault.consent.scopes?.includes('confirmed-facts')) {
    return { class: LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER, intent: intent?.id || null, requiresConfirmation: true, factId: null, factVersion: null };
  }
  if (hasExactMemoryMatch(vault, { question, applicationId: input.applicationId, employer: input.employer, now })) {
    return { class: LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER, intent: intent.id, requiresConfirmation: true, factId: null, factVersion: null, exactMatchExists: true };
  }
  const ranked = [...(vault.facts || [])]
    .map(fact => {
      const version = currentFactVersion(fact);
      if (!version || fact.status !== 'active') return null;
      if (!memoryVersionIsReusable(version, { question, now })) return null;
      if (!sourceClassEligible(intent, version)) return null;
      if (!scopeCompatible(version, input, question)) return null;
      const memoryIntent = version.scope?.memory ? classifyCanonicalIntent(version.scope.question) : null;
      if (memoryIntent && memoryIntent.id !== intent.id) return null;
      const fieldMatch = intent.fieldKeys.includes(fact.fieldKey);
      if (!fieldMatch && memoryIntent?.id !== intent.id) return null;
      if (version.verificationState !== 'user-confirmed' && version.verificationState !== 'document-verified') return null;
      const rank = scopeRank(version, input);
      if (rank === 9) return null;
      return { fact, version, scopeRank: rank };
    })
    .filter(Boolean)
    .sort((a, b) => a.scopeRank - b.scopeRank);
  const match = ranked[0];
  if (!match) return { class: LEARNING_STATE_CLASSES.UNKNOWN_NEEDS_USER, intent: intent.id, requiresConfirmation: true, factId: null, factVersion: null };
  const category = text(match.version.scope?.category, 40).toLowerCase();
  return {
    class: category === 'preference' && intent.allowsPreference ? LEARNING_STATE_CLASSES.USER_PREFERENCE : LEARNING_STATE_CLASSES.DERIVED_BUT_REVIEWABLE,
    intent: intent.id,
    requiresConfirmation: true,
    autoResolved: false,
    factId: match.fact.id,
    factVersion: match.fact.currentVersion,
    exactMatchExists: false,
  };
}

export function attachEquivalentAnswerProposals(session, vault, now = new Date()) {
  if (!session || session.state === 'Paused' || session.submissionAttempt || vault?.consent?.status !== 'granted') return session;
  let changed = false;
  const actions = (session.actions || []).map(action => {
    if (action.status !== 'open' || action.type !== 'AMBIGUOUS_FACT' || action.metadata?.answerReference || action.metadata?.equivalentAnswerProposal) return action;
    const proposal = proposeEquivalentAnswer(vault, {
      question: action.metadata?.question, applicationId: session.id, employer: session.role?.employer, now: new Date(now).getTime(),
    });
    if (!proposal.factId || proposal.exactMatchExists) return action;
    changed = true;
    return {
      ...action,
      metadata: {
        ...action.metadata,
        equivalentAnswerProposal: {
          factId: proposal.factId,
          factVersion: proposal.factVersion,
          intent: proposal.intent,
          class: proposal.class,
          requiresConfirmation: true,
          autoResolved: false,
        },
      },
    };
  });
  if (!changed) return session;
  return { ...session, actions, updatedAt: new Date(now).toISOString() };
}

export function applicationEfficiencySnapshot(session = {}, extras = {}) {
  const actions = Array.isArray(session.actions) ? session.actions : [];
  const timeline = Array.isArray(session.timeline) ? session.timeline : [];
  const openFacts = actions.filter(item => item.status === 'open' && item.type === 'AMBIGUOUS_FACT');
  const resolvedFacts = actions.filter(item => item.status === 'resolved' && item.type === 'AMBIGUOUS_FACT');
  const reused = resolvedFacts.filter(item => item.metadata?.answerReference?.factId);
  const proposed = openFacts.filter(item => item.metadata?.equivalentAnswerProposal?.factId);
  const atsFailures = actions.filter(item => item.type === 'EMPLOYER_ATS_FAILURE');
  const createdAt = Date.parse(session.createdAt || '') || null;
  const reviewReadyAt = Date.parse(timeline.find(item => item.kind === 'FINAL_REVIEW_READY')?.at || '') || null;
  const snapshot = {
    schemaVersion: APPLICATION_EFFICIENCY_SCHEMA_VERSION,
    contentFree: true,
    containsCandidateValues: false,
    stages: {
      discovered: extras.discovered === true || Boolean(session.role?.directEmployerUrl),
      qualified: extras.qualified === true,
      captured: extras.captured === true || Boolean(session.id),
      resumePrepared: Boolean(session.documentVersion),
      questionsResolved: openFacts.length === 0 && resolvedFacts.length >= 0,
      humanReviewReady: Boolean(reviewReadyAt) || session.stage === 'final_review' || session.stage === 'submission_approval',
    },
    timeToReviewReadyMs: createdAt && reviewReadyAt && reviewReadyAt >= createdAt ? reviewReadyAt - createdAt : null,
    needsYouInterruptions: actions.filter(item => item.status === 'open').length,
    unansweredFields: openFacts.length + (Array.isArray(extras.unansweredFieldKeys) ? extras.unansweredFieldKeys.length : 0),
    userCorrections: Math.max(0, Math.floor(Number(extras.userCorrections) || 0)),
    confirmedFactReuseCount: reused.length,
    equivalentProposalCount: proposed.length,
    duplicateReworkCount: reused.filter(item => Number(item.metadata?.answerReference?.factVersion) > 1).length,
    captureFailureCount: Math.max(0, Math.floor(Number(extras.captureFailureCount) || 0)),
    atsFailurePoints: atsFailures.slice(0, 20).map(item => ({
      type: 'EMPLOYER_ATS_FAILURE',
      reasonCode: contentFreeReasonCode(item.metadata?.reasonCode || item.metadata?.failureCode),
    })),
  };
  assertContentFree(snapshot);
  return snapshot;
}

export function createImprovementCandidate(input = {}) {
  const type = text(input.type, 80);
  if (!IMPROVEMENT_CANDIDATE_TYPES.includes(type)) throw new Error('Improvement candidate type is not allowed.');
  if (input.autoApplied === true || input.promoted === true) throw new Error('Improvement candidates must not auto-apply or self-promote.');
  const candidate = {
    schemaVersion: APPLICATION_EFFICIENCY_SCHEMA_VERSION,
    type,
    status: 'proposed',
    autoApplied: false,
    promoted: false,
    promotionPath: 'observe-measure-propose-test-independent-verification-owner-approval',
    evidenceHash: createHash('sha256').update(JSON.stringify(input.evidence || {})).digest('hex'),
    expectedBenefit: text(input.expectedBenefit, 240),
    risk: text(input.risk, 40) || 'requires-review',
    rollbackPlan: text(input.rollbackPlan, 240) || 'leave production behavior unchanged',
  };
  assertContentFree(candidate);
  return candidate;
}

export function publicEquivalentAnswerProposal(proposal) {
  if (!proposal?.factId) return null;
  return clone({
    factId: proposal.factId,
    factVersion: proposal.factVersion,
    intent: proposal.intent,
    class: proposal.class,
    requiresConfirmation: true,
    autoResolved: false,
  });
}
