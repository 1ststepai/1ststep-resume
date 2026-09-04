import { randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { claimJobAgentRun, createJobAgentRun, deleteJobAgentRun, finishJobAgentRun, readJobAgentRun } from '../lib/job-agent-run-store.js';
import { dataEncryptionKeyringFromEnvironment } from '../lib/data-encryption-keyring.js';
import { jobAgentObjectStorageConfiguration } from '../lib/job-agent-object-storage.js';
import { jobAgentLaunchManifest } from '../lib/job-agent-launch-manifest.js';
import { jobAgentEmailSuppressionConfiguration } from '../lib/job-agent-email-suppression.js';
import { applicationAuditArchiveConfiguration } from '../lib/application-audit-archive-provider.js';

const missing = [];
for (const name of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
  if (!process.env[name]) missing.push(name);
}
if (String(process.env.JOB_AGENT_RECEIPT_SECRET || '').length < 32) missing.push('JOB_AGENT_RECEIPT_SECRET (32+ characters)');
if (String(process.env.JOB_AGENT_AUDIT_SECRET || '').length < 32) missing.push('JOB_AGENT_AUDIT_SECRET (32+ characters)');
if (String(process.env.JOB_AGENT_AUDIT_EXPORT_SECRET || '').length < 32) missing.push('JOB_AGENT_AUDIT_EXPORT_SECRET (32+ characters)');
if (!applicationAuditArchiveConfiguration(process.env).ready) missing.push('approved exact-host retention-locked audit archive and signed acknowledgement');
if (String(process.env.JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED || '').toLowerCase() !== 'true') missing.push('JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED=true');
if (String(process.env.RESEND_API_KEY || '').length < 20) missing.push('RESEND_API_KEY');
if (!jobAgentEmailSuppressionConfiguration(process.env).ready) missing.push('signed Resend suppression webhook and 30-730 day retention');
const notificationFrom = String(process.env.RESEND_FROM || '');
if (!notificationFrom || notificationFrom.length > 200 || /[\r\n]/.test(notificationFrom) || !notificationFrom.includes('@')) missing.push('RESEND_FROM');
if (String(process.env.JOB_AGENT_CONSENT_ENFORCEMENT || '').toLowerCase() !== 'true') missing.push('JOB_AGENT_CONSENT_ENFORCEMENT=true');
if (String(process.env.JOB_AGENT_COUNSEL_APPROVED || '').toLowerCase() !== 'true') missing.push('JOB_AGENT_COUNSEL_APPROVED=true');
for (const name of ['JOB_AGENT_TERMS_VERSION', 'JOB_AGENT_PRIVACY_VERSION', 'JOB_AGENT_AUTHORIZATION_VERSION']) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/.test(String(process.env[name] || ''))) missing.push(name);
}
if (String(process.env.JOB_AGENT_SCHEDULE_ENABLED || '').toLowerCase() !== 'true') missing.push('JOB_AGENT_SCHEDULE_ENABLED=true');
const scheduleDailyRuns = Number(process.env.JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS);
if (!Number.isSafeInteger(scheduleDailyRuns) || scheduleDailyRuns < 1 || scheduleDailyRuns > 10_000) missing.push('JOB_AGENT_SCHEDULE_GLOBAL_DAILY_RUNS (1-10000)');
const hashSecret = String(process.env.RATE_LIMIT_HASH_SECRET || process.env.TIER_SECRET || '');
if (hashSecret.length < 32) missing.push('RATE_LIMIT_HASH_SECRET (or 32+ character TIER_SECRET fallback)');
let dataEncryptionKey;
try {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(String(process.env.BETA_DATA_ENCRYPTION_KEY_ID || ''))) throw new Error('id');
  dataEncryptionKey = dataEncryptionKeyringFromEnvironment(process.env);
} catch {
  missing.push('versioned BETA_DATA_ENCRYPTION_KEY keyring');
}
const objectStorage = jobAgentObjectStorageConfiguration({ ...process.env, VERCEL_ENV: 'production' });
if (!objectStorage.ready) missing.push(`private object storage and malware scanner (${objectStorage.reason || 'not configured'})`);
const launchManifest = jobAgentLaunchManifest({ ...process.env, VERCEL_ENV: 'production' });
for (const blocker of launchManifest.capabilities.signedBeta.blockers) missing.push(`controlled beta: ${blocker}`);

for (const name of ['AI_GLOBAL_DAILY_UNITS', 'CLAUDE_GLOBAL_DAILY_UNITS', 'JOB_SEARCH_GLOBAL_DAILY_CALLS', 'DISCOVERY_GLOBAL_DAILY_CALLS', 'PACKAGE_GLOBAL_DAILY_UNITS']) {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < 1) missing.push(name);
}

if (missing.length) {
  console.error(`Production security gate failed. Missing or invalid: ${missing.join(', ')}`);
  process.exit(1);
}

const confirmationFlag = '--confirm-synthetic-production-redis-drill';
if (!process.argv.includes(confirmationFlag)) {
  console.error(`Production configuration passed, but the synthetic Redis write/read/delete drill was not authorized. Re-run with ${confirmationFlag} only during an approved maintenance check.`);
  process.exit(2);
}

const redis = Redis.fromEnv();
const key = `1ststep:security-gate:${randomBytes(12).toString('hex')}`;
try {
  await redis.set(key, 'ok', { ex: 60, nx: true });
  const value = await redis.get(key);
  await redis.del(key);
  if (value !== 'ok') throw new Error('Redis read-after-write verification failed.');
  const subject = `production-gate-${randomBytes(8).toString('hex')}@example.test`;
  const idempotencyKey = `production_gate_${randomBytes(12).toString('hex')}`;
  const run = await createJobAgentRun({
    redis, subject, partitionSecret: hashSecret, dataEncryptionKey,
    mission: { role: 'production verification fixture', workModes: ['Remote'], location: 'United States', target: 1 },
    idempotencyKey,
  });
  const claimed = await claimJobAgentRun({ redis, runId: run.run.id, dataEncryptionKey });
  if (!claimed) throw new Error('Durable Job Agent lease verification failed.');
  await finishJobAgentRun({ redis, runId: run.run.id, leaseToken: claimed.leaseToken, dataEncryptionKey, result: { jobs: [], sourceSummary: [], authority: 'production-gate-no-external-call', externalApplicationExecution: false } });
  const restored = await readJobAgentRun({ redis, subject, partitionSecret: hashSecret, dataEncryptionKey, runId: run.run.id });
  if (restored?.status !== 'Finished' || restored?.result?.externalApplicationExecution !== false) throw new Error('Durable Job Agent encrypted restore verification failed.');
  await deleteJobAgentRun({ redis, subject, partitionSecret: hashSecret, runId: run.run.id });
  console.log('Production security gate passed: Redis, encrypted tenant state, private object/scanner configuration, Job Agent lease/recovery, and budget configuration verified.');
} catch (error) {
  console.error(`Production security gate failed: ${error.message}`);
  process.exit(1);
}
