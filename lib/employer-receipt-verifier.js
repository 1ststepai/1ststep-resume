import { createHash } from 'node:crypto';
import { assertVerifiedEmployerNavigation } from './employer-browser-worker.js';
import { PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';

const POSITIVE_RECEIPT = /(?:thank you for applying|application (?:has been )?submitted|application received|we (?:have )?received your application|submission confirmed|successfully submitted)/i;
const NEGATIVE_RECEIPT = /(?:not submitted|submission failed|saved as (?:a )?draft|draft saved|application incomplete|finish later|unable to submit)/i;
const RAW_SECRET = PROHIBITED_SECRET_VALUE;
const CONFIRMATION_ID = /\b(?:confirmation|application|reference|submission)\s*(?:number|id|#|no\.?|code)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_-]{5,39})\b/i;
const SHA256 = /^[a-f0-9]{64}$/i;

function bounded(value, max, label) {
  const text = String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!text || text.length > max) throw new Error(`${label}_INVALID`);
  if (RAW_SECRET.test(text)) throw new Error('RECEIPT_EVIDENCE_SECRET_FORBIDDEN');
  return text;
}

function timestamp(value, label) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new Error(`${label}_INVALID`);
  return date;
}

function normalizedEvidence(value) {
  return bounded(value, 20_000, 'RECEIPT_TEXT').replace(/\s+/g, ' ').trim();
}

function positiveReceipt(text) {
  if (NEGATIVE_RECEIPT.test(text) || !POSITIVE_RECEIPT.test(text)) throw new Error('AUTHORITATIVE_RECEIPT_SIGNAL_MISSING');
}

function exactIdentity(text, session) {
  const normalized = text.toLowerCase();
  const requisition = String(session.role.requisitionId || '').toLowerCase();
  const employer = String(session.role.employer || '').toLowerCase();
  const title = String(session.role.title || '').toLowerCase();
  return Boolean((requisition && normalized.includes(requisition)) || (employer && title && normalized.includes(employer) && normalized.includes(title)));
}

function emailDomain(value) {
  const raw = bounded(value, 320, 'RECEIPT_SENDER');
  const match = /(?:<)?[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})(?:>)?/i.exec(raw);
  if (!match) throw new Error('RECEIPT_SENDER_INVALID');
  return match[1].toLowerCase();
}

function hashEvidence(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function baseSessionChecks(session, receivedAt, verifiedAt) {
  if (session?.stage !== 'receipt_verification' || !session?.submissionAttempt || !SHA256.test(String(session.submissionAttempt.responseFingerprint || ''))) {
    throw new Error('SUBMISSION_ATTEMPT_REQUIRED');
  }
  const received = timestamp(receivedAt, 'RECEIPT_TIMESTAMP');
  const verified = timestamp(verifiedAt, 'VERIFIED_TIMESTAMP');
  const submitted = timestamp(session.submissionAttempt.submittedAt, 'SUBMISSION_TIMESTAMP');
  if (received < submitted || received > new Date(verified.getTime() + 2 * 60_000)) throw new Error('RECEIPT_TIMESTAMP_ORDER_INVALID');
  return { received, verified };
}

function receiptOutput(session, { source, verificationMethod, received, evidenceHash, confirmationId = '', confirmationUrl = '' }) {
  return {
    source, verificationMethod, evidenceHash,
    documentVersion: session.documentVersion, requisitionId: session.role.requisitionId,
    receivedAt: received.toISOString(), confirmationId: confirmationId || evidenceHash,
    ...(confirmationUrl ? { confirmationUrl } : {}),
  };
}

export function verifyEmployerReceiptEvidence({ session, evidence = {}, allowedSenderDomains = [], allowedApiProviders = [], verifiedAt = new Date() } = {}) {
  const { received, verified } = baseSessionChecks(session, evidence.receivedAt, verifiedAt);
  const kind = String(evidence.kind || '').toLowerCase();
  if (kind === 'page') {
    const target = assertVerifiedEmployerNavigation(session, evidence.currentUrl);
    const title = bounded(evidence.pageTitle || 'Employer application confirmation', 300, 'RECEIPT_TITLE');
    const text = normalizedEvidence(evidence.pageText);
    positiveReceipt(`${title} ${text}`);
    if (String(evidence.responseFingerprint || '') !== session.submissionAttempt.responseFingerprint) throw new Error('RECEIPT_RESPONSE_CORRELATION_INVALID');
    const evidenceHash = hashEvidence({ kind, hostname: target.hostname, path: new URL(target.href).pathname, title, text, responseFingerprint: evidence.responseFingerprint, receivedAt: received.toISOString() });
    return receiptOutput(session, {
      source: 'EMPLOYER_CONFIRMATION_PAGE', verificationMethod: 'exact-employer-page', received, evidenceHash,
      confirmationId: CONFIRMATION_ID.exec(`${title} ${text}`)?.[1] || '', confirmationUrl: new URL(target.href).origin,
    });
  }
  if (kind === 'email') {
    const domain = emailDomain(evidence.from);
    const allowed = new Set(allowedSenderDomains.map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
    if (!allowed.has(domain) || evidence.dkim !== 'pass' || evidence.dmarc !== 'pass') throw new Error('RECEIPT_EMAIL_AUTHORITY_INVALID');
    const subject = bounded(evidence.subject, 500, 'RECEIPT_SUBJECT');
    const text = normalizedEvidence(evidence.messageText);
    positiveReceipt(`${subject} ${text}`);
    if (!exactIdentity(`${subject} ${text}`, session)) throw new Error('RECEIPT_IDENTITY_MISMATCH');
    const evidenceHash = hashEvidence({ kind, domain, subject, text, dkim: 'pass', dmarc: 'pass', receivedAt: received.toISOString() });
    return receiptOutput(session, {
      source: 'EMPLOYER_CONFIRMATION_EMAIL', verificationMethod: 'employer-sent-email', received, evidenceHash,
      confirmationId: CONFIRMATION_ID.exec(`${subject} ${text}`)?.[1] || '',
    });
  }
  if (kind === 'api') {
    const provider = bounded(evidence.provider, 120, 'RECEIPT_PROVIDER').toLowerCase();
    const allowed = new Set(allowedApiProviders.map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
    if (!allowed.has(provider) || evidence.signatureVerified !== true || !['submitted', 'received'].includes(String(evidence.status || '').toLowerCase())) {
      throw new Error('RECEIPT_API_AUTHORITY_INVALID');
    }
    if (String(evidence.requisitionId || '') !== session.role.requisitionId || String(evidence.documentVersion || '') !== session.documentVersion) throw new Error('RECEIPT_IDENTITY_MISMATCH');
    const requestId = bounded(evidence.requestId, 160, 'RECEIPT_REQUEST_ID');
    const evidenceHash = hashEvidence({ kind, provider, requestId, status: String(evidence.status).toLowerCase(), requisitionId: evidence.requisitionId, documentVersion: evidence.documentVersion, receivedAt: received.toISOString() });
    return receiptOutput(session, {
      source: 'EMPLOYER_ATS_API', verificationMethod: 'employer-ats-api', received, evidenceHash, confirmationId: requestId,
    });
  }
  throw new Error('RECEIPT_EVIDENCE_KIND_UNSUPPORTED');
}
