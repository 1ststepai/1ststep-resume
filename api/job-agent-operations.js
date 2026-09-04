import { applyApiHeaders, authenticateApiRequest, isOriginAllowed } from '../lib/api-security.js';
import { enforceDurableRateLimit, sendRateLimitResult } from '../lib/durable-rate-limit.js';
import { jobAgentCostControlSummary, jobAgentOperationalMetricsConfiguration, readJobAgentOperationalMetrics } from '../lib/job-agent-operational-metrics.js';
import { isAdminSubject } from './session-capabilities.js';
import { jobAgentLaunchManifest } from '../lib/job-agent-launch-manifest.js';
import { productionEnvironmentShapeReport, publicProductionEnvironmentShapeReport } from '../lib/job-agent-production-environment-report.js';
import { readJobAgentSpendSummary } from '../lib/job-agent-spend-ledger.js';
import { readApplicationSubmissionTaskQueueHealth } from '../lib/application-submission-task-store.js';
import { readApplicationReceiptTaskQueueHealth } from '../lib/application-receipt-task-store.js';
import { readAccountDataExportQueueHealth } from '../lib/account-data-export-task.js';
import { readJobAgentOperatorAlertQueueHealth } from '../lib/job-agent-operator-alert-outbox.js';

export const maxDuration = 15;

export default async function handler(req, res) {
  applyApiHeaders(req, res);
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await authenticateApiRequest(req, { requireOpaqueSession: true });
  if (!auth.ok) return res.status(auth.status).json({ error: 'Request not authorized.', code: auth.code });
  if (!isAdminSubject(auth.subject)) return res.status(403).json({ error: 'Administrator access is required.' });
  const config = jobAgentOperationalMetricsConfiguration();
  if (!config) return res.status(503).json({ error: 'Operational metrics are not configured.' });
  const limit = await enforceDurableRateLimit(req, { scope: 'job-agent-operations', subject: auth.subject, ipRule: { limit: 12, window: '1 m' }, accountRule: { limit: 100, window: '1 d' } });
  if (!limit.ok) return sendRateLimitResult(res, limit, 'Operational metrics are temporarily rate limited.');
  try {
    const [metrics, monetarySpend, submissionQueue, receiptQueue, accountExportQueue, operatorAlertQueue] = await Promise.all([
      readJobAgentOperationalMetrics({ ...config, days: req.query?.days }),
      readJobAgentSpendSummary({ ...config, days: req.query?.days }),
      readApplicationSubmissionTaskQueueHealth(config),
      readApplicationReceiptTaskQueueHealth(config),
      readAccountDataExportQueueHealth(config),
      readJobAgentOperatorAlertQueueHealth(config),
    ]);
return res.status(200).json({ ...metrics, queueHealth: { contentFree: true, containsCandidateValues: false, containsAccountIdentifiers: false, submission: submissionQueue, receipt: receiptQueue, accountExport: accountExportQueue, operatorAlert: operatorAlertQueue }, monetarySpend, costControls: jobAgentCostControlSummary(), launchManifest: jobAgentLaunchManifest(), runtimeConfiguration: publicProductionEnvironmentShapeReport(productionEnvironmentShapeReport(process.env, { authoritativeProductionRuntimeEvidence: String(process.env.VERCEL_ENV || '').toLowerCase() === 'production' })) });
  } catch (error) {
    console.error(JSON.stringify({ type: 'job-agent-operations-error', name: error?.name || 'unknown' }));
    return res.status(500).json({ error: 'Operational metrics could not be restored.' });
  }
}
