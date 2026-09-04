import { Redis } from '@upstash/redis';
import { dataEncryptionKeyringFromEnvironment } from '../lib/data-encryption-keyring.js';
import { jobAgentObjectStorageConfiguration } from '../lib/job-agent-object-storage.js';
import { runSyntheticObjectStorageLifecycleDrill } from '../lib/job-agent-object-storage-drill.js';

try {
  if (process.env.OBJECT_STORAGE_DRILL_CONFIRMATION !== 'CREATE_SCAN_READ_DELETE_SYNTHETIC_OBJECT') {
    throw new Error('OBJECT_STORAGE_DRILL_CONFIRMATION=CREATE_SCAN_READ_DELETE_SYNTHETIC_OBJECT is required.');
  }
  if (String(process.env.VERCEL_ENV || '').toLowerCase() !== 'production') {
    throw new Error('The retained launch-evidence drill must run against the exact production configuration.');
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Upstash Redis is not configured for object tracking and spend control.');
  }
  const result = await runSyntheticObjectStorageLifecycleDrill({
    configuration: jobAgentObjectStorageConfiguration(process.env),
    dataEncryptionKey: dataEncryptionKeyringFromEnvironment(process.env),
    redis: Redis.fromEnv(),
    env: process.env,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    synthetic: true,
    contentFree: true,
    containsCandidateValues: false,
    error: error?.message || 'Synthetic object-storage lifecycle drill failed.',
  }));
  process.exit(1);
}
