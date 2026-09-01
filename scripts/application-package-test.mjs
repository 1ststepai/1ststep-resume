import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { executeClaimedApplicationPackageRun, validateGeneratedApplicationPackage } from '../lib/application-package-worker.js';
import { publicArtifactMetadata } from '../lib/application-package-artifact-metadata.js';
import { claimJobAgentRun, createJobAgentRun, readJobAgentRun, updateFinishedApplicationPackageResult, validateApplicationPackageInput } from '../lib/job-agent-run-store.js';

class FakeRedis {
  constructor() { this.values = new Map(); this.sorted = new Map(); }
  async get(key) { return this.values.get(key) ?? null; }
  async del(key) { return this.values.delete(key) ? 1 : 0; }
  async zadd(key, score, member) { this.#zset(key).set(member, Number(score)); return 1; }
  async zrem(key, member) { return this.#zset(key).delete(member) ? 1 : 0; }
  #zset(key) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); return this.sorted.get(key); }
  async eval(script, keys, args) {
    if (script.includes("local replay = redis.call('GET', KEYS[2])")) {
      const replay = this.values.get(keys[1]); if (replay) return ['replayed', replay];
      this.values.set(keys[0], args[0]); this.values.set(keys[1], args[1]); await this.zadd(keys[2], args[2], args[1]); await this.zadd(keys[3], args[2], args[1]); return ['created', args[1]];
    }
    const raw = this.values.get(keys[0]); if (!raw) return ['missing'];
    const record = JSON.parse(raw); if (record.version !== Number(args[0])) return ['conflict', String(record.version)];
    if (script.includes("record.status ~= 'Searching'")) {
      if (!['Searching', 'Preparing'].includes(record.status)) return ['not_claimable', record.status];
      record.status = 'Searching'; record.version += 1; record.attempt += 1; record.leaseTokenHash = args[1]; record.leaseUntil = args[2]; record.updatedAt = args[3]; this.values.set(keys[0], JSON.stringify(record)); await this.zadd(keys[1], args[6], args[5]); return ['claimed', JSON.stringify(record)];
    }
    if (script.includes('record.leaseTokenHash ~= ARGV[2]')) {
      if (record.leaseTokenHash !== args[1]) return ['lease_lost'];
      record.version += 1; record.status = args[2]; record.updatedAt = args[3]; record.leaseUntil = args[4]; record.leaseTokenHash = args[5]; record.resultEnvelope = JSON.parse(args[6]); record.lastErrorCode = args[7]; record.nextAttemptAt = args[8]; this.values.set(keys[0], JSON.stringify(record)); await this.zrem(keys[1], args[12]); if (args[10] === 'enqueue') await this.zadd(keys[1], args[11], args[12]); return ['updated', JSON.stringify(record)];
    }
    if (script.includes("record.taskType ~= 'application_package'")) {
      if (record.tenantId !== args[1]) return ['forbidden'];
      if (record.taskType !== 'application_package' || record.status !== 'Finished') return ['not_updateable'];
      record.version += 1; record.resultEnvelope = JSON.parse(args[2]); record.updatedAt = args[3]; this.values.set(keys[0], JSON.stringify(record)); return ['updated', JSON.stringify(record)];
    }
    throw new Error('Unexpected script');
  }
}

const sourceLine = 'Acme Corporation - Procurement Manager - Strategic sourcing and supplier negotiations for complex operations.';
const resumeText = `Candidate Name\ncandidate@example.test\n\nEXPERIENCE\n${sourceLine}\n${'Managed supplier relationships and contract workflows across business teams.\n'.repeat(8)}\nEDUCATION\nVerified university degree.`;
const jobDescription = `Acme is hiring a Procurement Manager for strategic sourcing, supplier negotiations, contract workflows, and stakeholder partnership. ${'The role requires practical procurement judgment and clear business communication. '.repeat(5)}`;
const packageInput = {
  roleId: 'role_verified_1', employer: 'Example Employer', title: 'Procurement Manager', requisitionId: 'REQ-100',
  directEmployerUrl: 'https://jobs.example.com/req/100', applyPathActive: true, jobDescription, resumeText, includeCoverLetter: true,
};

assert.equal(validateApplicationPackageInput(packageInput).roleId, 'role_verified_1');
assert.throws(() => validateApplicationPackageInput({ ...packageInput, applyPathActive: false }), /active direct-employer Apply path/i);
assert.throws(() => validateApplicationPackageInput({ ...packageInput, resumeText: `${resumeText}\npassword=hunter2` }), /not allowed/i);

const safeGeneratedResume = `Candidate Name\ncandidate@example.test\n\nPROFESSIONAL SUMMARY\nProcurement leader experienced in strategic sourcing, supplier negotiations, and contract workflows.\n\nEXPERIENCE\n${sourceLine}\n${'Managed supplier relationships and contract workflows across business teams.\n'.repeat(8)}\n\nEDUCATION\nVerified university degree.\n\nSKILLS\nStrategic sourcing, supplier negotiations, contract workflows, stakeholder partnership.`;
const safeCoverLetter = `Dear Hiring Team,\n\nI bring procurement experience grounded in strategic sourcing, supplier negotiations, and contract workflows. The Procurement Manager role aligns directly with that work.\n\nAt Acme Corporation, I managed supplier relationships and contract workflows across business teams. That experience supports the role's need for sound procurement judgment and stakeholder partnership.\n\nI would welcome a conversation about how this experience can support your procurement organization.\n\nSincerely,\nCandidate Name`;
const sourceMap = [
  { output_claim: 'strategic sourcing', source_excerpt: 'Strategic sourcing and supplier negotiations' },
  { output_claim: 'supplier negotiations', source_excerpt: 'Strategic sourcing and supplier negotiations' },
  { output_claim: 'contract workflows', source_excerpt: 'contract workflows across business teams' },
];
const qa = validateGeneratedApplicationPackage({ sourceResume: resumeText, jobDescription, resumeText: safeGeneratedResume, coverLetterText: safeCoverLetter, sourceMap });
assert.deepEqual(qa.issues, []);
assert.match(validateGeneratedApplicationPackage({ sourceResume: resumeText, jobDescription, resumeText: `${safeGeneratedResume}\nDelivered 47% savings using AI.`, coverLetterText: '', sourceMap: [] }).issues.join(','), /UNSUPPORTED_NUMERIC_CLAIM|AI_LANGUAGE_NOT_ROLE_RELEVANT|SOURCE_MAP_MISSING/);

const redis = new FakeRedis();
const config = { redis, subject: 'candidate@example.test', partitionSecret: 'p'.repeat(48), dataEncryptionKey: Buffer.alloc(32, 9).toString('base64') };
const created = await createJobAgentRun({ ...config, mission: packageInput, taskType: 'application_package', idempotencyKey: 'package_test_0001', now: new Date('2026-08-29T16:00:00.000Z') });
assert.equal(created.run.taskType, 'application_package');
assert.equal(created.run.mission.resumeText, resumeText);
assert.equal(await readJobAgentRun({ ...config, subject: 'other@example.test', runId: created.run.id }), null);
const claimed = await claimJobAgentRun({ redis, runId: created.run.id, dataEncryptionKey: config.dataEncryptionKey, now: new Date('2026-08-29T16:00:00.000Z') });
const responsePayload = JSON.stringify({ resume_text: safeGeneratedResume, cover_letter_text: safeCoverLetter, source_map: sourceMap });
const finished = await executeClaimedApplicationPackageRun({
  claimed, redis, dataEncryptionKey: config.dataEncryptionKey,
  env: { ANTHROPIC_API_KEY: 'test-key', AI_PROVIDER: 'anthropic', AI_QUALITY_MODEL: 'test-model' },
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ content: [{ text: responsePayload }] }) }),
  now: new Date('2026-08-29T16:00:01.000Z'),
});
assert.equal(finished.status, 'Finished', JSON.stringify({ status: finished.status, error: finished.lastErrorCode, result: finished.result?.qa }));
assert.equal(finished.result.qaStatus, 'ats-artifacts-verified-awaiting-isolated-render');
assert.equal(finished.result.transmission, 'none');
assert.equal(finished.result.externalApplicationExecution, false);
assert.equal(finished.result.resumeSha256.length, 64);
assert.deepEqual(finished.result.providerUsage, { inputTokens: 0, outputTokens: 0, source: 'provider-reported' });
assert.equal(finished.result.artifacts.length, 4);
assert.deepEqual(finished.result.qa.formats, ['DOCX', 'PDF']);
assert.equal(finished.result.qa.docxTextOrderChecked, true);
assert.equal(finished.result.qa.pdfTextExtracted, true);
assert.equal(finished.result.qa.pageCount, 1);
assert.equal(finished.result.qa.coverLetter.pageCount, 1);
assert.equal(finished.result.qa.visualPageInspection, false);
assert.equal(finished.result.qa.visualRenderStatus, 'pending-isolated-render-worker');
for (const artifact of finished.result.artifacts) {
  assert.ok(artifact.bytes > 500);
  assert.equal(artifact.sha256.length, 64);
  assert.ok(Buffer.from(artifact.contentBase64, 'base64').length > 500);
}
assert.ok(publicArtifactMetadata(finished.result.artifacts).every(artifact => !('contentBase64' in artifact)));
assert.ok(![...redis.values.values()].some(value => String(value).includes('candidate@example.test')));
const rendered = await updateFinishedApplicationPackageResult({
  ...config, runId: created.run.id,
  result: { ...finished.result, qaStatus: 'ats-artifacts-and-render-verified', qa: { ...finished.result.qa, visualPageInspection: true }, renderEvidence: { id: 'render-fixture', complete: true } },
  now: new Date('2026-08-29T16:00:02.000Z'),
});
assert.equal(rendered.result.qa.visualPageInspection, true);
assert.equal(await updateFinishedApplicationPackageResult({ ...config, subject: 'other@example.test', runId: created.run.id, result: rendered.result }), null);

