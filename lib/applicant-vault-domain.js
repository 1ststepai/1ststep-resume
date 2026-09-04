import { createHash, randomUUID } from 'node:crypto';
import { PROHIBITED_CREDENTIAL_KEY, PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';

export const APPLICANT_VAULT_POLICY_VERSION = '2026-08-29';
export const APPLICANT_VAULT_SCHEMA_VERSION = 1;

const MAX_FACTS = 100;
const MAX_DOCUMENTS = 30;
const MAX_AUDIT_EVENTS = 500;
const MAX_FACT_VALUE = 12_000;
const MAX_DOCUMENT_TEXT = 120_000;
const MAX_VAULT_BYTES = 750_000;
const ALLOWED_DOCUMENT_TYPES = new Set(['master-resume', 'tailored-resume', 'cover-letter']);
const ALLOWED_SENSITIVITIES = new Set(['standard', 'sensitive', 'highly-sensitive']);
const ALLOWED_VERIFICATION = new Set(['user-confirmed', 'document-verified']);
const SAFE_DEMOGRAPHIC_DEFAULTS = new Set(['leave optional demographics unanswered', 'prefer not to answer']);
const CONSEQUENTAL_FIELDS = new Set([
  'authorization', 'sponsorship', 'outsideEmployment', 'background', 'drugHealth',
  'formerEmployerConflict', 'references', 'licenses', 'driving', 'demographics',
  'citizenship', 'clearance', 'exportControl', 'criminalHistory', 'disability', 'veteranStatus', 'referrals', 'restrictiveAgreements',
]);
const PROHIBITED_KEY = PROHIBITED_CREDENTIAL_KEY;
const PROHIBITED_VALUE = PROHIBITED_SECRET_VALUE;

const text = (value, max = 256) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const iso = value => {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) throw new Error('A valid timestamp is required.');
  return parsed.toISOString();
};
const clone = value => JSON.parse(JSON.stringify(value));

function assertNoSecrets(value, path = 'vault') {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSecrets(item, `${path}.${index}`));
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (PROHIBITED_KEY.test(key)) throw new Error(`Credentials and challenge answers are not allowed in the applicant vault: ${path}.${key}`);
      assertNoSecrets(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && PROHIBITED_VALUE.test(value)) {
    throw new Error(`Credentials and challenge answers are not allowed in the applicant vault: ${path}`);
  }
}

function auditEvent(type, subjectId, at, metadata = {}) {
  return { id: randomUUID(), type, subjectId: text(subjectId, 128), at: iso(at), metadata: clone(metadata) };
}

export function createApplicantVault(input = {}) {
  const vault = {
    schemaVersion: APPLICANT_VAULT_SCHEMA_VERSION,
    consent: input.consent || { status: 'not-granted', policyVersion: APPLICANT_VAULT_POLICY_VERSION, scopes: [], grantedAt: null, revokedAt: null },
    facts: Array.isArray(input.facts) ? input.facts : [],
    documents: Array.isArray(input.documents) ? input.documents : [],
    audit: Array.isArray(input.audit) ? input.audit : [],
    updatedAt: input.updatedAt || null,
  };
  return validateApplicantVault(vault);
}

export function grantVaultConsent(input = {}, at) {
  const stamp = iso(at);
  const scopes = [...new Set((Array.isArray(input.scopes) ? input.scopes : ['confirmed-facts', 'documents']).map(value => text(value, 64)).filter(Boolean))];
  if (!scopes.length) throw new Error('At least one vault consent scope is required.');
  return createApplicantVault({
    consent: { status: 'granted', policyVersion: APPLICANT_VAULT_POLICY_VERSION, scopes, grantedAt: stamp, revokedAt: null },
    facts: [], documents: [], updatedAt: stamp,
    audit: [auditEvent('CONSENT_GRANTED', 'vault', stamp, { policyVersion: APPLICANT_VAULT_POLICY_VERSION, scopes })],
  });
}

