import { jobAgentRuntimeConfiguration } from './job-agent-runtime-configuration.js';
import { readJobAgentWorkerHealth } from './job-agent-operational-metrics.js';
import { readApplicationSubmissionTaskQueueHealth } from './application-submission-task-store.js';
import { readApplicationReceiptTaskQueueHealth } from './application-receipt-task-store.js';
import { readAccountDataExportQueueHealth } from './account-data-export-task.js';
import { readJobAgentOperatorAlertQueueHealth } from './job-agent-operator-alert-outbox.js';

export const HEALTH_STATES = Object.freeze(['healthy', 'degraded', 'unavailable', 'unknown']);

async function bounded(label, operation, timeoutMs = 2_500) {
  let timer;
  try {
    const value = await Promise.race([
      operation(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeoutMs); }),
    ]);
    return { status: 'healthy', value };
  } catch (error) {
    return { status: /TIMEOUT/.test(String(error?.message || '')) ? 'degraded' : 'unavailable', errorClass: String(error?.name || 'Error').slice(0, 60) };
  } finally { if (timer) clearTimeout(timer); }
}

function configured(value) { return String(value || '').trim().length > 0; }
function component(name, status, required, detail = null) { return { name, status, required, ...(detail ? { detail } : {}) }; }

export async function jobAgentDependencyHealth({ env = process.env, config = jobAgentRuntimeConfiguration(env) } = {}) {
  const redisProbe = config?.redis ? await bounded('redis', () => config.redis.ping()) : { status: 'unavailable' };
  const components = [
    component('durable-state', redisProbe.status, true),
    component('signed-authentication', configured(env.TIER_SECRET) || configured(env.RATE_LIMIT_HASH_SECRET) ? 'healthy' : 'unavailable', true),
    component('record-encryption', config?.dataEncryptionKey ? 'healthy' : 'unavailable', true),
    component('direct-employer-sources', Array.isArray(config?.sources) && config.sources.length ? 'healthy' : 'degraded', true, { configured: config?.sources?.length || 0 }),
    component('ai-provider', configured(env.ANTHROPIC_API_KEY) || configured(env.OPENAI_API_KEY) || configured(env.AI_GATEWAY_API_KEY) ? 'healthy' : 'unknown', false),
    component('private-object-storage', config?.objectStorage?.ready === true ? 'healthy' : 'unknown', false),
    component('needs-you-email', env.JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED === 'true' && configured(env.RESEND_API_KEY) ? 'healthy' : 'unknown', false),
    component('employer-browser', env.EMPLOYER_BROWSER_WORKER_ENABLED === 'true' ? 'degraded' : 'unknown', false),
    component('scheduler', configured(env.CRON_SECRET) ? 'healthy' : 'unknown', false),
    component('tenant-database', configured(env.DATABASE_URL) ? 'unknown' : 'unknown', false),
  ];
  const required = components.filter(item => item.required);
  const status = required.some(item => item.status === 'unavailable') ? 'unavailable'
    : required.some(item => item.status !== 'healthy') ? 'degraded' : 'healthy';
  return { schemaVersion: 1, status, ready: status === 'healthy', checkedAt: new Date().toISOString(), components, containsSecrets: false, containsUserData: false };
}

function safeQueue(result) {
  if (!result || typeof result !== 'object') return { status: 'unknown' };
  return {
    status: String(result.status || 'unknown'), pending: Math.max(0, Number(result.pending) || 0),
    overdue: Math.max(0, Number(result.overdue) || 0),
    ...(Number.isFinite(Number(result.oldestAgeSeconds)) ? { oldestAgeSeconds: Math.max(0, Number(result.oldestAgeSeconds)) } : {}),
  };
}

export async function jobAgentWorkerAndQueueHealth({ config, now = new Date() } = {}) {
  if (!config?.redis) return { schemaVersion: 1, status: 'unavailable', worker: { status: 'unknown' }, queues: {}, checkedAt: now.toISOString(), contentFree: true };
  const results = await Promise.allSettled([
    readJobAgentWorkerHealth({ redis: config.redis, now }),
    readApplicationSubmissionTaskQueueHealth({ redis: config.redis, now }),
    readApplicationReceiptTaskQueueHealth({ redis: config.redis, now }),
    readAccountDataExportQueueHealth({ redis: config.redis, now }),
    readJobAgentOperatorAlertQueueHealth({ redis: config.redis, now }),
  ]);
  const value = index => results[index].status === 'fulfilled' ? results[index].value : null;
  const worker = value(0) || { status: 'unknown', lastSeenAt: null, ageSeconds: null };
  const queues = { submission: safeQueue(value(1)), receipt: safeQueue(value(2)), accountExport: safeQueue(value(3)), operatorAlert: safeQueue(value(4)) };
  const queueValues = Object.values(queues);
  const status = results.some(item => item.status === 'rejected') || ['stale', 'failed', 'incomplete'].includes(worker.status) || queueValues.some(item => item.status === 'attention-required')
    ? 'degraded' : worker.status === 'unknown' ? 'unknown' : 'healthy';
  return { schemaVersion: 1, status, worker, queues, checkedAt: now.toISOString(), contentFree: true, containsUserData: false };
}
