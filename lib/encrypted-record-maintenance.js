import { decryptJsonEnvelope, encryptJsonEnvelope, envelopeNeedsReencryption } from './data-encryption-keyring.js';

const RECORD_TYPES = [
  ['campaign', /^1ststep:beta:v1:[a-f0-9]{40}:campaign$/],
  ['vault', /^1ststep:vault:v1:[a-f0-9]{40}$/],
  ['consent', /^1ststep:consent:v1:[a-f0-9]{40}$/],
  ['schedule', /^1ststep:job-agent-schedule:v1:tenant:[a-f0-9]{40}$/],
  ['notification-preference', /^1ststep:job-agent-notification:v1:tenant:[a-f0-9]{40}:preference$/],
  ['run', /^1ststep:job-agent:v1:run:[A-Za-z0-9:_-]{8,128}$/],
  ['user-session', /^1ststep:user-session:v1:[a-f0-9]{64}$/],
  ['application-session', /^1ststep:application-session:v1:session:[A-Za-z0-9:_-]{8,160}$/],
  ['application-audit', /^1ststep:application-session:v1:audit:[A-Za-z0-9:_-]{8,160}:\d+$/],
  ['application-follow-up', /^1ststep:application-follow-up:v1:tenant:[a-f0-9]{40}:session:[a-f0-9]{64}$/],
  ['employer-browser-task', /^1ststep:employer-browser-task:v1:task:[A-Za-z0-9:_-]{8,160}$/],
  ['application-submission-task', /^1ststep:application-submission-task:v1:task:[A-Za-z0-9:_-]{8,160}$/],
  ['application-receipt-task', /^1ststep:application-receipt-task:v1:task:[A-Za-z0-9:_-]{8,160}$/],
  ['employer-browser-session', /^1ststep:employer-browser-session:v1:session:[A-Za-z0-9:_-]{8,160}$/],
];

const REWRITE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local record = cjson.decode(raw)
if tonumber(record.version or -1) ~= tonumber(ARGV[1]) then return {'conflict'} end
local ttl = redis.call('TTL', KEYS[1])
if ttl > 0 then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ttl)
else
  redis.call('SET', KEYS[1], ARGV[2])
end
return {'updated'}
`;

function parseRecord(raw) { return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null; }

export function encryptedRecordType(key) {
  return RECORD_TYPES.find(([, pattern]) => pattern.test(String(key || '')))?.[0] || null;
}

function envelopeFields(type) {
  if (type === 'run') return ['missionEnvelope', 'resultEnvelope'];
  if (type === 'schedule') return ['missionEnvelope'];
  if (type === 'employer-browser-task' || type === 'application-submission-task') return ['payloadEnvelope', 'resultEnvelope'];
  if (type === 'application-receipt-task') return ['payloadEnvelope'];
  return ['envelope'];
}

export function inspectEncryptedRecord({ key, record: input, dataEncryptionKey, reencrypt = false }) {
  const type = encryptedRecordType(key);
  if (!type) return { supported: false, type: null, envelopes: 0, alreadyActive: 0, needsReencryption: 0, record: null };
  const record = parseRecord(input);
  if (!record || !Number.isSafeInteger(Number(record.version)) || Number(record.version) < 1) throw new Error('Encrypted maintenance record version is invalid.');
  const updated = structuredClone(record);
  let envelopes = 0;
  let alreadyActive = 0;
  let needsReencryption = 0;
  for (const field of envelopeFields(type)) {
    const envelope = record[field];
    if (envelope == null && ((type === 'run' || type === 'employer-browser-task' || type === 'application-submission-task') && field === 'resultEnvelope')) continue;
    if (!envelope || envelope.algorithm !== 'A256GCM') throw new Error('Encrypted maintenance envelope is invalid.');
    const plaintext = decryptJsonEnvelope(envelope, { dataEncryptionKey, aad: key });
    envelopes += 1;
    if (envelopeNeedsReencryption(envelope, dataEncryptionKey)) {
      needsReencryption += 1;
      if (reencrypt) updated[field] = encryptJsonEnvelope(plaintext, { dataEncryptionKey, aad: key });
    } else alreadyActive += 1;
  }
  return { supported: true, type, envelopes, alreadyActive, needsReencryption, record: updated, version: Number(record.version) };
}

export async function maintainEncryptedRedisRecord({ redis, key, dataEncryptionKey, apply = false }) {
  const raw = await redis.get(key);
  if (!raw) return { status: 'missing', type: encryptedRecordType(key), envelopes: 0, alreadyActive: 0, needsReencryption: 0 };
  const inspected = inspectEncryptedRecord({ key, record: raw, dataEncryptionKey, reencrypt: apply });
  if (!inspected.supported) return { status: 'unsupported', type: null, envelopes: 0, alreadyActive: 0, needsReencryption: 0 };
  if (!apply || inspected.needsReencryption === 0) return { status: inspected.needsReencryption ? 'verified-needs-reencryption' : 'verified-active', ...inspected, record: undefined };
  const response = await redis.eval(REWRITE_SCRIPT, [key], [String(inspected.version), JSON.stringify(inspected.record)]);
  const status = Array.isArray(response) ? response[0] : 'error';
  if (!['updated', 'conflict', 'missing'].includes(status)) throw new Error('Encrypted record maintenance write failed.');
  return { status, type: inspected.type, envelopes: inspected.envelopes, alreadyActive: inspected.alreadyActive, needsReencryption: inspected.needsReencryption };
}

export const ENCRYPTED_RECORD_SCAN_PATTERNS = Object.freeze([
  '1ststep:beta:v1:*:campaign',
  '1ststep:vault:v1:*',
  '1ststep:consent:v1:*',
  '1ststep:job-agent-schedule:v1:tenant:*',
  '1ststep:job-agent-notification:v1:tenant:*:preference',
  '1ststep:job-agent:v1:run:*',
  '1ststep:user-session:v1:*',
  '1ststep:application-session:v1:session:*',
  '1ststep:application-session:v1:audit:*',
  '1ststep:application-follow-up:v1:tenant:*:session:*',
  '1ststep:employer-browser-task:v1:task:*',
  '1ststep:application-submission-task:v1:task:*',
  '1ststep:application-receipt-task:v1:task:*',
  '1ststep:employer-browser-session:v1:session:*',
]);