export function renewVaultConsent(inputVault, input = {}, at) {
  const vault = createApplicantVault(inputVault);
  if (vault.consent.status !== 'revoked') throw new Error('Only revoked vault consent can be renewed.');
  const stamp = iso(at);
  const scopes = [...new Set((Array.isArray(input.scopes) ? input.scopes : ['confirmed-facts', 'documents']).map(value => text(value, 64)).filter(Boolean))];
  if (!scopes.length) throw new Error('At least one vault consent scope is required.');
  return validateApplicantVault({ ...vault, consent: { status: 'granted', policyVersion: APPLICANT_VAULT_POLICY_VERSION, scopes, grantedAt: stamp, revokedAt: null }, updatedAt: stamp, audit: [...vault.audit, auditEvent('CONSENT_RENEWED', 'vault', stamp, { policyVersion: APPLICANT_VAULT_POLICY_VERSION, scopes })] });
}

function requireConsent(vault, scope) {
  if (vault.consent.status !== 'granted' || !vault.consent.scopes.includes(scope)) {
    throw new Error(`Active ${scope} consent is required.`);
  }
}

export function upsertVaultFact(inputVault, input = {}, at) {
  const vault = createApplicantVault(inputVault);
  requireConsent(vault, 'confirmed-facts');
  const fieldKey = text(input.fieldKey, 64);
  const value = text(input.value, MAX_FACT_VALUE);
  const provenance = text(input.provenance || input.source, 160);
  const verificationState = text(input.verificationState, 32);
  const confidence = Number(input.confidence);
  if (!fieldKey || PROHIBITED_KEY.test(fieldKey)) throw new Error('A safe normalized fact key is required.');
  if (!value) throw new Error('A confirmed fact value is required.');
  if (!provenance) throw new Error('Fact provenance is required.');
  if (!ALLOWED_VERIFICATION.has(verificationState)) throw new Error('Facts must be user-confirmed or document-verified.');
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Fact confidence must be between 0 and 1.');
  if (fieldKey === 'demographics' && !SAFE_DEMOGRAPHIC_DEFAULTS.has(value.toLowerCase())) {
    throw new Error('The vault stores only an unanswered or prefer-not-to-answer demographic default.');
  }
  const consequential = CONSEQUENTAL_FIELDS.has(fieldKey);
  const autoReuse = consequential ? false : input.autoReuse === true;
  const stamp = iso(at);
  const existing = vault.facts.find(fact => fact.fieldKey === fieldKey);
  const factId = existing?.id || text(input.id, 128) || randomUUID();
  const version = (existing?.currentVersion || 0) + 1;
  const factVersion = {
    version, value, provenance, confidence, verificationState,
    sensitivity: ALLOWED_SENSITIVITIES.has(input.sensitivity) ? input.sensitivity : 'standard',
    autoReuse, scope: clone(input.scope && typeof input.scope === 'object' ? input.scope : {}),
    confirmedAt: stamp, revokedAt: null,
  };
  const updated = {
    id: factId, fieldKey, label: text(input.label || fieldKey, 160), status: 'active',
    currentVersion: version, versions: [...(existing?.versions || []), factVersion], createdAt: existing?.createdAt || stamp, updatedAt: stamp,
  };
  const facts = existing ? vault.facts.map(fact => fact.id === existing.id ? updated : fact) : [updated, ...vault.facts];
  return validateApplicantVault({ ...vault, facts, updatedAt: stamp, audit: [...vault.audit, auditEvent(existing ? 'FACT_UPDATED' : 'FACT_CREATED', factId, stamp, { fieldKey, version, consequential })] });
}

