import { applyApiHeaders, hasJsonContentType } from '../lib/api-security.js';
import { recordApplicationSubmissionAttempt, recordApplicationTransmission } from '../lib/application-session-domain.js';
import { verifyAndRecordAuthoritativeReceipt } from '../lib/application-receipt-ingestion.js';
import { readDurableApplicationSession, readDurableApplicationSessionForTenant, updateDurableApplicationSession, updateDurableApplicationSessionAsWorker } from '../lib/application-session-store.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { verifyInternalWorkerRequest } from '../lib/internal-worker-auth.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';

export const maxDuration = 20;

const SUBJECT = /^(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|dev:[A-Za-z0-9:._-]{1,120})$/;
const TENANT_ID = /^[a-f0-9]{40}$/;

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers?.origin) return res.status(403).json({ error: 'Internal worker requests cannot originate from a browser.', code: 'BROWSER_ORIGIN_FORBIDDEN' });
  if (!hasJsonContentType(req)) return res.status(415).json({ error: 'Content-Type must be application/json.' });
  if (JSON.stringify(req.body || {}).length > 30_000) return res.status(413).json({ error: 'Receipt-ingestion request is too large.' });
  const auth = verifyInternalWorkerRequest({ headers: req.headers || {}, body: req.body || {}, secret: process.env.JOB_AGENT_RECEIPT_SECRET });
  if (!auth.ok) return res.status(auth.code === 'WORKER_AUTH_NOT_CONFIGURED' ? 503 : 401).json({ error: 'Internal worker request not authorized.', code: auth.code });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Durable application sessions are not configured.', code: 'APPLICATION_SESSION_RUNTIME_NOT_CONFIGURED' });
  const limit = await enforceDurableRateLimit(req, {
    scope: 'application-receipts', subject: auth.nonceHash,
    ipRule: { limit: 60, window: '1 m' }, globalRule: { limit: 20_000, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Receipt ingestion is temporarily rate limited.');
  const replayKey = `1ststep:application-receipt:v1:nonce:${auth.nonceHash}`;
  const replayClaimed = await config.redis.set(replayKey, '1', { nx: true, ex: 10 * 60 });
  if (!replayClaimed) return res.status(409).json({ error: 'Signed worker request was already processed.', code: 'WORKER_REQUEST_REPLAYED' });
  const subject = String(req.body?.subject || '').trim().toLowerCase();
  const tenantId = String(req.body?.tenantId || '').trim().toLowerCase();
  const sessionId = String(req.body?.sessionId || '');
  if ((SUBJECT.test(subject) === TENANT_ID.test(tenantId)) || !sessionId) return res.status(400).json({ error: 'Exactly one valid tenant identity and an application session are required.' });
  try {
    const current = tenantId
      ? await readDurableApplicationSessionForTenant({ ...config, tenantId, sessionId })
      : await readDurableApplicationSession({ ...config, subject, sessionId });
    if (!current) return res.status(404).json({ error: 'Application session not found.' });
    const { version, audit: _auditHead, ...session } = current;
    if (Number(req.body?.version) !== version) return res.status(409).json({ error: 'Application session changed. Refresh and retry.', code: 'APPLICATION_SESSION_CONFLICT' });
    const action = String(req.body?.action || '');
    let updated;
    if (action === 'record-transmission') updated = recordApplicationTransmission(session, req.body?.evidence || {});
    else if (action === 'record-submission-attempt') updated = recordApplicationSubmissionAttempt(session, req.body?.evidence || {});
    else if (action === 'verify-authoritative-receipt') updated = verifyAndRecordAuthoritativeReceipt(session, req.body?.evidence || {});
    else return res.status(400).json({ error: 'Unsupported internal application action.' });
    const saved = tenantId
      ? await updateDurableApplicationSessionAsWorker({ ...config, tenantId, sessionId, expectedVersion: version, session: updated })
      : await updateDurableApplicationSession({ ...config, subject, sessionId, expectedVersion: version, session: updated });
    return res.status(200).json({ session: saved, authoritativeReceiptVerified: Boolean(saved?.receipt), externalApplicationExecution: false });
  } catch (error) {
    const message = String(error?.message || '');
    if (/required|expired|match|supported|already|valid|resolved|cannot|only|credentials|challenge/i.test(message)) return res.status(400).json({ error: message });
    console.error(JSON.stringify({ type: 'application-receipt-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'The signed application evidence could not be recorded.' });
  }
}