const revisionMission = {
  ...packageInput,
  revision: {
    baseRunId: created.run.id, baseDocumentVersion: finished.result.documentVersion,
    resumeText: safeGeneratedResume, coverLetterText: safeCoverLetter, sourceMap,
  },
};
const revisionCreated = await createJobAgentRun({ ...config, mission: revisionMission, taskType: 'application_package', idempotencyKey: 'package_revision_test_0001', now: new Date('2026-08-29T16:01:00.000Z') });
const revisionClaimed = await claimJobAgentRun({ redis, runId: revisionCreated.run.id, dataEncryptionKey: config.dataEncryptionKey, now: new Date('2026-08-29T16:01:00.000Z') });
const revision = await executeClaimedApplicationPackageRun({
  claimed: revisionClaimed, redis, dataEncryptionKey: config.dataEncryptionKey,
  env: {}, fetchImpl: async () => { throw new Error('Candidate revisions must not call an AI provider.'); },
  now: new Date('2026-08-29T16:01:01.000Z'),
});
assert.equal(revision.status, 'Finished');
assert.equal(revision.result.provider, 'candidate-edit');
assert.equal(revision.result.model, 'no-ai-revision');
assert.deepEqual(revision.result.providerUsage, { inputTokens: 0, outputTokens: 0, source: 'no-provider-call' });
assert.equal(revision.result.revisionOf.runId, created.run.id);
assert.equal(revision.result.revisionOf.documentVersion, finished.result.documentVersion);
assert.equal(revision.result.qa.visualPageInspection, false);
assert.equal(revision.result.artifacts.length, 4);
assert.notEqual(revision.result.documentVersion, finished.result.documentVersion);

