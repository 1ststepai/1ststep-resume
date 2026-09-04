import { Redis } from '@upstash/redis';
import { jobAgentMonetaryBudgetConfiguration, publicJobAgentMonetaryBudgetConfiguration } from './job-agent-spend-ledger.js';

export const JOB_AGENT_OPERATIONAL_EVENTS = Object.freeze([
  'authentication_failure',
  'rate_limit_exhaustion',
  'provider_request_completed',
  'provider_input_tokens',
  'provider_output_tokens',
  'provider_failure',
  'public_ats_request_completed',
  'public_ats_request_failed',
  'public_ats_zero_llm_request',
  'monetary_spend_reconciled',
  'monetary_spend_reconciliation_failure',
  'discovery_failure',
  'durable_run_failure',
  'package_failure',
  'artifact_qa_failure',
  'application_session_failure',
  'employer_browser_task_completed',
  'employer_browser_task_approval_expired',
  'employer_browser_task_outcome_unknown',
  'employer_browser_task_failure',
  'employer_browser_session_cleanup_completed',
  'employer_browser_session_cleanup_retry',
  'employer_browser_session_cleanup_failure',
  'application_submission_attempt_recorded',
  'application_submission_approval_expired',
  'application_submission_outcome_unknown',
  'application_submission_failure',
  'authoritative_receipt_verified',
  'authoritative_receipt_pending',
  'authoritative_receipt_review_required',
  'authoritative_receipt_failure',
  'consequential_queue_attention_required',
  'consequential_queue_observation_failure',
  'operator_alert_provider_accepted',
  'operator_alert_retry',
  'operator_alert_delivery_failed',
  'operator_alert_queue_attention_required',
  'operator_alert_queue_observation_failure',
  'stripe_webhook_completed',
  'stripe_webhook_duplicate',
  'stripe_webhook_retry_deferred',
  'stripe_webhook_failure',
  'audit_integrity_failure',
  'audit_head_export_completed',
  'audit_head_archive_completed',
  'audit_head_archive_failure',
  'needs_you_notification_provider_accepted',
  'needs_you_notification_queued',
  'needs_you_notification_retry',
  'needs_you_notification_failure',
  'needs_you_notification_suppressed',
  'readiness_failure',
  'account_export_completed',
  'account_export_queue_attention_required',
  'account_export_queue_observation_failure',
  'account_deletion_completed',
  'account_data_failure',
  'background_worker_invocation',
  'direct_employer_reverification_open',
  'direct_employer_reverification_closed',
  'direct_employer_reverification_changed',
  'direct_employer_reverification_failure',
  'job_card_freshness_checked',
  'job_card_freshness_closed',
  'job_card_freshness_changed',
  'job_card_freshness_failure',
  'job_card_freshness_conflict',
  'schedule_enqueued',
  'schedule_replayed',
  'schedule_paused',
  'schedule_deferred',
  'schedule_failure',
]);

const EVENT_SET = new Set(JOB_AGENT_OPERATIONAL_EVENTS);
const RETENTION_SECONDS = 8 * 24 * 60 * 60;
const BASE = '1ststep:job-agent:ops:v1';
const WORKER_EXECUTION_KEY = `${BASE}:background-worker-execution`;
const LEGACY_WORKER_HEARTBEAT_KEY = `${BASE}:background-worker-heartbeat`;
const WORKER_EXECUTION_TTL_SECONDS = 3 * 24 * 60 * 60;
const WORKER_STALE_AFTER_MS = 150 * 60 * 1000;
const WORKER_INCOMPLETE_AFTER_MS = 10 * 60 * 1000;
const RECORD_SCRIPT = `
redis.call('HINCRBY', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`;

function day(value) { return new Date(value).toISOString().slice(0, 10); }
function key(value) { return `${BASE}:${day(value)}`; }

function configuredCap(value) {
  const cap = Number(value);
  return Number.isSafeInteger(cap) && cap > 0 ? cap : null;
}

