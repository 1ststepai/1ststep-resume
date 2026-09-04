import { applyApiHeaders, authenticateApiRequest, isOriginAllowed } from '../lib/api-security.js';
import { listDurableApplicationSessionAudit } from '../lib/application-session-store.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { jobAgentRuntimeConfiguration } from '../lib/job-agent-runtime-configuration.js';
import { isAdminSubject } from './session-capabilities.js';
import { recordConfiguredJobAgentOperationalEvent } from '../lib/job-agent-operational-metrics.js';
import { sendConfiguredJobAgentOperatorAlert } from '../lib/job-agent-operator-alert.js';
import { applicationAuditHeadExportConfiguration, buildApplicationAuditHeadExport } from '../lib/application-audit-head-export.js';
import { applicationAuditArchiveConfiguration, archiveApplicationAuditHeadExport } from '../lib/application-audit-archive-provider.js';

export const maxDuration = 20;

const SUBJECT = /^(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|dev:[A-Za-z0-9:._-]{1,120})$/;

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(204).end();
  }
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  if (!auth.localDevelopment && !isAdminSubject(auth.subject)) return res.status(403).json({ error: 'Administrator access is required.', code: 'ADMIN_ACCESS_REQUIRED' });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Application audit storage is not configured.', code: 'APPLICATION_AUDIT_RUNTIME_NOT_CONFIGURED' });
  const limit = await enforceDurableRateLimit(req, {
    scope: 'application-audit', subject: auth.subject,
    ipRule: { limit: 20, window: '1 m' }, accountRule: { limit: 500, window: '1 d' }, globalRule: { limit: 5_000, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Application audit verification is temporarily rate limited.');
  if (req.method === 'GET' && String(req.query?.head || '') === '1') return res.status(405).json({
    error: 'Audit-head exports require POST so tenant identity is not placed in a request URL.', code: 'AUDIT_HEAD_EXPORT_POST_REQUIRED',
  });
  if (req.method === 'POST' && req.body?.head !== true && String(req.body?.head || '') !== '1') return res.status(400).json({ error: 'POST is reserved for audit-head export.' });
  const input = req.method === 'POST' ? req.body : req.query;
  const subject = String(input?.subject || '').trim().toLowerCase();
  const sessionId = String(input?.id || '');
  if (!SUBJECT.test(subject) || !sessionId) return res.status(400).json({ error: 'A tenant subject and application session ID are required.' });
  try {
    const audit = await listDurableApplicationSessionAudit({ ...config, subject, sessionId, limit: 500 });
    if (!audit) return res.status(404).json({ error: 'Application audit ledger not found.' });
    if (req.method === 'POST') {
      const exportConfig = applicationAuditHeadExportConfiguration();
      if (!exportConfig) return res.status(503).json({ error: 'Application audit-head export signing is not configured.', code: 'APPLICATION_AUDIT_EXPORT_NOT_CONFIGURED' });
      const auditHeadExport = buildApplicationAuditHeadExport({ audit, exportSigningSecret: exportConfig.secret });
      const archiveRequested = input?.archive === true || String(input?.archive || '') === '1';
      let archiveReceipt = null;
      if (archiveRequested) {
        if (String(input?.archiveConfirmation || '') !== 'ARCHIVE RETENTION LOCKED AUDIT HEAD') return res.status(400).json({
          error: 'Explicit retention-archive confirmation is required.', code: 'AUDIT_ARCHIVE_CONFIRMATION_REQUIRED',
        });
        const archiveConfig = applicationAuditArchiveConfiguration();
        if (!archiveConfig.ready) return res.status(503).json({ error: 'Retention-locked audit archival is not configured.', code: 'AUDIT_ARCHIVE_NOT_CONFIGURED' });
        try {
          archiveReceipt = await archiveApplicationAuditHeadExport({ auditHeadExport, configuration: archiveConfig, env: process.env, redis: config.redis });
          await recordConfiguredJobAgentOperationalEvent('audit_head_archive_completed');
        } catch (error) {
          await recordConfiguredJobAgentOperationalEvent('audit_head_archive_failure');
          console.error(JSON.stringify({ type: 'application-audit-archive-error', name: error?.name || 'unknown' }));
          return res.status(502).json({ error: 'The retention archive did not return a valid signed lock acknowledgement.', code: 'AUDIT_ARCHIVE_FAILED', retentionLockVerified: false });
        }
      }
      if (input?.download === true || String(input?.download || '') === '1') res.setHeader('Content-Disposition', `attachment; filename="1ststep-audit-head-${auditHeadExport.recordReference.slice(0, 16)}.json"`);
      await recordConfiguredJobAgentOperationalEvent('audit_head_export_completed');
      return res.status(200).json({ auditHeadExport, archiveReceipt, tamperEvident: true, retentionLockVerified: archiveReceipt?.retentionLockVerified === true, containsCandidateFieldValues: false, includesTimelineEntries: false });
    }
    return res.status(200).json({ audit, immutableDuringRetention: true, containsCandidateFieldValues: false });
  } catch (error) {
    await recordConfiguredJobAgentOperationalEvent('audit_integrity_failure');
    await sendConfiguredJobAgentOperatorAlert('audit_integrity_failure');
    console.error(JSON.stringify({ type: 'application-audit-integrity-error', name: error?.name || 'unknown' }));
    return res.status(409).json({ error: 'Application audit integrity verification failed.', code: 'APPLICATION_AUDIT_INTEGRITY' });
  }
}