export function revokeVaultFact(inputVault, factId, at) {
  const vault = createApplicantVault(inputVault);
  requireConsent(vault, 'confirmed-facts');
  const existing = vault.facts.find(fact => fact.id === factId);
  if (!existing) throw new Error('Vault fact not found.');
  const stamp = iso(at);
  const facts = vault.facts.map(fact => fact.id === factId ? { ...fact, status: 'revoked', updatedAt: stamp, revokedAt: stamp } : fact);
  return validateApplicantVault({ ...vault, facts, updatedAt: stamp, audit: [...vault.audit, auditEvent('FACT_REVOKED', factId, stamp, { fieldKey: existing.fieldKey })] });
}

export function upsertVaultDocument(inputVault, input = {}, at) {
  const vault = createApplicantVault(inputVault);
  requireConsent(vault, 'documents');
  const type = text(input.type, 32);
  if (!ALLOWED_DOCUMENT_TYPES.has(type)) throw new Error('Unsupported applicant document type.');
  const documentText = text(input.text, MAX_DOCUMENT_TEXT);
  if (documentText.length < 40) throw new Error('Applicant document text is too short.');
  const stamp = iso(at);
  const existing = input.id ? vault.documents.find(document => document.id === input.id) : vault.documents.find(document => document.type === type && document.status === 'active');
  const documentId = existing?.id || randomUUID();
  const version = (existing?.currentVersion || 0) + 1;
  const itemVersion = {
    version, text: documentText, fileName: text(input.fileName, 180), provenance: text(input.provenance || 'candidate-reviewed', 160),
    sha256: createHash('sha256').update(documentText).digest('hex'), createdAt: stamp,
    qa: { atsTextExtracted: input.qa?.atsTextExtracted === true, renderedPagesReviewed: input.qa?.renderedPagesReviewed === true, pageCount: Number(input.qa?.pageCount) || null },
  };
  const updated = { id: documentId, type, title: text(input.title || type, 180), status: 'active', currentVersion: version, versions: [...(existing?.versions || []), itemVersion], createdAt: existing?.createdAt || stamp, updatedAt: stamp };
  const documents = existing ? vault.documents.map(document => document.id === existing.id ? updated : document) : [updated, ...vault.documents];
  return validateApplicantVault({ ...vault, documents, updatedAt: stamp, audit: [...vault.audit, auditEvent(existing ? 'DOCUMENT_UPDATED' : 'DOCUMENT_CREATED', documentId, stamp, { type, version, sha256: itemVersion.sha256 })] });
}

export function syncCanonicalApplicantProfile(inputVault, input = {}, at) {
  let vault = createApplicantVault(inputVault);
  const facts = Array.isArray(input.facts) ? input.facts : [];
  const masterResume = input.masterResume && typeof input.masterResume === 'object' ? input.masterResume : null;
  if (facts.length > MAX_FACTS) throw new Error('Canonical profile fact limit exceeded.');

  for (const fact of facts) {
    const fieldKey = text(fact?.fieldKey, 64);
    const existing = vault.facts.find(item => item.status === 'active' && item.fieldKey === fieldKey);
    const current = existing?.versions?.find(version => version.version === existing.currentVersion) || existing?.versions?.at(-1);
    const consequential = CONSEQUENTAL_FIELDS.has(fieldKey);
    const normalized = {
      value: text(fact?.value, MAX_FACT_VALUE),
      provenance: text(fact?.provenance || fact?.source, 160),
      verificationState: text(fact?.verificationState, 32),
      confidence: Number(fact?.confidence),
      sensitivity: ALLOWED_SENSITIVITIES.has(fact?.sensitivity) ? fact.sensitivity : 'standard',
      autoReuse: consequential ? false : fact?.autoReuse === true,
      scope: clone(fact?.scope && typeof fact.scope === 'object' ? fact.scope : {}),
    };
    const unchanged = current
      && current.value === normalized.value
      && current.provenance === normalized.provenance
      && current.verificationState === normalized.verificationState
      && current.confidence === normalized.confidence
      && current.sensitivity === normalized.sensitivity
      && current.autoReuse === normalized.autoReuse
      && JSON.stringify(current.scope || {}) === JSON.stringify(normalized.scope);
    if (!unchanged) vault = upsertVaultFact(vault, fact, at);
  }

  if (masterResume) {
    const existing = vault.documents.find(document => document.status === 'active' && document.type === 'master-resume');
    const current = existing?.versions?.find(version => version.version === existing.currentVersion) || existing?.versions?.at(-1);
    const resumeText = text(masterResume.text, MAX_DOCUMENT_TEXT);
    const resumeSha256 = createHash('sha256').update(resumeText).digest('hex');
    const unchanged = current
      && current.sha256 === resumeSha256
      && current.fileName === text(masterResume.fileName, 180);
    if (!unchanged) vault = upsertVaultDocument(vault, {
      ...masterResume,
      type: 'master-resume',
      title: masterResume.title || 'Master resume',
      provenance: masterResume.provenance || 'candidate-reviewed',
    }, at);
  }

  return validateApplicantVault(vault);
}

