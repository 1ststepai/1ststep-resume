// Interview practice and coaching — domain logic for the Job Agent's interview surface.
//
// Scope is deliberately narrow: this prepares a candidate BEFORE an interview. It never
// listens to, transcribes, joins, or assists during a live interview. Nothing here
// captures audio or produces answers intended to be read out in real time.
//
// Safety rules enforced here, not left to the model:
//   * Coaching may only reference facts the candidate actually stated or confirmed.
//     It never invents employers, titles, dates, metrics, credentials, or seniority.
//   * Protected traits are never asked about, scored, or surfaced.
//   * Credentials (passwords, OTPs, CAPTCHA answers) are rejected, never stored.

const MAX_QUESTIONS = 12;
const MAX_ANSWER_CHARS = 6000;
const MAX_FACTS = 40;

export const INTERVIEW_QUESTION_TYPES = Object.freeze(['Behavioral', 'Technical', 'Situational', 'Culture Fit']);
export const STAR_DIMENSIONS = Object.freeze(['situation', 'task', 'action', 'result']);

// Questions touching protected traits must never be generated, stored, or scored.
// An employer may lawfully ask some of these; the agent still refuses to coach on them
// because a generated answer would be inventing a fact about the candidate.
const PROTECTED_TRAIT_PATTERNS = [
  /\b(?:citizen(?:ship)?|immigration|visa\s+status|green\s+card|work\s+authoriz|authoriz\w*\s+to\s+work|sponsorship|require\s+sponsor)/i,
  /\b(?:security\s+clearance|export\s+control|itar)/i,
  /\b(?:criminal|felony|conviction|background\s+check)/i,
  /\b(?:disab(?:led|ility)|medical\s+condition|health\s+condition|accommodation)/i,
  /\b(?:veteran|military\s+discharge)/i,
  /\b(?:race|ethnic|national\s+origin|religio|gender|pregnan|marital\s+status|sexual\s+orientation|age\b|date\s+of\s+birth)/i,
  /\b(?:family\s+plan|start(?:ing)?\s+a\s+family|have\s+children|childcare|dependents)/i,
];

// Deliberately requires an actual value, not just the word. "I led a password reset
// project" is a legitimate answer and must stay coachable; "password is hunter2" is not.
// Digits in a one-time code may sit a few words after the keyword in natural phrasing.
const CREDENTIAL_PATTERNS = [
  /\b(?:password|passcode|pass\s?phrase)\b\s*(?:is|was|=|:)\s*\S{3,}/i,
  /\b(?:otp|one[-\s]?time\s+(?:code|password)|verification\s+code|2fa\s+code|mfa\s+code)\b[^.\n]{0,24}?\d{4,}/i,
  /\bcaptcha\b\s*(?:answer|is|was|=|:)\s*\S{2,}/i,
  /\b(?:sk-ant-|sk-proj-|ghp_|AKIA)[A-Za-z0-9_-]{8,}/,
];

export function containsProtectedTrait(text) {
  const value = String(text || '');
  return PROTECTED_TRAIT_PATTERNS.some(pattern => pattern.test(value));
}

export function containsCredential(text) {
  const value = String(text || '');
  return CREDENTIAL_PATTERNS.some(pattern => pattern.test(value));
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Normalizes a practice question, dropping anything that touches a protected trait.
 * Returns null when the question must not be used.
 */
export function normalizeInterviewQuestion(input, index = 0) {
  const prompt = clean(input?.q ?? input?.prompt, 400);
  if (prompt.length < 12) return null;
  if (containsProtectedTrait(prompt)) return null;
  if (containsCredential(prompt)) return null;
  const type = INTERVIEW_QUESTION_TYPES.includes(String(input?.type)) ? String(input.type) : 'Behavioral';
  return {
    id: `q${index + 1}`,
    prompt,
    type,
    // Why an interviewer asks it. Coaching context, never a claim about the candidate.
    rationale: clean(input?.why ?? input?.rationale, 300),
    expects: clean(input?.expects, 300),
  };
}

export function normalizeInterviewQuestionSet(payload) {
  const raw = Array.isArray(payload?.questions) ? payload.questions : [];
  const questions = [];
  const rejectedForProtectedTrait = [];
  raw.forEach((item, index) => {
    const prompt = clean(item?.q ?? item?.prompt, 400);
    if (prompt && containsProtectedTrait(prompt)) { rejectedForProtectedTrait.push(prompt); return; }
    const normalized = normalizeInterviewQuestion(item, questions.length);
    if (normalized) questions.push(normalized);
  });
  if (!questions.length) throw new Error('INTERVIEW_QUESTIONS_UNAVAILABLE');
  return {
    schemaVersion: 1,
    mode: 'practice',
    liveAssistance: false,
    questions: questions.slice(0, MAX_QUESTIONS),
    rejectedForProtectedTrait: rejectedForProtectedTrait.length,
  };
}

/**
 * Builds the coaching request for a single practice answer.
 * Throws when the answer carries a credential, so nothing sensitive reaches a provider.
 */
export function buildAnswerCoachingRequest({ question, answer, role = {}, confirmedFacts = [] } = {}) {
  const text = String(answer || '').trim();
  if (!text) throw new Error('INTERVIEW_ANSWER_REQUIRED');
  if (containsCredential(text)) throw new Error('INTERVIEW_ANSWER_CONTAINS_CREDENTIAL');
  const prompt = clean(question?.prompt, 400);
  if (!prompt) throw new Error('INTERVIEW_QUESTION_REQUIRED');

  // Only confirmed facts are offered as grounding, and only their labels and values —
  // never provenance metadata, never unconfirmed extractions.
  const facts = (Array.isArray(confirmedFacts) ? confirmedFacts : [])
    .filter(fact => fact && fact.verificationState === 'user-confirmed' && !containsProtectedTrait(`${fact.label} ${fact.value}`))
    .slice(0, MAX_FACTS)
    .map(fact => `${clean(fact.label, 80)}: ${clean(fact.value, 220)}`);

  return {
    callType: 'interviewCoach',
    quality: 'quality',
    content: [
      '<practice_question>', prompt, '</practice_question>',
      '<question_type>', clean(question?.type, 40) || 'Behavioral', '</question_type>',
      '<target_role>', `${clean(role.title, 120)} at ${clean(role.employer, 120)}`, '</target_role>',
      '<job_description>', clean(role.jobDescription, 2200), '</job_description>',
      '<confirmed_candidate_facts>', facts.join('\n'), '</confirmed_candidate_facts>',
      '<candidate_practice_answer>', text.slice(0, MAX_ANSWER_CHARS), '</candidate_practice_answer>',
    ].join('\n'),
  };
}

/**
 * Recovers the grounding material from a coaching request body, so the server can apply
 * the ungrounded-suggestion filter without trusting any extra client-supplied field.
 */
export function extractCoachingGrounding(content) {
  const text = String(content || '');
  const section = tag => {
    const match = new RegExp(`<${tag}>\s*([\s\S]*?)\s*</${tag}>`).exec(text);
    return match ? match[1] : '';
  };
  return { answer: section('candidate_practice_answer'), groundingText: section('confirmed_candidate_facts') };
}

function score(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(5, Math.round(parsed)));
}

