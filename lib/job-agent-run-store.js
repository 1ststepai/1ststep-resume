import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { PROHIBITED_CREDENTIAL_KEY, PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';
import { readBoundedTenantIndexPage } from './tenant-index-pagination.js';
import { analyzeUntrustedJobContent, validatePublicHttpsDestination } from './untrusted-job-content.js';

export const JOB_AGENT_RUN_STATES = Object.freeze([
  'Searching', 'Preparing', 'Waiting for You', 'Paused', 'Finished', 'Failed',
]);
export const JOB_AGENT_LIFECYCLE_STATES = Object.freeze([
  'Queued', 'Searching', 'Verifying', 'Preparing', 'Waiting for You', 'Paused',
  'Retrying', 'Completed', 'Partially Completed', 'Failed Safely',
]);
export const JOB_AGENT_TASK_TYPES = Object.freeze(['direct_employer_discovery', 'application_package']);

const RUN_TTL_SECONDS = 30 * 24 * 60 * 60;
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const MAX_ATTEMPTS = 4;
const MAX_METADATA_PAYLOAD_BYTES = 140_000;
const MAX_PRIVATE_PAYLOAD_BYTES = 900_000;
const SAFE_ID = /^[A-Za-z0-9:_-]{8,128}$/;
const PRIVATE_KEY = /^(?:firstName|lastName|fullName|email|phone|address|street|resume|resumeText|employmentHistory|candidateProfile|credential|password|passcode|otp|captcha|mfa|token|secret)$/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+?1[\s.-])?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/;
const SECRET = PROHIBITED_SECRET_VALUE;
const CREDENTIAL_KEY = PROHIBITED_CREDENTIAL_KEY;
const BASE = '1ststep:job-agent:v1';

const CREATE_SCRIPT = `
local replay = redis.call('GET', KEYS[2])
if replay then return {'replayed', replay} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[5], 'NX')
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[2])
redis.call('ZADD', KEYS[4], ARGV[3], ARGV[2])
redis.call('EXPIRE', KEYS[4], ARGV[4])
return {'created', ARGV[2]}
`;

const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'conflict', tostring(record.version)} end
if record.status ~= 'Searching' and record.status ~= 'Preparing' then return {'not_claimable', record.status} end
record.status = 'Searching'
record.lifecycleState = 'Searching'
record.version = record.version + 1
record.attempt = record.attempt + 1
record.leaseTokenHash = ARGV[2]
record.leaseUntil = ARGV[3]
record.updatedAt = ARGV[4]
record.lastHeartbeatAt = ARGV[4]
record.events = record.events or {}
table.insert(record.events, cjson.decode(ARGV[8]))
while #record.events > 100 do table.remove(record.events, 1) end
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZADD', KEYS[2], ARGV[7], ARGV[6])
return {'claimed', cjson.encode(record)}
`;

const LEASE_UPDATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'conflict', tostring(record.version)} end
if record.leaseTokenHash ~= ARGV[2] then return {'lease_lost'} end
record.version = record.version + 1
record.status = ARGV[3]
record.updatedAt = ARGV[4]
record.leaseUntil = ARGV[5]
record.leaseTokenHash = ARGV[6]
record.resultEnvelope = cjson.decode(ARGV[7])
record.lastErrorCode = ARGV[8]
record.nextAttemptAt = ARGV[9]
record.nextRetryAt = ARGV[9]
record.lifecycleState = ARGV[14]
if ARGV[15] ~= '' then record.lastHeartbeatAt = ARGV[15] end
record.events = record.events or {}
table.insert(record.events, cjson.decode(ARGV[16]))
while #record.events > 100 do table.remove(record.events, 1) end
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[10])
redis.call('ZREM', KEYS[2], ARGV[13])
if ARGV[11] == 'enqueue' then redis.call('ZADD', KEYS[2], ARGV[12], ARGV[13]) end
return {'updated', cjson.encode(record)}
`;

