import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { put, get, del, list } from '@vercel/blob';
import { decryptJsonEnvelope, encryptJsonEnvelope } from './data-encryption-keyring.js';
import { inspectDocumentArtifact, malwareScannerConfiguration } from './document-file-safety.js';
import { reserveConfiguredJobAgentSpend, settleConfiguredJobAgentSpend } from './job-agent-spend-ledger.js';

const RETENTION_SECONDS = 30 * 24 * 60 * 60;
const MAX_STORED_ENVELOPE_BYTES = 800_000;
const OBJECT_INDEX = '1ststep:job-agent-artifacts:v1';

function production(env) { return String(env.VERCEL_ENV || '').toLowerCase() === 'production'; }
function safeId(value, label) {
  const text = String(value || '');
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(text)) throw new Error(`${label}_INVALID`);
  return text;
}
function digest(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function aad(tenantId, runId, artifact) { return `job-agent-artifact:v1:${tenantId}:${runId}:${artifact.key}:${artifact.sha256}`; }
function hashesMatch(actual, expected) {
  const left = Buffer.from(String(actual || ''), 'hex');
  const right = Buffer.from(String(expected || ''), 'hex');
  return left.length === 32 && right.length === 32 && timingSafeEqual(left, right);
}

export function jobAgentObjectStorageConfiguration(env = process.env, blobClient = { put, get, del, list }) {
  const isProduction = production(env);
  const enabled = String(env.JOB_AGENT_OBJECT_STORAGE_ENABLED || '').toLowerCase() === 'true';
  const token = String(env.BLOB_READ_WRITE_TOKEN || '');
  const scanner = malwareScannerConfiguration(env);
  if (!enabled) return { mode: 'inline-development', production: isProduction, ready: !isProduction, reason: isProduction ? 'OBJECT_STORAGE_DISABLED' : 'DEVELOPMENT_FALLBACK', scanner };
  if (token.length < 24) return { mode: 'unavailable', production: isProduction, ready: false, reason: 'BLOB_TOKEN_MISSING', scanner };
  if (isProduction && !scanner.enabled) return { mode: 'unavailable', production: true, ready: false, reason: scanner.reason || 'SCANNER_NOT_CONFIGURED', scanner };
  return { mode: 'vercel-blob-private', production: isProduction, ready: true, token, blobClient, scanner };
}

function objectPath(tenantId, runId, artifact) {
  safeId(tenantId, 'TENANT'); safeId(runId, 'RUN'); safeId(artifact.key, 'ARTIFACT_KEY');
  if (!/^[a-f0-9]{64}$/i.test(String(artifact.sha256 || ''))) throw new Error('ARTIFACT_HASH_INVALID');
  return `job-agent-artifacts/v1/${tenantId}/${digest(runId)}/${digest(`${artifact.key}:${artifact.sha256}`)}.bin`;
}

function tenantIdFromPath(pathname) {
  const match = /^job-agent-artifacts\/v1\/([a-f0-9]{40})\/[a-f0-9]{64}\/[a-f0-9]{64}\.bin$/.exec(String(pathname || ''));
  if (!match) throw new Error('ARTIFACT_OBJECT_REFERENCE_INVALID');
  return match[1];
}

async function trackObject(redis, pathname, expiresAt) {
  if (!redis) return;
  const score = new Date(expiresAt).getTime();
  const tenantId = tenantIdFromPath(pathname);
  await Promise.all([
    redis.zadd(`${OBJECT_INDEX}:due`, score, pathname),
    redis.zadd(`${OBJECT_INDEX}:tenant:${tenantId}`, score, pathname),
  ]);
}

async function untrackObjects(redis, paths) {
  if (!redis || !paths.length) return;
  await Promise.all(paths.flatMap(pathname => [
    redis.zrem(`${OBJECT_INDEX}:due`, pathname),
    redis.zrem(`${OBJECT_INDEX}:tenant:${tenantIdFromPath(pathname)}`, pathname),
  ]));
}

export async function persistApplicationPackageArtifacts({ artifacts, tenantId, runId, dataEncryptionKey, redis = null, configuration = jobAgentObjectStorageConfiguration(), env = process.env, fetchImpl = fetch, now = new Date() }) {
  if (!Array.isArray(artifacts)) return [];
  if (configuration.mode === 'inline-development' && configuration.ready) {
    for (const artifact of artifacts) await inspectDocumentArtifact({ artifact, bytes: Buffer.from(artifact.contentBase64 || '', 'base64'), scanner: configuration.scanner, fetchImpl });
    return artifacts.map(artifact => ({ ...artifact, storage: 'encrypted-inline-development' }));
  }
  if (!configuration.ready || configuration.mode !== 'vercel-blob-private') throw new Error('PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED');
  const spend = await reserveConfiguredJobAgentSpend({ category: 'object-storage', operationId: `storage:${randomUUID()}`, env, redis, now });
  if (!spend.ok) throw new Error(spend.code || 'MONETARY_SPEND_CONTROL_NOT_CONFIGURED');
  const stored = [];
  let providerCallStarted = false;
  try {
    for (const artifact of artifacts) {
      const bytes = Buffer.from(artifact.contentBase64 || '', 'base64');
      providerCallStarted = true;
      const inspection = await inspectDocumentArtifact({ artifact, bytes, scanner: configuration.scanner, fetchImpl });
      const pathname = objectPath(tenantId, runId, artifact);
      const envelope = encryptJsonEnvelope({ schemaVersion: 1, contentBase64: bytes.toString('base64') }, { dataEncryptionKey, aad: aad(tenantId, runId, artifact) });
      const encrypted = Buffer.from(JSON.stringify(envelope));
      if (encrypted.length > MAX_STORED_ENVELOPE_BYTES) throw new Error('ENCRYPTED_ARTIFACT_TOO_LARGE');
      const result = await configuration.blobClient.put(pathname, encrypted, {
        access: 'private', addRandomSuffix: false, allowOverwrite: false,
        contentType: 'application/octet-stream', token: configuration.token,
      });
      const expiresAt = new Date(now.getTime() + RETENTION_SECONDS * 1000).toISOString();
      const storedArtifact = {
        ...artifact, contentBase64: undefined, storage: 'encrypted-private-object',
        objectRef: { provider: 'vercel-blob-private', pathname: result.pathname || pathname },
        inspection: { format: inspection.structure.format, malware: inspection.malware.status },
        expiresAt,
      };
      stored.push(storedArtifact);
      await trackObject(redis, storedArtifact.objectRef.pathname, expiresAt);
    }
    return stored;
  } catch (error) {
    await deleteApplicationPackageArtifacts({ artifacts: stored, redis, configuration }).catch(() => {});
    throw error;
  } finally {
    await settleConfiguredJobAgentSpend({ control: spend.control, providerCallStarted }).catch(error => {
      console.error(JSON.stringify({ type: 'monetary-spend-settlement-error', category: 'object-storage', name: error?.name || 'unknown' }));
    });
  }
}

async function streamToBuffer(stream) {
  const bytes = Buffer.from(await new Response(stream).arrayBuffer());
  if (!bytes.length || bytes.length > MAX_STORED_ENVELOPE_BYTES) throw new Error('STORED_ARTIFACT_SIZE_INVALID');
  return bytes;
}

export async function readApplicationPackageArtifact({ artifact, tenantId, runId, dataEncryptionKey, configuration = jobAgentObjectStorageConfiguration() }) {
  if (artifact?.contentBase64 && configuration.mode === 'inline-development' && configuration.ready) {
    const bytes = Buffer.from(artifact.contentBase64, 'base64');
    if (bytes.length !== Number(artifact.bytes) || !hashesMatch(createHash('sha256').update(bytes).digest('hex'), artifact.sha256)) throw new Error('ARTIFACT_INTEGRITY_FAILED');
    return bytes;
  }
  if (!configuration.ready || configuration.mode !== 'vercel-blob-private' || artifact?.objectRef?.provider !== 'vercel-blob-private') throw new Error('PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED');
  const expectedPath = objectPath(tenantId, runId, artifact);
  if (artifact.objectRef.pathname !== expectedPath) throw new Error('ARTIFACT_OBJECT_REFERENCE_INVALID');
  const result = await configuration.blobClient.get(expectedPath, { access: 'private', token: configuration.token, useCache: false });
  if (!result || result.statusCode !== 200) throw new Error('ARTIFACT_OBJECT_NOT_FOUND');
  const encrypted = await streamToBuffer(result.stream);
  const payload = decryptJsonEnvelope(JSON.parse(encrypted.toString('utf8')), { dataEncryptionKey, aad: aad(tenantId, runId, artifact) });
  const bytes = Buffer.from(String(payload?.contentBase64 || ''), 'base64');
  if (payload?.schemaVersion !== 1 || bytes.length !== Number(artifact.bytes) || !hashesMatch(createHash('sha256').update(bytes).digest('hex'), artifact.sha256)) throw new Error('ARTIFACT_INTEGRITY_FAILED');
  return bytes;
}

export async function hydrateApplicationPackageArtifacts(options) {
  return Promise.all((options.artifacts || []).map(async artifact => ({ ...artifact, contentBase64: (await readApplicationPackageArtifact({ ...options, artifact })).toString('base64') })));
}

export async function deleteApplicationPackageArtifacts({ artifacts, redis = null, configuration = jobAgentObjectStorageConfiguration() }) {
  const paths = [...new Set((artifacts || []).map(item => item?.objectRef?.pathname).filter(Boolean))];
  if (!paths.length) return { deleted: 0 };
  if (!configuration.ready || configuration.mode !== 'vercel-blob-private') throw new Error('PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED');
  await configuration.blobClient.del(paths, { token: configuration.token });
  await untrackObjects(redis, paths);
  return { deleted: paths.length };
}

export async function deleteAllApplicationPackageArtifactsForTenant({ tenantId, redis, configuration = jobAgentObjectStorageConfiguration(), batchSize = 100 }) {
  if (!/^[a-f0-9]{40}$/.test(String(tenantId || '')) || !redis) throw new Error('A tenant-bound object index is required.');
  const index = `${OBJECT_INDEX}:tenant:${tenantId}`;
  if (configuration.ready && configuration.mode === 'inline-development') {
    await redis.del(index);
    return { deleted: 0, tenantIndexDeleted: true };
  }
  if (!configuration.ready || configuration.mode !== 'vercel-blob-private') throw new Error('PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED');
  if (typeof configuration.blobClient?.list !== 'function') throw new Error('PRIVATE_OBJECT_STORAGE_LIST_NOT_CONFIGURED');
  const paths = new Set(await redis.zrange(index, 0, -1) || []);
  const prefix = `job-agent-artifacts/v1/${tenantId}/`;
  let cursor;
  let pages = 0;
  do {
    const result = await configuration.blobClient.list({ prefix, cursor, limit: 1000, mode: 'expanded', token: configuration.token });
    pages += 1;
    if (!result || !Array.isArray(result.blobs) || pages > 100) throw new Error('ARTIFACT_OBJECT_LIST_INVALID');
    for (const blob of result.blobs) {
      const pathname = String(blob?.pathname || '');
      if (tenantIdFromPath(pathname) !== tenantId) throw new Error('ARTIFACT_OBJECT_TENANT_LIST_INVALID');
      paths.add(pathname);
      if (paths.size > 10_000) throw new Error('ARTIFACT_OBJECT_DELETE_LIMIT_EXCEEDED');
    }
    if (result.hasMore === true && !result.cursor) throw new Error('ARTIFACT_OBJECT_LIST_CURSOR_INVALID');
    cursor = result.hasMore === true ? result.cursor : undefined;
  } while (cursor);
  const tenantPaths = [...paths];
  for (const pathname of tenantPaths) {
    if (tenantIdFromPath(pathname) !== tenantId) throw new Error('ARTIFACT_OBJECT_TENANT_INDEX_INVALID');
  }
  const boundedBatchSize = Math.max(1, Math.min(100, Number(batchSize) || 100));
  let deleted = 0;
  for (let offset = 0; offset < tenantPaths.length; offset += boundedBatchSize) {
    const batch = tenantPaths.slice(offset, offset + boundedBatchSize);
    await configuration.blobClient.del(batch, { token: configuration.token });
    await untrackObjects(redis, batch);
    deleted += batch.length;
  }
  await redis.del(index);
  return { deleted, tenantIndexDeleted: true };
}

export async function processExpiredApplicationPackageArtifacts({ redis, configuration = jobAgentObjectStorageConfiguration(), now = new Date(), limit = 25 }) {
  if (!redis || !configuration.ready || configuration.mode !== 'vercel-blob-private') return { deleted: 0, status: configuration.production ? 'not-configured' : 'development-disabled' };
  const paths = await redis.zrange(`${OBJECT_INDEX}:due`, 0, now.getTime(), { byScore: true, offset: 0, count: Math.max(1, Math.min(100, Number(limit) || 25)) });
  let deleted = 0;
  for (const pathname of paths || []) {
    tenantIdFromPath(pathname);
    await configuration.blobClient.del(pathname, { token: configuration.token });
    await untrackObjects(redis, [pathname]);
    deleted += 1;
  }
  return { deleted, status: 'completed' };
}
