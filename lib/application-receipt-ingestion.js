import { recordAuthoritativeApplicationReceipt } from './application-session-domain.js';
import { verifyEmployerReceiptEvidence } from './employer-receipt-verifier.js';

function csv(value) {
  return [...new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean))].slice(0, 100);
}

export function receiptAuthorityConfiguration(env = process.env) {
  return {
    allowedSenderDomains: csv(env.JOB_AGENT_RECEIPT_EMAIL_DOMAINS),
    allowedApiProviders: csv(env.JOB_AGENT_RECEIPT_API_PROVIDERS),
  };
}

// Raw page/email/API receipt content is deliberately scoped to this call. The
// verifier returns only hashes, masked references, and a sanitized employer URL;
// only that minimized result is handed to the durable application-session domain.
export function verifyAndRecordAuthoritativeReceipt(session, evidence, { env = process.env, verifiedAt = new Date() } = {}) {
  const authority = receiptAuthorityConfiguration(env);
  const verified = verifyEmployerReceiptEvidence({ session, evidence, ...authority, verifiedAt });
  return recordAuthoritativeApplicationReceipt(session, verified, verifiedAt);
}