export function jobAgentCostControlSummary(env = process.env) {
  const monetary = publicJobAgentMonetaryBudgetConfiguration(jobAgentMonetaryBudgetConfiguration(env));
  return {
    schemaVersion: 1,
    unit: 'weighted-request-units-not-dollars',
    monetaryCostStatus: 'unknown-until-provider-invoice-reconciled',
    monetaryReservationControl: monetary,
    caps: {
      guidedAiGlobalDailyUnits: configuredCap(env.AI_GLOBAL_DAILY_UNITS),
      legacyClaudeGlobalDailyUnits: configuredCap(env.CLAUDE_GLOBAL_DAILY_UNITS),
      applicationPackageGlobalDailyUnits: configuredCap(env.PACKAGE_GLOBAL_DAILY_UNITS),
      documentRenderGlobalDailyUnits: configuredCap(env.DOCUMENT_RENDER_GLOBAL_DAILY_UNITS),
      employerBrowserGlobalDailyUnits: configuredCap(env.EMPLOYER_BROWSER_GLOBAL_DAILY_UNITS),
    },
  };
}

export function jobAgentOperationalMetricsConfiguration(env = process.env) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return {
    redis: new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }),
  };
}

function safeAmount(value) {
  const amount = Number(value ?? 1);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 10_000_000) throw new Error('Invalid Job Agent operational metric amount.');
  return amount;
}

export async function recordJobAgentOperationalEvent(event, { redis, now = new Date(), amount = 1 } = {}) {
  if (!EVENT_SET.has(String(event || ''))) throw new Error('Unsupported Job Agent operational event.');
  if (!redis) return { recorded: false };
  const increment = safeAmount(amount);
  if (increment === 0) return { recorded: false };
  await redis.eval(RECORD_SCRIPT, [key(now)], [event, String(increment), String(RETENTION_SECONDS)]);
  return { recorded: true };
}

export async function recordConfiguredJobAgentOperationalEvent(event, { env = process.env, now = new Date(), amount = 1 } = {}) {
  const config = jobAgentOperationalMetricsConfiguration(env);
  if (!config) return { recorded: false };
  try { return await recordJobAgentOperationalEvent(event, { ...config, now, amount }); }
  catch (error) {
    console.error(JSON.stringify({ type: 'job-agent-operational-metric-write-error', name: error?.name || 'unknown' }));
    return { recorded: false };
  }
}

function safeExecutionActivity(value = {}) {
  const keys = ['scheduled', 'durableRuns', 'browserTasks', 'submissionTasks', 'receiptTasks', 'notifications', 'followUps', 'learningMaintenance', 'cleanupTasks'];
  return Object.fromEntries(keys.map(key => [key, Math.max(0, Math.min(10_000, Number(value?.[key]) || 0))]));
}

export async function recordJobAgentWorkerExecution({ redis, now = new Date(), outcome = 'started', phase, activity = {} } = {}) {
  if (!redis) return { recorded: false };
  if (!['started', 'succeeded', 'failed'].includes(outcome)) throw new Error('Unsupported Job Agent worker execution outcome.');
  const executionPhase = phase || (outcome === 'started' ? 'started' : 'completed');
  if (!['started', 'completed'].includes(executionPhase)) throw new Error('Unsupported Job Agent worker execution phase.');
  const safeActivity = safeExecutionActivity(activity);
  const receipt = {
    schemaVersion: 2,
    executionMode: 'durable-work-cycle',
    contentFree: true,
    containsCandidateValues: false,
    lastSeenAt: now.toISOString(),
    phase: executionPhase,
    outcome,
    workPerformed: Object.values(safeActivity).some(value => value > 0),
    activity: safeActivity,
  };
  await redis.set(WORKER_EXECUTION_KEY, JSON.stringify(receipt), { ex: WORKER_EXECUTION_TTL_SECONDS });
  return { recorded: true, receipt };
}