export function revokeVaultDocument(inputVault, documentId, at) {
  const vault = createApplicantVault(inputVault);
  requireConsent(vault, 'documents');
  if (!vault.documents.some(document => document.id === documentId)) throw new Error('Vault document not found.');
  const stamp = iso(at);
  const documents = vault.documents.map(document => document.id === documentId ? { ...document, status: 'revoked', updatedAt: stamp, revokedAt: stamp } : document);
  return validateApplicantVault({ ...vault, documents, updatedAt: stamp, audit: [...vault.audit, auditEvent('DOCUMENT_REVOKED', documentId, stamp)] });
}

export function revokeVaultConsent(inputVault, at) {
  const vault = createApplicantVault(inputVault);
  const stamp = iso(at);
  return validateApplicantVault({
    ...vault,
    consent: { ...vault.consent, status: 'revoked', revokedAt: stamp },
    facts: vault.facts.map(fact => ({ ...fact, status: 'revoked', revokedAt: stamp, updatedAt: stamp })),
    documents: vault.documents.map(document => ({ ...document, status: 'revoked', revokedAt: stamp, updatedAt: stamp })),
    updatedAt: stamp,
    audit: [...vault.audit, auditEvent('CONSENT_REVOKED', 'vault', stamp)],
  });
}

export function validateApplicantVault(input) {
  const vault = input && typeof input === 'object' && !Array.isArray(input) ? clone(input) : null;
  if (!vault || vault.schemaVersion !== APPLICANT_VAULT_SCHEMA_VERSION) throw new Error('Applicant vault schema version 1 is required.');
  if (!vault.consent || !['not-granted', 'granted', 'revoked'].includes(vault.consent.status)) throw new Error('Applicant vault consent status is invalid.');
  if (!Array.isArray(vault.consent.scopes) || !Array.isArray(vault.facts) || !Array.isArray(vault.documents) || !Array.isArray(vault.audit)) throw new Error('Applicant vault collections are invalid.');
  if (vault.facts.length > MAX_FACTS || vault.documents.length > MAX_DOCUMENTS || vault.audit.length > MAX_AUDIT_EVENTS) throw new Error('Applicant vault collection limit exceeded.');
  assertNoSecrets(vault);
  const serialized = JSON.stringify(vault);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_VAULT_BYTES) throw new Error('Applicant vault exceeds the 750 KB beta limit.');
  return vault;
}

export function publicVaultSummary(inputVault) {
  const vault = createApplicantVault(inputVault);
  return {
    schemaVersion: vault.schemaVersion, consent: vault.consent, updatedAt: vault.updatedAt,
    facts: vault.facts.map(fact => ({ ...fact, versions: fact.versions.map(version => ({ ...version, value: version.value })) })),
    documents: vault.documents.map(document => ({ ...document, versions: document.versions.map(version => ({ ...version, text: version.text })) })),
    audit: vault.audit,
  };
}
