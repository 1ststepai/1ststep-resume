// Interview practice and coaching boundaries.
//
// The agent prepares a candidate BEFORE an interview. It must never claim, imply, or
// implement live-interview assistance, never invent experience the candidate does not
// have, and never touch protected traits or credentials.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  containsCredential, containsProtectedTrait, normalizeInterviewQuestion,
  normalizeInterviewQuestionSet, buildAnswerCoachingRequest, normalizeAnswerCoaching,
  summarizePracticeSession, STAR_DIMENSIONS,
} from '../lib/interview-practice.js';

// ── 1. Protected traits are never coachable ──────────────────────────────────
for (const probe of [
  'Are you authorized to work in the United States without sponsorship?',
  'Do you hold an active security clearance?',
  'Have you ever been convicted of a felony?',
  'Do you require any accommodation for a disability?',
  'Are you a protected veteran?',
  'What is your date of birth?',
  'Are you planning to start a family soon?',
]) {
  assert.equal(containsProtectedTrait(probe), true, `Must flag protected trait: ${probe}`);
  assert.equal(normalizeInterviewQuestion({ q: probe, type: 'Behavioral' }), null, `Must refuse to coach: ${probe}`);
}

// Ordinary role questions must survive.
const ordinary = normalizeInterviewQuestion({ q: 'Walk me through how you reduced supplier lead time on a critical program.', type: 'Behavioral', why: 'Tests ownership.' });
assert.ok(ordinary, 'A normal behavioral question must be usable.');
assert.equal(ordinary.type, 'Behavioral');
assert.equal(ordinary.id, 'q1');

// ── 2. Question sets drop protected-trait questions, keep the rest ───────────
const set = normalizeInterviewQuestionSet({
  questions: [
    { q: 'Describe a time you managed a vendor escalation end to end.', type: 'Behavioral' },
    { q: 'Are you a US citizen?', type: 'Culture Fit' },
    { q: 'How would you model total landed cost for a new supplier?', type: 'Technical' },
    { q: 'Do you have a disability we should know about?', type: 'Behavioral' },
  ],
});
assert.equal(set.questions.length, 2, 'Both protected-trait questions must be removed.');
assert.equal(set.rejectedForProtectedTrait, 2);
assert.equal(set.mode, 'practice');
assert.equal(set.liveAssistance, false, 'The question set must never advertise live assistance.');
assert.equal(set.questions.some(item => containsProtectedTrait(item.prompt)), false);
assert.throws(() => normalizeInterviewQuestionSet({ questions: [{ q: 'Are you a citizen?' }] }), /INTERVIEW_QUESTIONS_UNAVAILABLE/);

// ── 3. Credentials never reach a provider ────────────────────────────────────
assert.equal(containsCredential('my password: hunter2'), true);
assert.equal(containsCredential('the OTP is 402913'), true);
assert.equal(containsCredential('I led a captcha accessibility project'), false, 'Ordinary use of the word must not trip the guard.');

const question = { id: 'q1', prompt: 'Tell me about a supplier escalation you owned.', type: 'Behavioral' };
const role = { title: 'Supplier Manager', employer: 'Cedar Systems', jobDescription: 'Own supplier escalations and cost recovery.' };
assert.throws(
  () => buildAnswerCoachingRequest({ question, answer: 'I logged in with password: hunter2 and fixed it.', role }),
  /INTERVIEW_ANSWER_CONTAINS_CREDENTIAL/,
  'An answer containing a credential must be refused before any provider call.',
);
assert.throws(() => buildAnswerCoachingRequest({ question, answer: '   ', role }), /INTERVIEW_ANSWER_REQUIRED/);
assert.throws(() => buildAnswerCoachingRequest({ question: {}, answer: 'Something', role }), /INTERVIEW_QUESTION_REQUIRED/);

// ── 4. Only confirmed facts are offered as grounding ─────────────────────────
const facts = [
  { label: 'Employer', value: 'Universal Relocations', verificationState: 'user-confirmed' },
  { label: 'Skill', value: 'SAP Ariba sourcing', verificationState: 'user-confirmed' },
  { label: 'Unconfirmed claim', value: 'Directed a 40-person organization', verificationState: 'extracted' },
  { label: 'Citizenship', value: 'US citizen', verificationState: 'user-confirmed' },
];
const request = buildAnswerCoachingRequest({ question, answer: 'I ran the escalation with the supplier and recovered the schedule.', role, confirmedFacts: facts });
assert.equal(request.callType, 'interviewCoach');
assert.match(request.content, /Universal Relocations/);
assert.match(request.content, /SAP Ariba sourcing/);
assert.equal(/Directed a 40-person organization/.test(request.content), false, 'Unconfirmed extractions must not be sent as grounding.');
assert.equal(/US citizen/.test(request.content), false, 'A protected trait must not be sent even when confirmed.');
assert.match(request.content, /<candidate_practice_answer>/);

