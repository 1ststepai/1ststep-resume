import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectApplicationPackageArtifacts } from '../lib/application-package-render-sandbox.js';
import { createEmployerBrowserHandoff } from '../lib/employer-browser-session-provider.js';
import { sendNeedsYouProviderEmail } from '../lib/job-agent-notification-store.js';
import { persistApplicationPackageArtifacts } from '../lib/job-agent-object-storage.js';
import { readJobAgentSpendSummary } from '../lib/job-agent-spend-ledger.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.hashes = new Map(); }
  async get(key) { return this.values.get(key) || null; }
  async hgetall(key) { return this.hashes.get(key) || null; }
  async zadd() { return 1; }
  async zrem() { return 1; }
  hash(key) { if (!this.hashes.has(key)) this.hashes.set(key, {}); return this.hashes.get(key); }
  async eval(script, keys, args) {
    if (script.includes('GLOBAL_MONETARY_BUDGET_EXHAUSTED')) {
      if (this.values.has(keys[2])) return JSON.stringify({ ...JSON.parse(this.values.get(keys[2])), replayed: true });
      const amount = Number(args[0]); const global = this.hash(keys[0]); const category = this.hash(keys[1]);
      if ((global.reservedCents || 0) + (global.settledCents || 0) + amount > Number(args[1])) return JSON.stringify({ ok: false, code: 'GLOBAL_MONETARY_BUDGET_EXHAUSTED' });
      if ((category.reservedCents || 0) + (category.settledCents || 0) + amount > Number(args[2])) return JSON.stringify({ ok: false, code: 'CATEGORY_MONETARY_BUDGET_EXHAUSTED' });
      global.reservedCents = (global.reservedCents || 0) + amount; category.reservedCents = (category.reservedCents || 0) + amount;
      this.values.set(keys[2], args[4]); return args[4];
    }
    const record = JSON.parse(this.values.get(keys[2]));
    if (record.status !== 'reserved') return JSON.stringify(record);
    const actual = Number(args[0]);
    for (const bucket of [this.hash(keys[0]), this.hash(keys[1])]) {
      bucket.reservedCents = (bucket.reservedCents || 0) - record.maximumCents;
      bucket.settledCents = (bucket.settledCents || 0) + actual;
      bucket.releasedCents = (bucket.releasedCents || 0) + record.maximumCents - actual;
    }
    record.status = args[1]; record.settledCents = actual; this.values.set(keys[2], JSON.stringify(record)); return JSON.stringify(record);
  }
}

