import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const SAFE_NONCE = /^[A-Za-z0-9_-]{16,128}$/;

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function canonicalInternalWorkerMessage({ timestamp, nonce, body }) {
  return `${String(timestamp)}.${String(nonce)}.${stable(body || {})}`;
}

export function signInternalWorkerRequest({ timestamp, nonce, body, secret }) {
  if (String(secret || '').length < 32) throw new Error('Internal worker signing secret must contain at least 32 characters.');
  return createHmac('sha256', String(secret)).update(canonicalInternalWorkerMessage({ timestamp, nonce, body })).digest('hex');
}

export function verifyInternalWorkerRequest({ headers = {}, body = {}, secret, now = new Date() }) {
  if (String(secret || '').length < 32) return { ok: false, code: 'WORKER_AUTH_NOT_CONFIGURED' };
  const timestamp = String(headers['x-1ststep-worker-timestamp'] || '');
  const nonce = String(headers['x-1ststep-worker-nonce'] || '');
  const signature = String(headers['x-1ststep-worker-signature'] || '');
  const timestampNumber = Number(timestamp);
  if (!Number.isSafeInteger(timestampNumber) || Math.abs(now.getTime() - timestampNumber) > 5 * 60_000 || !SAFE_NONCE.test(nonce) || !/^[a-f0-9]{64}$/i.test(signature)) {
    return { ok: false, code: 'WORKER_AUTH_INVALID' };
  }
  const expected = signInternalWorkerRequest({ timestamp, nonce, body, secret });
  const actualBytes = Buffer.from(signature.toLowerCase());
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return { ok: false, code: 'WORKER_AUTH_INVALID' };
  return { ok: true, nonceHash: createHash('sha256').update(nonce).digest('hex') };
}