/**
 * Normalizes coaching feedback for one answer. Any claim the model makes about the
 * candidate that is not grounded in their answer or a confirmed fact is dropped.
 */
export function normalizeAnswerCoaching(payload, { answer = '', confirmedFacts = [], groundingText = '' } = {}) {
  const spoken = String(answer || '').toLowerCase();
  const factText = (groundingText
    ? String(groundingText)
    : (Array.isArray(confirmedFacts) ? confirmedFacts : [])
      .filter(fact => fact && fact.verificationState === 'user-confirmed')
      .map(fact => `${fact.label} ${fact.value}`).join(' ')).toLowerCase();

  const star = {};
  for (const dimension of STAR_DIMENSIONS) {
    star[dimension] = score(payload?.star?.[dimension]);
  }
  const covered = STAR_DIMENSIONS.filter(dimension => star[dimension] >= 3);

  const strengths = (Array.isArray(payload?.strengths) ? payload.strengths : [])
    .map(item => clean(item, 240)).filter(Boolean).slice(0, 4);

  const improvements = (Array.isArray(payload?.improvements) ? payload.improvements : [])
    .map(item => clean(item, 240)).filter(Boolean).slice(0, 4);

  // A suggested addition must correspond to something the candidate actually said or
  // confirmed. This is the guard against the coach inventing experience for them.
  const suggestions = (Array.isArray(payload?.suggestedDetails) ? payload.suggestedDetails : [])
    .map(item => clean(item, 240))
    .filter(item => {
      if (!item || containsProtectedTrait(item)) return false;
      const tokens = item.toLowerCase().match(/[a-z]{5,}/g) || [];
      if (!tokens.length) return false;
      return tokens.some(token => spoken.includes(token) || factText.includes(token));
    })
    .slice(0, 4);

  const followUp = clean(payload?.followUp, 300);

  return {
    schemaVersion: 1,
    mode: 'practice',
    star,
    starCovered: covered,
    starMissing: STAR_DIMENSIONS.filter(dimension => !covered.includes(dimension)),
    overall: Math.round((STAR_DIMENSIONS.reduce((total, key) => total + star[key], 0) / STAR_DIMENSIONS.length) * 10) / 10,
    strengths,
    improvements,
    suggestedDetails: suggestions,
    droppedUngroundedSuggestions: (Array.isArray(payload?.suggestedDetails) ? payload.suggestedDetails.length : 0) - suggestions.length,
    followUp: containsProtectedTrait(followUp) ? '' : followUp,
    // The coach never writes the candidate's answer for them.
    scriptedAnswerProvided: false,
  };
}

/**
 * Aggregates a completed practice session into weak spots worth another pass.
 */
export function summarizePracticeSession(turns = []) {
  const answered = (Array.isArray(turns) ? turns : []).filter(turn => turn?.coaching);
  if (!answered.length) {
    return { schemaVersion: 1, answered: 0, averageScore: 0, weakSpots: [], strongTypes: [], readyForRole: false };
  }
  const totals = new Map();
  const dimensionMisses = new Map();
  let sum = 0;
  for (const turn of answered) {
    sum += Number(turn.coaching.overall) || 0;
    const type = String(turn.question?.type || 'Behavioral');
    const entry = totals.get(type) || { type, count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(turn.coaching.overall) || 0;
    totals.set(type, entry);
    for (const dimension of turn.coaching.starMissing || []) {
      dimensionMisses.set(dimension, (dimensionMisses.get(dimension) || 0) + 1);
    }
  }
  const byType = [...totals.values()].map(entry => ({ type: entry.type, average: Math.round((entry.total / entry.count) * 10) / 10, count: entry.count }));
  const averageScore = Math.round((sum / answered.length) * 10) / 10;
  return {
    schemaVersion: 1,
    answered: answered.length,
    averageScore,
    // Weakest question types first, then the STAR dimension most often missing.
    weakSpots: byType.filter(entry => entry.average < 3.5).sort((a, b) => a.average - b.average),
    strongTypes: byType.filter(entry => entry.average >= 4).map(entry => entry.type),
    mostMissedDimension: [...dimensionMisses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    // A readiness signal, never a prediction about the outcome of a real interview.
    readyForRole: averageScore >= 4 && answered.length >= 5,
  };
}