function workerExecutionHealth(raw, now) {
  if (!raw) return { status: 'unknown', executionMode: 'durable-work-cycle', phase: null, lastSeenAt: null, outcome: null, ageSeconds: null, workPerformed: null, activity: null };
  try {
    const receipt = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const seen = new Date(receipt.lastSeenAt);
    const ageMs = now.getTime() - seen.getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0 || !['started', 'succeeded', 'failed'].includes(receipt.outcome)) throw new Error('invalid');
    const phase = receipt.phase || (receipt.outcome === 'started' ? 'started' : 'completed');
    const status = ageMs > WORKER_STALE_AFTER_MS
      ? 'stale'
      : receipt.outcome === 'failed'
        ? 'failed'
        : phase === 'started' && ageMs > WORKER_INCOMPLETE_AFTER_MS
          ? 'incomplete'
          : phase === 'started' ? 'running' : 'healthy';
    const activity = safeExecutionActivity(receipt.activity);
    return {
      status,
      executionMode: 'durable-work-cycle',
      phase,
      lastSeenAt: seen.toISOString(),
      outcome: receipt.outcome,
      ageSeconds: Math.floor(ageMs / 1000),
      workPerformed: phase === 'completed' ? Object.values(activity).some(value => value > 0) : null,
      activity: phase === 'completed' ? activity : null,
    };
  } catch {
    return { status: 'unknown', executionMode: 'durable-work-cycle', phase: null, lastSeenAt: null, outcome: null, ageSeconds: null, workPerformed: null, activity: null };
  }
}

export async function readJobAgentWorkerExecutionHealth({ redis, now = new Date() } = {}) {
  if (!redis) return workerExecutionHealth(null, now);
  const current = await redis.get(WORKER_EXECUTION_KEY);
  return workerExecutionHealth(current || await redis.get(LEGACY_WORKER_HEARTBEAT_KEY), now);
}

// Compatibility aliases for older callers. These now persist and read execution
// receipts; they do not represent the scheduler or substitute for completed work.
export const recordJobAgentWorkerHeartbeat = recordJobAgentWorkerExecution;
export const readJobAgentWorkerHealth = readJobAgentWorkerExecutionHealth;

export async function readJobAgentOperationalMetrics({ redis, days = 2, now = new Date() } = {}) {
  const count = Math.max(1, Math.min(7, Number(days) || 2));
  const buckets = [];
  const totals = Object.fromEntries(JOB_AGENT_OPERATIONAL_EVENTS.map(event => [event, 0]));
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const raw = await redis.hgetall(key(date)) || {};
    const events = Object.fromEntries(JOB_AGENT_OPERATIONAL_EVENTS.map(event => [event, Math.max(0, Number(raw[event]) || 0)]));
    for (const event of JOB_AGENT_OPERATIONAL_EVENTS) totals[event] += events[event];
    buckets.push({ date: day(date), events });
  }
  const backgroundWorker = await readJobAgentWorkerExecutionHealth({ redis, now });
  return {
    schemaVersion: 1, contentFree: true, containsCandidateValues: false, generatedAt: now.toISOString(), backgroundWorker, days: buckets, totals,
    providerUsageEvidence: {
      requests: totals.provider_request_completed,
      inputTokens: totals.provider_input_tokens,
      outputTokens: totals.provider_output_tokens,
      source: 'provider-reported-aggregate',
      monetaryCostStatus: 'unknown-until-provider-invoice-reconciled',
    },
    publicDiscoveryEvidence: {
      requests: totals.public_ats_request_completed + totals.public_ats_request_failed,
      completed: totals.public_ats_request_completed,
      failed: totals.public_ats_request_failed,
      zeroLlmRequests: totals.public_ats_zero_llm_request,
      llmTokenStatus: 'zero-by-provider-contract',
      monetaryCostStatus: 'network-and-runtime-cost-not-yet-invoice-reconciled',
    },
  };
}
