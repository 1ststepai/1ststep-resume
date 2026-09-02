import { Redis } from '@upstash/redis';
import { DEFAULT_PUBLIC_ATS_SOURCES } from './public-ats-catalog.js';
import { dataEncryptionKeyringFromEnvironment } from './data-encryption-keyring.js';
import { jobAgentObjectStorageConfiguration } from './job-agent-object-storage.js';

export function jobAgentRuntimeConfiguration(env = process.env) {
  const partitionSecret = String(env.RATE_LIMIT_HASH_SECRET || env.TIER_SECRET || '');
  const auditSigningSecret = String(env.JOB_AGENT_AUDIT_SECRET || '');
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN || partitionSecret.length < 32 || auditSigningSecret.length < 32) return null;
  if (String(env.VERCEL_ENV || '').toLowerCase() === 'production' && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(String(env.BETA_DATA_ENCRYPTION_KEY_ID || ''))) return null;
  let dataEncryptionKey;
  try { dataEncryptionKey = dataEncryptionKeyringFromEnvironment(env); } catch { return null; }
  // Private object storage gates only the paths that actually write or read blobs
  // (application-package artifacts and account-data export). Consent and the
  // confirmed-fact vault are Redis-backed and must not be blocked by it. Every blob
  // helper in job-agent-object-storage.js already throws
  // PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED on its own, and the endpoints that reach
  // them refuse upfront via jobAgentArtifactStorageReady below.
  const objectStorage = jobAgentObjectStorageConfiguration(env);
  let sources = DEFAULT_PUBLIC_ATS_SOURCES;
  if (env.CONCIERGE_PUBLIC_ATS_SOURCES !== undefined) {
    try {
      const parsed = JSON.parse(env.CONCIERGE_PUBLIC_ATS_SOURCES || '[]');
      sources = Array.isArray(parsed) ? parsed : [];
    } catch { sources = []; }
  }
  return {
    redis: new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }),
    partitionSecret,
    dataEncryptionKey,
    auditSigningSecret,
    sources,
    objectStorage,
  };
}

// Explicit readiness check for the blob-backed paths. Endpoints that persist or
// read private document artifacts must call this and refuse upfront, so a run is
// never started that could only fail part-way through.
export function jobAgentArtifactStorageReady(config) {
  return config?.objectStorage?.ready === true;
}
