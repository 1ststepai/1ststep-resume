import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { dataEncryptionKeyringFromEnvironment } from '../lib/data-encryption-keyring.js';
import { ENCRYPTED_RECORD_SCAN_PATTERNS, encryptedRecordType, maintainEncryptedRedisRecord } from '../lib/encrypted-record-maintenance.js';

function argument(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const apply = process.argv.includes('--apply');
const startPatternIndex = Math.max(0, Math.floor(Number(argument('pattern-index', '0'))) || 0);
const startCursor = String(argument('cursor', '0'));
const maxRecords = Math.min(5000, Math.max(1, Math.floor(Number(argument('max-records', '500'))) || 500));

try {
  if (apply && process.env.REKEY_CONFIRMATION !== 'REENCRYPT_JOB_AGENT_RECORDS') throw new Error('Apply mode requires REKEY_CONFIRMATION=REENCRYPT_JOB_AGENT_RECORDS.');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new Error('Upstash Redis is not configured.');
  const dataEncryptionKey = dataEncryptionKeyringFromEnvironment(process.env);
  const redis = Redis.fromEnv();
  const totals = { keysVisited: 0, supportedRecords: 0, envelopesVerified: 0, alreadyActive: 0, needsReencryption: 0, updated: 0, conflicts: 0, missing: 0 };
  let patternIndex = startPatternIndex;
  let cursor = startCursor;
  while (patternIndex < ENCRYPTED_RECORD_SCAN_PATTERNS.length && totals.keysVisited < maxRecords) {
    const [nextCursor, keys] = await redis.scan(cursor, { match: ENCRYPTED_RECORD_SCAN_PATTERNS[patternIndex], count: Math.min(100, maxRecords - totals.keysVisited) });
    for (const key of keys || []) {
      totals.keysVisited += 1;
      if (!encryptedRecordType(key)) continue;
      let result;
      try {
        result = await maintainEncryptedRedisRecord({ redis, key, dataEncryptionKey, apply });
      } catch (error) {
        const recordReference = createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
        throw new Error(`Encrypted record ${recordReference} (${encryptedRecordType(key)}) failed verification: ${error?.message || 'unknown error'}`);
      }
      if (!result.type) continue;
      totals.supportedRecords += 1;
      totals.envelopesVerified += Number(result.envelopes) || 0;
      totals.alreadyActive += Number(result.alreadyActive) || 0;
      totals.needsReencryption += Number(result.needsReencryption) || 0;
      if (result.status === 'updated') totals.updated += 1;
      if (result.status === 'conflict') totals.conflicts += 1;
      if (result.status === 'missing') totals.missing += 1;
    }
    cursor = String(nextCursor);
    if (cursor === '0') { patternIndex += 1; cursor = '0'; }
  }
  console.log(JSON.stringify({
    ok: true, mode: apply ? 'apply' : 'dry-run', contentFree: true, containsCandidateValues: false,
    activeKeyId: dataEncryptionKey.activeKeyId, totals,
    complete: patternIndex >= ENCRYPTED_RECORD_SCAN_PATTERNS.length,
    checkpoint: patternIndex >= ENCRYPTED_RECORD_SCAN_PATTERNS.length ? null : { patternIndex, cursor },
  }));
  if (apply && totals.conflicts > 0) process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ ok: false, mode: apply ? 'apply' : 'dry-run', contentFree: true, containsCandidateValues: false, error: error?.message || 'Encrypted record maintenance failed.' }));
  process.exit(1);
}
