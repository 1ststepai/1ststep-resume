import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { planEmployerFormStep } from './employer-browser-worker.js';

const GREENHOUSE_HOSTS = new Set([
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'job-boards.eu.greenhouse.io',
]);
const SAFE_ID = /^[A-Za-z0-9:_-]{8,160}$/;
const SAFE_REF = /^[A-Za-z0-9:_-]{3,160}$/;
const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9:_-]{0,119}$/;
const TOKEN_TTL_MS = 2 * 60 * 1000;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function parseGreenhouseUrl(value) {
  const url = new URL(String(value || ''));
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !GREENHOUSE_HOSTS.has(hostname)) {
    throw new Error('GREENHOUSE_EXTENSION_TARGET_INVALID');
  }
  url.hash = '';
  return url;
}

function sameRequisition(authority, pageUrl) {
  if (authority.hostname !== pageUrl.hostname) return false;
  const authorityJob = authority.pathname.match(/\/jobs\/(\d{1,30})(?:\/|$)/)?.[1] || authority.searchParams.get('gh_jid');
  const pageJob = pageUrl.pathname.match(/\/jobs\/(\d{1,30})(?:\/|$)/)?.[1] || pageUrl.searchParams.get('gh_jid');
  return Boolean(authorityJob && pageJob && authorityJob === pageJob);
}

function normalizeField(input = {}, index = 0) {
  if (['value', 'answer', 'defaultValue', 'currentValue'].some(key => Object.hasOwn(input, key))) throw new Error('EXTENSION_FIELD_VALUES_FORBIDDEN');
  const fieldRef = String(input.fieldRef || '').trim();
  const fieldKey = String(input.fieldKey || '').trim();
  const label = String(input.label || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 200);
  const inputType = String(input.inputType || 'text').trim().toLowerCase().slice(0, 40);
  if (!SAFE_REF.test(fieldRef) || !SAFE_FIELD.test(fieldKey) || !label || index >= 80) throw new Error('EXTENSION_FIELD_SCHEMA_INVALID');
  return { fieldRef, fieldKey, label, inputType, required: input.required === true };
}

export function extensionApplicationHandoffConfiguration(env = process.env) {
  const enabled = String(env.JOB_AGENT_EXTENSION_HANDOFF_ENABLED || '').toLowerCase() === 'true';
  const secret = String(env.JOB_AGENT_EXTENSION_HANDOFF_SECRET || '');
  if (!enabled) return { ready: false, reason: 'disabled' };
  if (secret.length < 32) return { ready: false, reason: 'secret-not-configured' };
  return { ready: true, provider: 'greenhouse', secret, tokenTtlMs: TOKEN_TTL_MS, storesCandidateValues: false, submitsApplications: false };
}

export function planGreenhouseExtensionHandoff({ session, pageUrl, fields = [], now = new Date() } = {}) {
  const authority = parseGreenhouseUrl(session?.role?.directEmployerUrl);
  const target = parseGreenhouseUrl(pageUrl);
  if (!sameRequisition(authority, target)) throw new Error('GREENHOUSE_REQUISITION_MISMATCH');
  const normalizedFields = fields.slice(0, 80).map(normalizeField);
  const resumeFields = normalizedFields.filter(field => field.inputType === 'file' && field.fieldKey === 'resumeDocument' && /(?:resume|résumé|curriculum vitae|\bcv\b)/i.test(field.label));
  if (resumeFields.length > 1) throw new Error('GREENHOUSE_RESUME_UPLOAD_AMBIGUOUS');
  const resumeField = resumeFields[0] || null;
  const plan = planEmployerFormStep({ session, pageUrl: target.href, fields: normalizedFields.filter(field => field !== resumeField), now });
  const stagedFields = resumeField && plan.status === 'ready-to-fill'
    ? [...plan.stagedFields, { fieldRef: resumeField.fieldRef, fieldKey: 'resumeDocument', documentVersion: session.documentVersion }]
    : plan.stagedFields;
  return {
    ...plan, stagedFields,
    documentUpload: resumeField && plan.status === 'ready-to-fill'
      ? { fieldRef: resumeField.fieldRef, fieldKey: 'resumeDocument', documentVersion: session.documentVersion }
      : null,
    provider: 'greenhouse', adapterVersion: 'greenhouse-v1.1',
  };
}

