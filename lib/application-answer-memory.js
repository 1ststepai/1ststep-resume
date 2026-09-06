import { createHash, randomUUID } from 'node:crypto';
import { upsertVaultFact, revokeVaultFact } from './applicant-vault-domain.js';

const secret = /password|passcode|passkey|\botp\b|captcha|security code|verification code|one.time code|access token/i;
const sensitive = /citizen|clearance|export.control|itar|criminal|conviction|disab|veteran|ethnic|race|gender|religion|visa|sponsor|medical|sexual|referral|restrictive|non.compete|outside employment/i;
const permission = /\b(consent|authorize|authorise|permission|approve|waive|agree|exception|only for|only this)\b/i;
const uncertain = /\b(maybe|not sure|unsure|probably|i think|might|perhaps|approximately)\b/i;
export const normalizeMemoryQuestion = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 40);
export function memoryQuestion(session, actionId) {
  const action = session?.actions?.find(item => item.id === actionId);
  if (!action || action.type !== 'AMBIGUOUS_FACT') throw new Error('An ordinary screening question is required. Complete security and certification steps on the employer site.');
  const question = String(action.metadata?.question || '').trim();
  if (!question || secret.test(question)) throw new Error('The exact non-secret employer question is required.');
  return { action, question };
}
export function matchingAnswerMemory(vault, { question, applicationId, employer, now = Date.now() }) {
  if (vault?.consent?.status !== 'granted') return null;
  const priority = fact => ({ application: 0, employer: 1, candidate: 2 }[fact.versions?.find(v => v.version === fact.currentVersion)?.scope?.kind] ?? 3);
  return [...(vault.facts || [])].sort((a,b) => priority(a) - priority(b)).find(fact => {
    const v = fact.versions?.find(v => v.version === fact.currentVersion);
    const s = v?.scope;
    return fact.status === 'active' && s?.memory === true && normalizeMemoryQuestion(s.question) === normalizeMemoryQuestion(question)
      && (!s.expiresAt || Date.parse(s.expiresAt) > now)
      && (s.kind === 'candidate' || s.kind === 'application' && s.applicationId === applicationId || s.kind === 'employer' && s.employer === employer);
  }) || null;
}
export function rememberApplicationAnswer(vault, session, input, now = new Date()) {
  const { action, question } = memoryQuestion(session, input.actionId);
  if (action.status !== 'open') throw new Error('An open question is required.');
  const statement = String(input.statement || '').trim();
  if (!statement || statement.length > 2000) throw new Error('An answer of 1–2000 characters is required.');
  if (secret.test(statement) || /^\d{4,8}$/.test(statement)) throw new Error('Security codes and credentials are not allowed.');
  if (uncertain.test(statement)) throw new Error('A certain answer is required. Please clarify what you know before continuing.');
  const isSensitive = sensitive.test(question + ' ' + statement);
  if (isSensitive && input.sensitiveOptIn !== true) throw new Error('Explicit sensitive-memory opt-in is required, or answer only on the employer site.');
  const isPermission = permission.test(question + ' ' + statement) || input.kind === 'permission';
  const namedEmployer = normalizeMemoryQuestion(question + ' ' + statement).includes(normalizeMemoryQuestion(session.role.employer));
  const kind = isPermission || isSensitive || namedEmployer ? 'application' : ['application', 'employer'].includes(input.scope) ? input.scope : 'candidate';
  const category = isPermission ? 'permission' : input.kind === 'preference' || /\b(prefer|preference|salary|schedule|willing to travel|remote work)\b/i.test(question + ' ' + statement) ? 'preference' : 'fact';
  const existing = matchingAnswerMemory(vault, { question, applicationId: session.id, employer: session.role.employer, now: now.getTime() });
  if (existing) {
    const previous = existing.versions.find(v => v.version === existing.currentVersion);
    if (previous.value !== statement && input.replaceVersion !== existing.currentVersion && !(kind === 'application' && previous.scope.kind !== 'application')) {
      const error = new Error('This differs from your remembered answer. Replace the previous answer, or keep this answer only for this application?');
      error.code = 'MEMORY_CONFLICT'; error.factId = existing.id; error.version = existing.currentVersion; throw error;
    }
  }
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : null;
  if (expiresAt && Date.parse(expiresAt) <= now.getTime()) throw new Error('A future expiration is required.');
  const scope = { memory: true, category, kind, question, applicationId: session.id, actionId: action.id, employer: session.role.employer, recordedAt: now.toISOString(), expiresAt, exactStatement: statement };
  const fieldKey = `memory_${digest(JSON.stringify([normalizeMemoryQuestion(question), kind, kind === 'candidate' ? '' : kind === 'employer' ? session.role.employer : session.id]))}`;
  return upsertVaultFact(vault, { fieldKey, label: question, value: statement, provenance: 'user answered application question', verificationState: 'user-confirmed', confidence: 1,
    sensitivity: isSensitive ? 'sensitive' : 'standard', autoReuse: !isSensitive && !isPermission, scope }, now);
}

export function forgetAnswerMemory(vault, id, now = new Date()) {
  const fact = vault.facts.find(f => f.id === id);
  if (!fact?.versions.at(-1)?.scope?.memory) throw new Error('A remembered answer is required.');
  const revoked = revokeVaultFact(vault, id, now);
  return { ...revoked, facts: revoked.facts.map(f => f.id === id ? { ...f, versions: f.versions.map(v => ({ ...v, value: '', scope: { ...v.scope, exactStatement: '' } })) } : f) };
}

// Records a private-vault reference only. This is preparation, never a claim that
// the employer form was filled, and never permission to transmit or submit.
export function resolveApplicationAnswer(session, vault, input, now = new Date()) {
  const { action, question } = memoryQuestion(session, input.actionId);
  const fact = matchingAnswerMemory(vault, { question, applicationId: session.id, employer: session.role.employer, now: now.getTime() });
  if (!fact || fact.id !== input.factId || fact.currentVersion !== input.factVersion || input.confirmed !== true) throw new Error('A current, confirmed remembered answer is required.');
  if (action.status !== 'open' && action.metadata?.answerReference?.factId === fact.id && action.metadata.answerReference.factVersion === fact.currentVersion) return session;
  if (action.status !== 'open' || session.state === 'Paused' || session.submissionAttempt) throw new Error('An open, unpaused application question is required.');
  const actions = session.actions.map(item => item.id === action.id ? { ...item, status: 'resolved', resolvedAt: now.toISOString(), metadata: { ...item.metadata, answerReference: { factId: fact.id, factVersion: fact.currentVersion } } } : item);
  return { ...session, actions, state: actions.some(item => item.status === 'open') ? 'Waiting for You' : 'Preparing', updatedAt: now.toISOString(),
    timeline: [...session.timeline, { id: `event_${randomUUID()}`, kind: 'ANSWER_PREPARED', summary: 'A confirmed answer was saved by private vault reference. No employer transmission or submission occurred.', at: now.toISOString(), metadata: { actionId: action.id, factId: fact.id, factVersion: fact.currentVersion } }].slice(-200) };
}