const env = {
  JOB_AGENT_MONETARY_BUDGET_ENABLED: 'true', JOB_AGENT_MONETARY_BUDGET_APPROVED: 'true', JOB_AGENT_MONETARY_BUDGET_APPROVAL_VERSION: 'boundary-v1',
  JOB_AGENT_MONETARY_BUDGET_CURRENCY: 'USD', JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS: '1000',
  JOB_AGENT_AI_DAILY_BUDGET_CENTS: '200', JOB_AGENT_AI_MAX_REQUEST_CENTS: '100',
  JOB_AGENT_PACKAGE_AI_DAILY_BUDGET_CENTS: '200', JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS: '100',
  JOB_AGENT_DOCUMENT_RENDER_DAILY_BUDGET_CENTS: '50', JOB_AGENT_DOCUMENT_RENDER_MAX_REQUEST_CENTS: '50',
  JOB_AGENT_EMPLOYER_BROWSER_DAILY_BUDGET_CENTS: '100', JOB_AGENT_EMPLOYER_BROWSER_MAX_SESSION_CENTS: '100',
  JOB_AGENT_EMAIL_DAILY_BUDGET_CENTS: '10', JOB_AGENT_EMAIL_MAX_REQUEST_CENTS: '5',
  JOB_AGENT_OBJECT_STORAGE_DAILY_BUDGET_CENTS: '20', JOB_AGENT_OBJECT_STORAGE_MAX_REQUEST_CENTS: '10',
  RATE_LIMIT_HASH_SECRET: 'paid-boundary-partition-secret'.padEnd(48, 'x'),
  UPSTASH_REDIS_REST_URL: 'https://redis.example.test', UPSTASH_REDIS_REST_TOKEN: 'synthetic-token',
  DOCUMENT_RENDER_SANDBOX_ENABLED: 'true', DOCUMENT_RENDER_SANDBOX_SNAPSHOT_ID: 'snap_paid_boundary',
  EMPLOYER_BROWSER_SESSION_PROVIDER: 'remote-stream', EMPLOYER_BROWSER_REMOTE_STREAM_ENABLED: 'true',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_URL: 'https://api.browser.invalid', EMPLOYER_BROWSER_REMOTE_STREAM_ORIGIN: 'https://stream.browser.invalid/',
  EMPLOYER_BROWSER_REMOTE_STREAM_API_KEY: 'remote-provider-test-key-at-least-32-characters',
  EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVED: 'true', EMPLOYER_BROWSER_PROVIDER_COSTS_APPROVAL_VERSION: 'costs-v1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED: 'true', EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVAL_VERSION: 'csp-v1',
  EMPLOYER_BROWSER_REMOTE_STREAM_CSP_APPROVED_ORIGIN: 'https://stream.browser.invalid',
  JOB_AGENT_NEEDS_YOU_EMAIL_ENABLED: 'true', RESEND_API_KEY: 'resend'.padEnd(32, 'x'), RESEND_FROM: 'alerts@example.test',
  RESEND_WEBHOOK_SECRET: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
  JOB_AGENT_EMAIL_SUPPRESSION_TTL_DAYS: '365',
};
const now = new Date('2026-08-30T22:00:00.000Z');
const redis = new FakeRedis();

const renderBytes = Buffer.from('%PDF-1.4 synthetic private fixture');
const artifact = key => ({ key, contentBase64: renderBytes.toString('base64'), bytes: renderBytes.length, sha256: createHash('sha256').update(renderBytes).digest('hex'), pageCount: 1 });
const report = { version: 'sandbox-render-v1', complete: true, issues: [], artifacts: ['resume_docx', 'resume_pdf'].map(key => ({
  key, inputSha256: artifact(key).sha256, renderedPdfSha256: 'c'.repeat(64), extractedTextSha256: 'd'.repeat(64), pageCount: 1,
  pages: [{ width: 1224, height: 1584, blank: false, contentBounds: [90, 90, 1100, 1400], edgeInkPixels: 0 }], issues: [],
})) };
let sandboxCreates = 0;
class FakeSandbox {
  static async create() { sandboxCreates += 1; return { async writeFiles() {}, async runCommand() { return { exitCode: 0, stderr: async () => '' }; }, async readFileToBuffer() { return Buffer.from(JSON.stringify(report)); }, async stop() {} }; }
}
await inspectApplicationPackageArtifacts({ artifacts: [artifact('resume_docx'), artifact('resume_pdf')], env, redis, now, SandboxImpl: FakeSandbox });
await assert.rejects(() => inspectApplicationPackageArtifacts({ artifacts: [artifact('resume_docx'), artifact('resume_pdf')], env, redis, now, SandboxImpl: FakeSandbox }), /CATEGORY_MONETARY_BUDGET_EXHAUSTED/);
assert.equal(sandboxCreates, 1, 'Budget denial must occur before sandbox creation.');