const revokedCreated = await createJobAgentRun({ ...config, mission: revisionMission, taskType: 'application_package', idempotencyKey: 'package_revoked_before_commit_0001', now: new Date('2026-08-29T16:02:00.000Z') });
const revokedClaimed = await claimJobAgentRun({ redis, runId: revokedCreated.run.id, dataEncryptionKey: config.dataEncryptionKey, now: new Date('2026-08-29T16:02:00.000Z') });
const revokedBeforeCommit = await executeClaimedApplicationPackageRun({
  claimed: revokedClaimed, redis, dataEncryptionKey: config.dataEncryptionKey, env: {},
  authorizationCheck: async () => { throw new Error('JOB_AGENT_CONSENT_REQUIRED'); },
  now: new Date('2026-08-29T16:02:01.000Z'),
});
assert.equal(revokedBeforeCommit.status, 'Failed');
assert.equal(revokedBeforeCommit.lastErrorCode, 'JOB_AGENT_CONSENT_REQUIRED');
assert.equal(revokedBeforeCommit.result, null);

const artifactSource = await readFile(new URL('../lib/application-package-artifacts.js', import.meta.url), 'utf8');
assert.match(artifactSource, /from '@napi-rs\/canvas'/, 'Native canvas must remain a static import so Vercel traces the PDF verification runtime.');
const vercelConfiguration = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
for (const functionPath of ['api/job-agent-readiness.js', 'api/job-agent-worker.js']) {
  assert.match(vercelConfiguration.functions?.[functionPath]?.includeFiles || '', /@napi-rs/, `${functionPath} must explicitly include the native PDF verification runtime.`);
  assert.match(vercelConfiguration.functions?.[functionPath]?.includeFiles || '', /pdfjs-dist/, `${functionPath} must explicitly include PDF.js worker assets.`);
  assert.match(vercelConfiguration.functions?.[functionPath]?.includeFiles || '', /pdfkit/, `${functionPath} must explicitly include PDFKit standard font assets loaded at runtime.`);
}

console.log('Durable application-package encryption, truth gate, DOCX/PDF artifact, ATS extraction, worker, and tenant-isolation tests passed.');
