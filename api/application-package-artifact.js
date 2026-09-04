import { applyApiHeaders, authenticateApiRequest, jobAgentAccessAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { jobAgentTenantId, readJobAgentRun } from '../lib/job-agent-run-store.js';
import { jobAgentRuntimeConfiguration, jobAgentArtifactStorageReady } from '../lib/job-agent-runtime-configuration.js';
import { readApplicationPackageArtifact } from '../lib/job-agent-object-storage.js';

export const maxDuration = 20;

function safeFilename(value) { return String(value || 'application-document').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 180); }
export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  if (!jobAgentAccessAllowed(auth)) return res.status(403).json({ error: 'Job Agent access is required.', code: 'JOB_AGENT_ACCESS_REQUIRED' });
  const config = jobAgentRuntimeConfiguration();
  if (!config) return res.status(503).json({ error: 'Durable package storage is not configured.', code: 'PACKAGE_RUNTIME_NOT_CONFIGURED' });
  if (!jobAgentArtifactStorageReady(config)) return res.status(503).json({ error: 'Private document storage is not configured.', code: 'PACKAGE_OBJECT_STORAGE_NOT_CONFIGURED' });
  const limit = await enforceDurableRateLimit(req, {
    scope: 'application-package-artifact', subject: auth.subject,
    ipRule: { limit: 40, window: '1 m' }, accountRule: { limit: 300, window: '1 d' }, globalRule: { limit: 10_000, window: '1 d' },
  });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Document downloads are temporarily rate limited. Your package remains saved.');
  try {
    const runId = String(req.query?.id || '');
    const key = String(req.query?.artifact || '');
    const run = await readJobAgentRun({ ...config, subject: auth.subject, runId });
    if (run?.taskType !== 'application_package') return res.status(404).json({ error: 'Package run not found.' });
    const artifact = (run.result?.artifacts || []).find(item => item.key === key);
    if (!artifact?.sha256) return res.status(404).json({ error: 'Document artifact not found.' });
    const buffer = await readApplicationPackageArtifact({ artifact, tenantId: jobAgentTenantId(auth.subject, config.partitionSecret), runId, dataEncryptionKey: config.dataEncryptionKey, configuration: config.objectStorage });
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Content-Type', artifact.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(artifact.filename)}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error(JSON.stringify({ type: 'application-package-artifact-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'The private document could not be downloaded.' });
  }
}