const USER_UPDATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'conflict', tostring(record.version)} end
record.version = record.version + 1
record.status = ARGV[2]
record.updatedAt = ARGV[3]
record.nextAttemptAt = ARGV[4]
record.nextRetryAt = ARGV[4]
record.lifecycleState = ARGV[10]
record.events = record.events or {}
table.insert(record.events, cjson.decode(ARGV[11]))
while #record.events > 100 do table.remove(record.events, 1) end
record.leaseUntil = ''
record.leaseTokenHash = ''
if ARGV[9] == 'reset' then record.attempt = 0 end
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
redis.call('ZREM', KEYS[2], ARGV[6])
if ARGV[7] == 'enqueue' then redis.call('ZADD', KEYS[2], ARGV[8], ARGV[6]) end
return {'updated', cjson.encode(record)}
`;

const USER_RESULT_UPDATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if record.version ~= tonumber(ARGV[1]) then return {'conflict', tostring(record.version)} end
if record.tenantId ~= ARGV[2] then return {'forbidden'} end
if record.taskType ~= 'application_package' or record.status ~= 'Finished' then return {'not_updateable'} end
record.version = record.version + 1
record.resultEnvelope = cjson.decode(ARGV[3])
record.updatedAt = ARGV[4]
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
return {'updated', cjson.encode(record)}
`;

function partitionSecret(value) {
  const secret = String(value || '');
  if (secret.length < 32) throw new Error('A 32-character tenant partition secret is required.');
  return secret;
}

export function jobAgentTenantId(subject, secret) {
  return createHmac('sha256', partitionSecret(secret)).update(String(subject || '')).digest('hex').slice(0, 40);
}

