import { createHash, randomBytes } from 'node:crypto';
import {
  deleteApplicationPackageArtifacts,
  persistApplicationPackageArtifacts,
  readApplicationPackageArtifact,
} from './job-agent-object-storage.js';

const SYNTHETIC_PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');

function syntheticArtifact() {
  return {
    key: 'synthetic_pdf',
    filename: 'synthetic-object-storage-drill.pdf',
    contentType: 'application/pdf',
    bytes: SYNTHETIC_PDF.length,
    sha256: createHash('sha256').update(SYNTHETIC_PDF).digest('hex'),
    pageCount: 1,
    contentBase64: SYNTHETIC_PDF.toString('base64'),
  };
}

function deletionWasVerified(error) {
  return String(error?.message || error) === 'ARTIFACT_OBJECT_NOT_FOUND';
}

export async function runSyntheticObjectStorageLifecycleDrill({
  configuration,
  dataEncryptionKey,
  redis = null,
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
  persist = persistApplicationPackageArtifacts,
  read = readApplicationPackageArtifact,
  remove = deleteApplicationPackageArtifacts,
} = {}) {
  if (!configuration?.ready || configuration.mode !== 'vercel-blob-private' || !configuration.scanner?.enabled) {
    throw new Error('PRIVATE_OBJECT_STORAGE_AND_SCANNER_NOT_CONFIGURED');
  }

  const tenantId = randomBytes(20).toString('hex');
  const runId = `drill_${randomBytes(12).toString('hex')}`;
  const source = syntheticArtifact();
  let stored = [];
  let cleanupRequired = false;

  try {
    stored = await persist({
      artifacts: [source], tenantId, runId, dataEncryptionKey, redis, configuration, env, fetchImpl, now,
    });
    cleanupRequired = stored.length > 0;
    if (stored.length !== 1 || stored[0]?.storage !== 'encrypted-private-object'
      || stored[0]?.inspection?.malware !== 'clean' || stored[0]?.contentBase64 !== undefined) {
      throw new Error('SYNTHETIC_OBJECT_STORAGE_WRITE_NOT_VERIFIED');
    }

    const restored = await read({ artifact: stored[0], tenantId, runId, dataEncryptionKey, configuration });
    if (!Buffer.isBuffer(restored) || !restored.equals(SYNTHETIC_PDF)) {
      throw new Error('SYNTHETIC_OBJECT_STORAGE_INTEGRITY_NOT_VERIFIED');
    }

    const deletion = await remove({ artifacts: stored, redis, configuration });
    if (deletion?.deleted !== 1) throw new Error('SYNTHETIC_OBJECT_STORAGE_DELETE_NOT_VERIFIED');

    try {
      await read({ artifact: stored[0], tenantId, runId, dataEncryptionKey, configuration });
      throw new Error('SYNTHETIC_OBJECT_STORAGE_DELETE_NOT_VERIFIED');
    } catch (error) {
      if (!deletionWasVerified(error)) throw error;
    }
    cleanupRequired = false;

    return {
      ok: true,
      synthetic: true,
      contentFree: true,
      containsCandidateValues: false,
      privateEncryptedWriteVerified: true,
      malwareScanVerified: true,
      integrityReadVerified: true,
      deletionVerified: true,
      artifactsExamined: 1,
    };
  } finally {
    if (cleanupRequired && stored.length) {
      await remove({ artifacts: stored, redis, configuration }).catch(() => {});
    }
  }
}
