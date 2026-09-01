import { Redis } from '@upstash/redis';
import { dataEncryptionKeyringFromEnvironment } from '../lib/data-encryption-keyring.js';
import { runSyntheticEncryptedRestoreDrill } from '../lib/encrypted-record-recovery.js';

try {
  if (process.env.RECOVERY_DRILL_CONFIRMATION !== 'CREATE_AND_DELETE_SYNTHETIC_RECORD') throw new Error('RECOVERY_DRILL_CONFIRMATION=CREATE_AND_DELETE_SYNTHETIC_RECORD is required.');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new Error('Upstash Redis is not configured.');
  const result = await runSyntheticEncryptedRestoreDrill({ redis: Redis.fromEnv(), dataEncryptionKey: dataEncryptionKeyringFromEnvironment(process.env) });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ ok: false, synthetic: true, contentFree: true, containsCandidateValues: false, error: error?.message || 'Synthetic encrypted recovery drill failed.' }));
  process.exit(1);
}