// ── 5. Coaching never invents experience ─────────────────────────────────────
const answer = 'I owned the escalation with our packaging supplier and recovered the delivery schedule within three weeks.';
const coaching = normalizeAnswerCoaching({
  star: { situation: 4, task: 4, action: 5, result: 2 },
  strengths: ['Clear ownership of the escalation.'],
  improvements: ['Quantify the recovered schedule.'],
  suggestedDetails: [
    'Name the packaging supplier relationship you described.',   // grounded in the answer
    'Mention your SAP Ariba sourcing experience.',                // grounded in a confirmed fact
    'Cite the $40M turnaround you led at Tesla.',                 // ungrounded — must be dropped
    'Reference your veteran status as leadership evidence.',      // protected trait — must be dropped
  ],
  followUp: 'What would you have done differently in week one?',
}, { answer, confirmedFacts: facts });

assert.equal(coaching.suggestedDetails.length, 2, 'Ungrounded and protected-trait suggestions must be dropped.');
assert.equal(coaching.suggestedDetails.some(item => /Tesla/.test(item)), false, 'A fabricated employer must never be suggested.');
assert.equal(coaching.suggestedDetails.some(item => /veteran/i.test(item)), false);
assert.equal(coaching.droppedUngroundedSuggestions, 2);
assert.equal(coaching.scriptedAnswerProvided, false, 'The coach must never hand over a scripted answer.');
assert.deepEqual(coaching.starMissing, ['result'], 'A weak Result must be reported as the gap.');
assert.deepEqual(coaching.starCovered, ['situation', 'task', 'action']);
assert.equal(coaching.overall, 3.8);
assert.equal(coaching.mode, 'practice');

// Scores are clamped, so a malformed model response cannot inflate readiness.
const clamped = normalizeAnswerCoaching({ star: { situation: 99, task: -5, action: 'x', result: 3.4 } }, { answer });
assert.deepEqual(STAR_DIMENSIONS.map(d => clamped.star[d]), [5, 0, 0, 3]);

// A protected-trait follow-up is suppressed rather than shown.
const suppressed = normalizeAnswerCoaching({ star: { situation: 3, task: 3, action: 3, result: 3 }, followUp: 'Are you authorized to work here without sponsorship?' }, { answer });
assert.equal(suppressed.followUp, '', 'A protected-trait follow-up must be suppressed.');

// ── 6. Session summary reports weak spots, never predicts outcomes ───────────
const summary = summarizePracticeSession([
  { question: { type: 'Behavioral' }, coaching: { overall: 4.5, starMissing: [] } },
  { question: { type: 'Behavioral' }, coaching: { overall: 4.2, starMissing: [] } },
  { question: { type: 'Technical' }, coaching: { overall: 2.4, starMissing: ['result'] } },
  { question: { type: 'Technical' }, coaching: { overall: 2.8, starMissing: ['result'] } },
  { question: { type: 'Situational' }, coaching: { overall: 3.9, starMissing: ['result'] } },
]);
assert.equal(summary.answered, 5);
assert.equal(summary.weakSpots[0].type, 'Technical', 'The weakest question type must surface first.');
assert.deepEqual(summary.strongTypes, ['Behavioral']);
assert.equal(summary.mostMissedDimension, 'result');
assert.equal(summary.readyForRole, false, 'Readiness must not trip on a weak average.');
assert.equal(Object.hasOwn(summary, 'offerLikelihood'), false, 'The summary must never predict an outcome.');
assert.deepEqual(summarizePracticeSession([]).weakSpots, []);
assert.equal(summarizePracticeSession([]).readyForRole, false);

// ── 7. No live-interview assistance anywhere in the surface ──────────────────
const lib = await readFile(new URL('../lib/interview-practice.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../api/ai.js', import.meta.url), 'utf8');
for (const [name, source] of [['lib/interview-practice.js', lib], ['api/ai.js', api]]) {
  for (const forbidden of [/getUserMedia/, /MediaRecorder/, /AudioContext/, /\btranscri(?:be|ption)\b/i, /speech[-\s]?to[-\s]?text/i, /realtime\s+(?:interview|answer)/i]) {
    assert.equal(forbidden.test(source), false, `${name} must contain no live-interview capture (${forbidden}).`);
  }
}

// Interview call types must require Job Agent access and be closed to guests.
assert.match(api, /JOB_AGENT_CALL_TYPES/);
assert.match(api, /JOB_AGENT_CALL_TYPES\.has\(callType\) && !jobAgentAccessAllowed\(auth\)/);
assert.match(api, /interviewQuestions: 0, interviewCoach: 0/, 'Guests must have a zero daily allowance for interview practice.');
assert.match(api, /Never ask about citizenship/);
assert.match(api, /Never write a scripted answer/);

console.log('Interview practice: protected traits refused, credentials blocked before provider contact, coaching grounded only in stated or confirmed facts, no scripted answers, no live-interview assistance, Job Agent access required.');