export function materializeGreenhouseExtensionFields(plan, vault) {
  if (plan?.status !== 'ready-to-fill' || !Array.isArray(plan.stagedFields) || !plan.stagedFields.length) throw new Error('GREENHOUSE_HANDOFF_NOT_READY');
  if (vault?.consent?.status !== 'granted' || !vault.consent.scopes?.includes('confirmed-facts')) throw new Error('VAULT_CONSENT_REQUIRED');
  const proposals = new Map((plan.stagedFields || []).filter(item => item.fieldKey !== 'resumeDocument').map(item => [item.factId, item]));
  const facts = new Map((vault.facts || []).map(fact => [fact.id, fact]));
  return [...proposals.entries()].map(([factId, staged]) => {
    const fact = facts.get(factId);
    const version = fact?.versions?.find(item => Number(item.version) === Number(fact.currentVersion));
    const valid = fact?.status === 'active'
      && fact.fieldKey === staged.fieldKey
      && !version?.revokedAt
      && version?.autoReuse === true
      && version?.sensitivity === 'standard'
      && ['user-confirmed', 'document-verified'].includes(version?.verificationState)
      && Number(version?.confidence) >= 0.92
      && typeof version?.value === 'string'
      && version.value.trim();
    if (!valid) throw new Error(`VAULT_FACT_NOT_REUSABLE:${staged.fieldKey}`);
    return { fieldRef: staged.fieldRef, fieldKey: staged.fieldKey, value: version.value };
  });
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createExtensionHandoffToken({ sessionId, recordVersion, approvalId, taskId, fieldSchemaHash, stagedFields, pageUrl, secret, now = new Date() } = {}) {
  if (String(secret || '').length < 32) throw new Error('EXTENSION_HANDOFF_SECRET_REQUIRED');
  const issuedAt = new Date(now);
  const target = parseGreenhouseUrl(pageUrl);
  const claims = {
    v: 1, provider: 'greenhouse', sessionId, recordVersion: Number(recordVersion), approvalId, taskId,
    fieldSchemaHash, stagedFields: (stagedFields || []).map(({ fieldRef, fieldKey }) => ({ fieldRef, fieldKey })),
    pageDigest: createHash('sha256').update(target.href).digest('hex'),
    issuedAt: issuedAt.toISOString(), expiresAt: new Date(issuedAt.getTime() + TOKEN_TTL_MS).toISOString(), nonce: randomUUID(),
  };
  if (![claims.sessionId, claims.approvalId, claims.taskId].every(value => SAFE_ID.test(String(value || ''))) || !/^[a-f0-9]{64}$/.test(String(fieldSchemaHash || '')) || !Number.isSafeInteger(claims.recordVersion) || claims.recordVersion < 1) {
    throw new Error('EXTENSION_HANDOFF_CLAIMS_INVALID');
  }
  const payload = Buffer.from(canonical(claims)).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyExtensionHandoffToken(token, { secret, now = new Date() } = {}) {
  if (String(secret || '').length < 32) throw new Error('EXTENSION_HANDOFF_SECRET_REQUIRED');
  const [payload, supplied, extra] = String(token || '').split('.');
  if (!payload || !supplied || extra) throw new Error('EXTENSION_HANDOFF_TOKEN_INVALID');
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('EXTENSION_HANDOFF_TOKEN_INVALID');
  let claims;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new Error('EXTENSION_HANDOFF_TOKEN_INVALID'); }
  const expiresAt = new Date(claims?.expiresAt);
  if (claims?.v !== 1 || claims?.provider !== 'greenhouse' || Number.isNaN(expiresAt.getTime()) || new Date(now) > expiresAt) throw new Error('EXTENSION_HANDOFF_TOKEN_EXPIRED');
  if (![claims.sessionId, claims.approvalId, claims.taskId].every(value => SAFE_ID.test(String(value || ''))) || !/^[a-f0-9]{64}$/.test(String(claims.fieldSchemaHash || ''))) throw new Error('EXTENSION_HANDOFF_TOKEN_INVALID');
  return claims;
}