const browserSession = { id: 'application_paid_boundary', updatedAt: now.toISOString(), role: { directEmployerUrl: 'https://careers.company.invalid/apply/REQ-2' }, proposedFields: [] };
const fields = [{ fieldRef: 'field_first_name', fieldKey: 'firstName', label: 'First name', inputType: 'text', required: true }];
const fieldSchemaHash = createHash('sha256').update(JSON.stringify(fields.map(({ fieldRef, fieldKey, inputType, required }) => ({ fieldRef, fieldKey, inputType, required })))).digest('hex');
let browserCalls = 0;
await createEmployerBrowserHandoff({ session: browserSession, env, redis, now, fetchImpl: async () => {
  browserCalls += 1;
  return new Response(JSON.stringify({
    status: 'ready', providerSessionReference: 'remote_session_reference_001', streamUrl: 'https://stream.browser.invalid/session/1',
    pageUrl: browserSession.role.directEmployerUrl, fieldSchemaHash, fields, expiresAt: new Date(now.getTime() + 20 * 60_000).toISOString(),
    policyAttestation: { networkAllowlist: ['careers.company.invalid'], submissionsBlocked: true, credentialCapture: 'provider-only', recording: false, candidateValuesReturned: false, downloadsBlocked: true },
  }), { status: 200 });
} });
assert.equal(browserCalls, 1);

let emailCalls = 0;
const emailResult = await sendNeedsYouProviderEmail({ subject: 'synthetic@example.test', tenantId: 'a'.repeat(40), actionId: 'action_boundary_0001', attempt: 1, env, redis, dataEncryptionKey: Buffer.alloc(32, 7).toString('base64'), now, fetchImpl: async () => { emailCalls += 1; return { ok: true, status: 200 }; } });
assert.equal(emailResult.status, 'provider-accepted');
assert.equal(emailCalls, 1);

let storageCalls = 0;
const storageBytes = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const storageArtifact = {
  key: 'resume_pdf', filename: 'synthetic.pdf', contentType: 'application/pdf', bytes: storageBytes.length,
  sha256: createHash('sha256').update(storageBytes).digest('hex'), pageCount: 1, contentBase64: storageBytes.toString('base64'),
};
await persistApplicationPackageArtifacts({
  artifacts: [storageArtifact], tenantId: 'b'.repeat(40), runId: 'run_boundary_001', dataEncryptionKey: Buffer.alloc(32, 9).toString('base64'), env, redis, now,
  configuration: {
    mode: 'vercel-blob-private', ready: true, token: 't'.repeat(32), scanner: { enabled: true, required: true, url: 'https://scanner.invalid/scan', bearerToken: 's'.repeat(32) },
    blobClient: { async put(pathname) { storageCalls += 1; return { pathname }; }, async del() {} },
  },
  fetchImpl: async () => ({ ok: true, json: async () => ({ clean: true, engine: 'fixture', signatureVersion: '1' }) }),
});
assert.equal(storageCalls, 1);

const summary = await readJobAgentSpendSummary({ redis, days: 1, now });
// Ledger invariant for this fixture. Each paid provider path reserves an operator-approved
// worst-case ceiling and settles at that ceiling once the provider call has started:
//   document-render 50 + employer-browser 100 + needs-you email 5 + object-storage 10 = 165.
// reservedCents must be 0 (every reservation reached a terminal state) and releasedCents 0
// (each actual equalled its maximum, so nothing was released back).
// The denied second render must contribute nothing: a reservation refused before the
// provider call is never counted as spend.
const renderDay = summary.days.find(entry => entry.date === '2026-08-30');
assert.equal(renderDay.categories['document-render'].settledCents, 50, 'The document-render charge must settle on the caller clock day, not the wall-clock day. Regression guard for the injectable now threaded through inspectApplicationPackageArtifacts.');
assert.equal(renderDay.categories['document-render'].reservedCents, 0, 'The denied second render must leave no dangling reservation.');
assert.deepEqual(summary.totals, { reservedCents: 0, settledCents: 165, releasedCents: 0 });
assert.equal(summary.containsCandidateValues, false);
assert.equal(JSON.stringify(summary).includes('synthetic@example.test'), false);

console.log('Paid provider boundaries reserve before contact, fail closed on exhaustion, settle conservatively, and expose content-free summaries.');
