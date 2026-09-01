import assert from 'node:assert/strict';
import { productionEnvironmentShapeReport, publicProductionEnvironmentShapeReport } from '../lib/job-agent-production-environment-report.js';
import { buildJobAgentLaunchEvidence } from '../lib/job-agent-launch-evidence.js';

const secret = 's'.repeat(40);
const env = {
  UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
  UPSTASH_REDIS_REST_TOKEN: secret,
  RATE_LIMIT_HASH_SECRET: secret,
  JOB_AGENT_AUDIT_SECRET: secret,
  JOB_AGENT_RECEIPT_SECRET: secret,
  BETA_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  BETA_DATA_ENCRYPTION_KEY_ID: 'beta-2026-08',
  JOB_AGENT_OBJECT_STORAGE_ENABLED: 'true',
  BLOB_READ_WRITE_TOKEN: secret,
  JOB_AGENT_MALWARE_SCANNER_ENABLED: 'true',
  JOB_AGENT_MALWARE_SCANNER_URL: 'https://scanner.example.test/scan',
  JOB_AGENT_MALWARE_SCANNER_HOST: 'scanner.example.test',
  JOB_AGENT_MALWARE_SCANNER_BEARER_TOKEN: secret,
};

const report = productionEnvironmentShapeReport(env, { now: new Date('2026-08-30T18:00:00.000Z') });
assert.equal(report.contentFree, true);
assert.equal(report.containsSecretValues, false);
assert.equal(report.writesProductionState, false);
assert.equal(report.performsExternalCalls, false);
assert.equal(report.authoritativeProductionRuntimeEvidence, false);
assert.equal(report.evaluatedAs, 'production-rules-applied-to-current-process');
const deployedReport = productionEnvironmentShapeReport(env, { now: new Date('2026-08-30T18:00:00.000Z'), authoritativeProductionRuntimeEvidence: true });
assert.equal(deployedReport.authoritativeProductionRuntimeEvidence, true);
assert.equal(deployedReport.evaluatedAs, 'deployed-production-runtime');
assert.equal(report.controls.find(control => control.id === 'durable-runtime').ready, true);
assert.equal(report.controls.find(control => control.id === 'private-document-storage').ready, true);
assert.equal(report.controls.find(control => control.id === 'consent-policy').ready, false);
assert.equal(report.controls.find(control => control.id === 'document-render').stage, 'package-ready');
assert.equal(report.controls.find(control => control.id === 'assisted-greenhouse').stage, 'assisted-application');
assert.equal(report.controls.find(control => control.id === 'final-submission').stage, 'final-submission');
assert.equal(report.summary.stages.preview.eligible, true);
assert.equal(report.summary.stages.finalSubmission.eligible, false);
assert.ok(report.summary.signedBetaBlockers.includes('COUNSEL_APPROVED_CONSENT_NOT_CONFIGURED'));

const serialized = JSON.stringify(report);
assert.equal(serialized.includes(secret), false);
assert.equal(serialized.includes(env.BETA_DATA_ENCRYPTION_KEY), false);
assert.equal(serialized.includes('https://redis.example.test'), false);
assert.equal(serialized.includes('https://scanner.example.test/scan'), false);
const publicReport = publicProductionEnvironmentShapeReport(report);
assert.equal(publicReport.containsSecretValues, false);
assert.equal(publicReport.controls.some(control => Object.hasOwn(control, 'requirements')), false);
assert.equal(JSON.stringify(publicReport).includes('variableNames'), false);
assert.equal(JSON.stringify(publicReport).includes(secret), false);

const malformed = productionEnvironmentShapeReport({
  UPSTASH_REDIS_REST_URL: 'http://not-private.test',
  UPSTASH_REDIS_REST_TOKEN: 'short',
  RATE_LIMIT_HASH_SECRET: 'short',
  JOB_AGENT_AUDIT_SECRET: 'short',
  JOB_AGENT_RECEIPT_SECRET: 'short',
  BETA_DATA_ENCRYPTION_KEY: 'short',
  BETA_DATA_ENCRYPTION_KEY_ID: 'not allowed spaces',
});
const durable = malformed.controls.find(control => control.id === 'durable-runtime');
assert.equal(durable.ready, false);
assert.equal(durable.invalidCount, 7);
assert.equal(durable.requirements.every(item => item.state === 'invalid'), true);

const evidenceEnv = { JOB_AGENT_LAUNCH_EVIDENCE_SECRET: secret, VERCEL_ENV: 'production' };
evidenceEnv.JOB_AGENT_NOTIFICATION_DELIVERY_EVIDENCE = JSON.stringify(buildJobAgentLaunchEvidence({
  kind: 'notification-delivery',
  verifiedAt: '2026-08-30T18:00:00.000Z',
  evidenceId: 'evidence_notification_delivery_20260830',
  artifactSha256: 'a'.repeat(64),
}, evidenceEnv));
let evidenceReport = productionEnvironmentShapeReport(evidenceEnv, { now: new Date('2026-08-30T18:01:00.000Z') });
let delivery = evidenceReport.controls.find(control => control.id === 'signed-launch-evidence').requirements.find(item => item.id === 'notification-delivery');
assert.equal(delivery.state, 'valid');
evidenceEnv.JOB_AGENT_NOTIFICATION_DELIVERY_EVIDENCE = evidenceEnv.JOB_AGENT_NOTIFICATION_DELIVERY_EVIDENCE.replace(/.$/, 'x');
evidenceReport = productionEnvironmentShapeReport(evidenceEnv, { now: new Date('2026-08-30T18:01:00.000Z') });
delivery = evidenceReport.controls.find(control => control.id === 'signed-launch-evidence').requirements.find(item => item.id === 'notification-delivery');
assert.equal(delivery.state, 'invalid');

console.log('Content-free production environment shape report tests passed.');