function runKey(runId) { return `${BASE}:run:${runId}`; }
function dueKey() { return `${BASE}:due`; }
function tenantIndexKey(tenantId) { return `${BASE}:tenant:${tenantId}:runs`; }
function idempotencyKey(tenantId, value) {
  return `${BASE}:tenant:${tenantId}:idem:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function parseRecord(value) {
  if (!value) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function assertMetadataOnly(value, path = 'payload') {
  if (Array.isArray(value)) return value.forEach((entry, index) => assertMetadataOnly(entry, `${path}.${index}`));
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (PRIVATE_KEY.test(key)) throw new Error(`Private field is not allowed in a Job Agent run: ${path}.${key}`);
      assertMetadataOnly(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && (EMAIL.test(value) || PHONE.test(value) || SECRET.test(value))) {
    throw new Error(`Private or secret content is not allowed in a Job Agent run: ${path}`);
  }
}

function assertNoCredentials(value, path = 'payload') {
  if (Array.isArray(value)) return value.forEach((entry, index) => assertNoCredentials(entry, `${path}.${index}`));
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (CREDENTIAL_KEY.test(key)) throw new Error(`Credentials and challenge answers are not allowed in a Job Agent package: ${path}.${key}`);
      assertNoCredentials(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && SECRET.test(value)) throw new Error(`Credentials and challenge answers are not allowed in a Job Agent package: ${path}`);
}

export function validateJobAgentMission(input = {}) {
  const mission = {
    role: String(input.role || '').trim().slice(0, 120),
    roleFamily: String(input.roleFamily || '').trim().slice(0, 80),
    roleFamilies: Array.isArray(input.roleFamilies) ? input.roleFamilies.slice(0, 8).map(value => String(value).trim().slice(0, 120)).filter(Boolean) : [],
    workModes: Array.isArray(input.workModes) ? input.workModes.slice(0, 3).map(value => String(value).trim()).filter(Boolean) : [],
    employmentTypes: Array.isArray(input.employmentTypes) ? input.employmentTypes.slice(0, 6).map(value => String(value).trim()).filter(Boolean) : [],
    salaryMin: Number(input.salaryMin) > 0 ? Math.min(1_000_000, Math.round(Number(input.salaryMin))) : null,
    location: String(input.location || '').trim().slice(0, 80),
    exclusions: Array.isArray(input.exclusions) ? input.exclusions.slice(0, 20).map(value => String(value).trim().slice(0, 120)).filter(Boolean) : [],
    target: Math.min(50, Math.max(1, Number(input.target) || 10)),
  };
  if (!mission.role && !mission.roleFamilies.length) throw new Error('A job role or role family is required.');
  assertMetadataOnly(mission, 'mission');
  return mission;
}

export function validateApplicationPackageInput(input = {}) {
  const revisionInput = input.revision && typeof input.revision === 'object' ? input.revision : null;
  const safe = {
    roleId: String(input.roleId || '').trim().slice(0, 128),
    discoveryRunId: String(input.discoveryRunId || '').trim().slice(0, 128),
    employer: String(input.employer || '').trim().slice(0, 160),
    title: String(input.title || '').trim().slice(0, 200),
    requisitionId: String(input.requisitionId || '').trim().slice(0, 160),
    directEmployerUrl: String(input.directEmployerUrl || '').trim().slice(0, 900),
    applyPathActive: input.applyPathActive === true,
    jobDescription: String(input.jobDescription || '').trim().slice(0, 50_000),
    resumeText: String(input.resumeText || '').trim().slice(0, 50_000),
    includeCoverLetter: input.includeCoverLetter !== false,
    revision: revisionInput ? {
      baseRunId: String(revisionInput.baseRunId || '').trim().slice(0, 128),
      baseDocumentVersion: String(revisionInput.baseDocumentVersion || '').trim().slice(0, 180),
      resumeText: String(revisionInput.resumeText || '').trim().slice(0, 30_000),
      coverLetterText: String(revisionInput.coverLetterText || '').trim().slice(0, 10_000),
      sourceMap: Array.isArray(revisionInput.sourceMap) ? revisionInput.sourceMap.slice(0, 80).map(item => ({
        output_claim: String(item?.output_claim || '').trim().slice(0, 500),
        source_excerpt: String(item?.source_excerpt || '').trim().slice(0, 500),
      })).filter(item => item.output_claim && item.source_excerpt) : [],
    } : null,
  };
  if (!safe.roleId || !safe.employer || !safe.title || !safe.requisitionId) throw new Error('A verified role, employer, title, and requisition ID are required.');
  try { safe.directEmployerUrl = validatePublicHttpsDestination(safe.directEmployerUrl); }
  catch { throw new Error('A verified public HTTPS direct-employer URL is required.'); }
  if (!safe.applyPathActive) throw new Error('An active direct-employer Apply path is required before package generation.');
  if (safe.jobDescription.length < 200) throw new Error('At least 200 characters of verified employer job text are required.');
  if (safe.resumeText.length < 200) throw new Error('At least 200 characters of candidate-reviewed resume text are required.');
  if (safe.revision) {
    if (!SAFE_ID.test(safe.revision.baseRunId) || !safe.revision.baseDocumentVersion) throw new Error('A valid base package version is required for a candidate edit.');
    if (safe.revision.resumeText.length < 500) throw new Error('A candidate-edited resume must contain at least 500 characters.');
    if (safe.revision.sourceMap.length < 3) throw new Error('The prior verified source map is required to recheck a candidate edit.');
  }
  assertNoCredentials(safe, 'applicationPackage');
  const analyzed = analyzeUntrustedJobContent(safe.jobDescription, { maxChars: 50_000 });
  safe.jobDescription = analyzed.normalizedText;
  safe.jobContentSha256 = analyzed.sha256;
  safe.jobContentTrust = analyzed.trust;
  safe.jobContentInstructionSignals = analyzed.instructionSignals;
  return safe;
}

function encrypt(value, { dataEncryptionKey, aad, privatePayload = false }) {
  if (privatePayload) assertNoCredentials(value);
  else assertMetadataOnly(value);
  const serialized = JSON.stringify(value);
  const maxBytes = privatePayload ? MAX_PRIVATE_PAYLOAD_BYTES : MAX_METADATA_PAYLOAD_BYTES;
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw new Error(`Job Agent run payload exceeds the ${Math.round(maxBytes / 1000)} KB limit.`);
  return encryptJsonEnvelope(value, { dataEncryptionKey, aad });
}

function decrypt(envelope, { dataEncryptionKey, aad }) {
  if (!envelope || envelope.algorithm !== 'A256GCM') return null;
  return decryptJsonEnvelope(envelope, { dataEncryptionKey, aad });
}

function publicRun(record, config) {
  if (!record) return null;
  const aad = runKey(record.id);
  return {
    id: record.id, taskType: record.taskType, status: record.status, attempt: Number(record.attempt) || 0,
    maxAttempts: Number(record.maxAttempts) || MAX_ATTEMPTS, createdAt: record.createdAt, updatedAt: record.updatedAt,
    operationId: record.operationId || record.id,
    lifecycleState: record.lifecycleState || (record.status === 'Finished' ? 'Completed' : record.status === 'Failed' ? 'Failed Safely' : record.status),
    nextAttemptAt: record.nextAttemptAt || null, nextRetryAt: record.nextRetryAt || record.nextAttemptAt || null,
    leaseUntil: record.leaseUntil || null, lastHeartbeatAt: record.lastHeartbeatAt || null,
    lastErrorCode: record.lastErrorCode || null,
    parentRunId: record.parentRunId || null, applicationPackageRunId: record.applicationPackageRunId || null,
    events: Array.isArray(record.events) ? record.events.slice(-100) : [],
    mission: decrypt(record.missionEnvelope, { dataEncryptionKey: config.dataEncryptionKey, aad }),
    result: decrypt(record.resultEnvelope, { dataEncryptionKey: config.dataEncryptionKey, aad }) || null,
  };
}

async function createJobAgentRunForResolvedTenant({ redis, tenantId, dataEncryptionKey, mission, taskType = 'direct_employer_discovery', idempotencyKey: idem, now = new Date() }) {
  if (!JOB_AGENT_TASK_TYPES.includes(taskType)) throw new Error('Unsupported Job Agent task type.');
  if (!SAFE_ID.test(String(idem || ''))) throw new Error('A safe Idempotency-Key is required.');
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || ''))) throw new Error('A valid tenant partition is required.');
  const privatePayload = taskType === 'application_package';
  const safeMission = privatePayload ? validateApplicationPackageInput(mission) : validateJobAgentMission(mission);
  const id = `run_${randomUUID()}`;
  const key = runKey(id);
  const timestamp = now.toISOString();
  const operationId = `op_${randomUUID()}`;
  const record = {
    version: 1, id, operationId, tenantId, taskType, status: 'Searching', lifecycleState: 'Queued', attempt: 0, maxAttempts: MAX_ATTEMPTS,
    createdAt: timestamp, updatedAt: timestamp, nextAttemptAt: timestamp, nextRetryAt: timestamp,
    lastHeartbeatAt: null, leaseUntil: '', leaseTokenHash: '', lastErrorCode: '', parentRunId: safeMission.discoveryRunId || null,
    applicationPackageRunId: taskType === 'application_package' ? id : null,
    events: [{ id: `${operationId}:queued`, type: 'RUN_QUEUED', state: 'Queued', at: timestamp, attempt: 0 }],
    missionEnvelope: encrypt(safeMission, { dataEncryptionKey, aad: key, privatePayload }), resultEnvelope: null,
  };
  const result = await redis.eval(CREATE_SCRIPT, [key, idempotencyKey(tenantId, idem), dueKey(), tenantIndexKey(tenantId)], [JSON.stringify(record), id, String(now.getTime()), String(RUN_TTL_SECONDS), String(IDEMPOTENCY_TTL_SECONDS)]);
  const [status, returnedId] = Array.isArray(result) ? result : ['error', ''];
  if (!['created', 'replayed'].includes(status) || !returnedId) throw new Error('Job Agent run could not be created.');
  const stored = parseRecord(await redis.get(runKey(returnedId)));
  if (!stored || stored.tenantId !== tenantId) throw new Error('Job Agent run could not be restored.');
  return { run: publicRun(stored, { dataEncryptionKey }), replayed: status === 'replayed' };
}

export async function createJobAgentRun({ subject, partitionSecret: secret, ...input }) {
  return createJobAgentRunForResolvedTenant({ ...input, tenantId: jobAgentTenantId(subject, secret) });
}

export async function createJobAgentRunForTenant(input) {
  return createJobAgentRunForResolvedTenant(input);
}

export async function readJobAgentRun({ redis, subject, partitionSecret: secret, dataEncryptionKey, runId }) {
  if (!SAFE_ID.test(String(runId || ''))) return null;
  const record = parseRecord(await redis.get(runKey(runId)));
  if (!record || record.tenantId !== jobAgentTenantId(subject, secret)) return null;
  return publicRun(record, { dataEncryptionKey });
}

export async function listJobAgentRuns({ redis, subject, partitionSecret: secret, dataEncryptionKey, limit = 100, offset = 0, withPageInfo = false }) {
  const tenantId = jobAgentTenantId(subject, secret);
  const page = await readBoundedTenantIndexPage({ redis, indexKey: tenantIndexKey(tenantId), offset, limit, defaultLimit: 100, reverse: true, includeTotal: withPageInfo });
  const runs = [];
  for (const id of page.ids) {
    const record = parseRecord(await redis.get(runKey(id)));
    if (record?.tenantId === tenantId) runs.push(publicRun(record, { dataEncryptionKey }));
  }
  return withPageInfo ? { items: runs, scanned: page.scanned, offset: page.offset, limit: page.limit, total: page.total } : runs;
}

export async function claimJobAgentRun({ redis, runId, dataEncryptionKey, now = new Date(), leaseSeconds = 45 }) {
  if (!SAFE_ID.test(String(runId || ''))) return null;
  const key = runKey(runId);
  const record = parseRecord(await redis.get(key));
  if (!record || !['Searching', 'Preparing'].includes(record.status)) return null;
  if (record.nextAttemptAt && new Date(record.nextAttemptAt).getTime() > now.getTime()) return null;
  if (record.leaseUntil && new Date(record.leaseUntil).getTime() > now.getTime()) return null;
  const leaseToken = randomBytes(32).toString('base64url');
  const leaseTokenHash = createHash('sha256').update(leaseToken).digest('hex');
  const leaseUntil = new Date(now.getTime() + Math.max(15, Math.min(120, leaseSeconds)) * 1000).toISOString();
  const claimEvent = { id: `${record.operationId || runId}:attempt:${Number(record.attempt) + 1}`, type: 'STEP_STARTED', state: 'Searching', at: now.toISOString(), attempt: Number(record.attempt) + 1 };
  const result = await redis.eval(CLAIM_SCRIPT, [key, dueKey()], [String(record.version), leaseTokenHash, leaseUntil, now.toISOString(), String(RUN_TTL_SECONDS), runId, String(new Date(leaseUntil).getTime()), JSON.stringify(claimEvent)]);
  if (!Array.isArray(result) || result[0] !== 'claimed') return null;
  const claimedRecord = parseRecord(result[1]);
  return { run: publicRun(claimedRecord, { dataEncryptionKey }), leaseToken, tenantId: claimedRecord.tenantId };
}

export async function claimNextJobAgentRun({ redis, dataEncryptionKey, now = new Date(), leaseSeconds = 45 }) {
  const ids = await redis.zrange(dueKey(), 0, now.getTime(), { byScore: true, offset: 0, count: 10 });
  for (const runId of ids || []) {
    const claimed = await claimJobAgentRun({ redis, runId, dataEncryptionKey, now, leaseSeconds });
    if (claimed) return claimed;
    await redis.zrem(dueKey(), runId);
  }
  return null;
}

function sameLease(record, leaseToken) {
  const actual = Buffer.from(createHash('sha256').update(String(leaseToken || '')).digest('hex'));
  const expected = Buffer.from(String(record?.leaseTokenHash || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function updateLease({ redis, runId, leaseToken, dataEncryptionKey, status, lifecycleState, eventType, result, errorCode = '', nextAttemptAt = '', enqueue = false, heartbeat = false, now = new Date() }) {
  const key = runKey(runId);
  const record = parseRecord(await redis.get(key));
  if (!record || !sameLease(record, leaseToken)) return null;
  const envelope = result ? encrypt(result, { dataEncryptionKey, aad: key, privatePayload: record.taskType === 'application_package' }) : null;
  const response = await redis.eval(LEASE_UPDATE_SCRIPT, [key, dueKey()], [
    String(record.version), record.leaseTokenHash, status, now.toISOString(), '', '', JSON.stringify(envelope), errorCode,
    nextAttemptAt, String(RUN_TTL_SECONDS), enqueue ? 'enqueue' : '', enqueue ? String(new Date(nextAttemptAt).getTime()) : '0', runId,
    lifecycleState || record.lifecycleState || status,
    heartbeat ? now.toISOString() : '',
    JSON.stringify({ id: `${record.operationId || runId}:${record.version + 1}`, type: eventType || 'STATE_CHANGED', state: lifecycleState || status, at: now.toISOString(), attempt: Number(record.attempt) || 0, errorCode: errorCode || null }),
  ]);
  return Array.isArray(response) && response[0] === 'updated' ? publicRun(parseRecord(response[1]), { dataEncryptionKey }) : null;
}

export async function heartbeatJobAgentRun({ redis, runId, leaseToken, dataEncryptionKey, now = new Date(), leaseSeconds = 45, lifecycleState = null }) {
  const key = runKey(runId);
  const record = parseRecord(await redis.get(key));
  if (!record || !sameLease(record, leaseToken)) return null;
  const leaseUntil = new Date(now.getTime() + Math.max(15, Math.min(120, leaseSeconds)) * 1000).toISOString();
  const response = await redis.eval(LEASE_UPDATE_SCRIPT, [key, dueKey()], [String(record.version), record.leaseTokenHash, record.status, now.toISOString(), leaseUntil, record.leaseTokenHash, JSON.stringify(record.resultEnvelope), record.lastErrorCode || '', record.nextAttemptAt || '', String(RUN_TTL_SECONDS), 'enqueue', String(new Date(leaseUntil).getTime()), runId, lifecycleState || record.lifecycleState || record.status, now.toISOString(), JSON.stringify({ id: `${record.operationId || runId}:heartbeat:${record.version + 1}`, type: 'WORKER_HEARTBEAT', state: lifecycleState || record.lifecycleState || record.status, at: now.toISOString(), attempt: Number(record.attempt) || 0 })]);
  return Array.isArray(response) && response[0] === 'updated' ? publicRun(parseRecord(response[1]), { dataEncryptionKey }) : null;
}

export function retryDelaySeconds(attempt, randomUnit = randomBytes(1)[0] / 255) {
  const base = Math.min(60 * 60, 30 * (2 ** Math.max(0, Number(attempt) - 1)));
  const jitter = Math.max(0, Math.min(1, Number(randomUnit) || 0));
  return Math.min(60 * 60, Math.round(base * (1 + jitter * 0.25)));
}

export async function finishJobAgentRun(input) {
  const partial = Number(input.result?.errorCount || 0) > 0 || input.result?.freshnessSummary?.status === 'failed';
  return updateLease({ ...input, status: 'Finished', lifecycleState: partial ? 'Partially Completed' : 'Completed', eventType: partial ? 'RUN_PARTIALLY_COMPLETED' : 'RUN_COMPLETED', result: input.result, now: input.now || new Date() });
}

export async function waitForUserJobAgentRun(input) {
  return updateLease({ ...input, status: 'Waiting for You', lifecycleState: 'Waiting for You', eventType: 'HUMAN_ACTION_CREATED', result: input.result, errorCode: input.reasonCode || 'HUMAN_ACTION_REQUIRED', now: input.now || new Date() });
}

export async function failJobAgentRun({ redis, runId, leaseToken, dataEncryptionKey, errorCode = 'TRANSIENT_FAILURE', retryable = true, now = new Date() }) {
  const record = parseRecord(await redis.get(runKey(runId)));
  if (!record || !sameLease(record, leaseToken)) return null;
  const canRetry = retryable && Number(record.attempt) < Number(record.maxAttempts);
  const next = canRetry ? new Date(now.getTime() + retryDelaySeconds(record.attempt) * 1000).toISOString() : '';
  return updateLease({ redis, runId, leaseToken, dataEncryptionKey, status: canRetry ? 'Searching' : 'Failed', lifecycleState: canRetry ? 'Retrying' : 'Failed Safely', eventType: canRetry ? 'RETRY_SCHEDULED' : 'RUN_FAILED_SAFELY', errorCode: String(errorCode).slice(0, 80), nextAttemptAt: next, enqueue: canRetry, now });
}

export async function setJobAgentRunStatus({ redis, subject, partitionSecret: secret, dataEncryptionKey, runId, status, now = new Date() }) {
  if (!['Paused', 'Searching'].includes(status)) throw new Error('Only pause and resume are available from the user API.');
  const tenantId = jobAgentTenantId(subject, secret);
  const key = runKey(runId);
  const record = parseRecord(await redis.get(key));
  if (!record || record.tenantId !== tenantId) return null;
  if (record.status === 'Finished') throw new Error('A finished run cannot be changed.');
  if (record.status === 'Failed' && status !== 'Searching') throw new Error('A failed run can only be retried.');
  const nextAttemptAt = status === 'Searching' ? now.toISOString() : '';
  const lifecycleState = status === 'Paused' ? 'Paused' : 'Queued';
  const response = await redis.eval(USER_UPDATE_SCRIPT, [key, dueKey()], [String(record.version), status, now.toISOString(), nextAttemptAt, String(RUN_TTL_SECONDS), runId, status === 'Searching' ? 'enqueue' : '', String(now.getTime()), record.status === 'Failed' && status === 'Searching' ? 'reset' : '', lifecycleState, JSON.stringify({ id: `${record.operationId || runId}:user:${record.version + 1}`, type: status === 'Paused' ? 'RUN_PAUSED' : 'RUN_RESUMED', state: lifecycleState, at: now.toISOString(), attempt: Number(record.attempt) || 0 })]);
  return Array.isArray(response) && response[0] === 'updated' ? publicRun(parseRecord(response[1]), { dataEncryptionKey }) : null;
}

export async function updateFinishedApplicationPackageResult({ redis, subject, partitionSecret: secret, dataEncryptionKey, runId, result, now = new Date() }) {
  if (!SAFE_ID.test(String(runId || ''))) return null;
  const tenantId = jobAgentTenantId(subject, secret);
  const key = runKey(runId);
  const record = parseRecord(await redis.get(key));
  if (!record || record.tenantId !== tenantId || record.taskType !== 'application_package' || record.status !== 'Finished') return null;
  const envelope = encrypt(result, { dataEncryptionKey, aad: key, privatePayload: true });
  const response = await redis.eval(USER_RESULT_UPDATE_SCRIPT, [key], [String(record.version), tenantId, JSON.stringify(envelope), now.toISOString(), String(RUN_TTL_SECONDS)]);
  return Array.isArray(response) && response[0] === 'updated' ? publicRun(parseRecord(response[1]), { dataEncryptionKey }) : null;
}

export async function deleteJobAgentRun({ redis, subject, partitionSecret: secret, runId }) {
  const tenantId = jobAgentTenantId(subject, secret);
  const record = parseRecord(await redis.get(runKey(runId)));
  if (!record || record.tenantId !== tenantId) return false;
  await Promise.all([redis.del(runKey(runId)), redis.zrem(dueKey(), runId), redis.zrem(tenantIndexKey(tenantId), runId)]);
  return true;
}

export async function deleteAllJobAgentRuns({ redis, subject, partitionSecret: secret }) {
  const tenantId = jobAgentTenantId(subject, secret);
  const indexKey = tenantIndexKey(tenantId);
  const ids = await redis.zrange(indexKey, 0, -1);
  let deleted = 0;
  for (const runId of ids || []) {
    const record = parseRecord(await redis.get(runKey(runId)));
    if (record?.tenantId !== tenantId) continue;
    await Promise.all([redis.del(runKey(runId)), redis.zrem(dueKey(), runId)]);
    deleted += 1;
  }
  await redis.del(indexKey);
  return { deleted };
}
