#!/usr/bin/env node
/**
 * Upstash production runtime verification.
 *
 * Answers exactly one question: is the Job Agent's durable store CONFIGURED and
 * REACHABLE with the credentials production actually uses?
 *
 * It NEVER prints the Upstash URL, the Upstash token, or the partition secret.
 * Only presence, byte length, host suffix, and round-trip results are shown.
 *
 * Usage (from the repo root):
 *   npx vercel env pull .vercel/.env.verify --environment=production --yes
 *   node scripts/verify-upstash-runtime.mjs .vercel/.env.verify
 *
 * If the pulled values come back empty because the variables are marked
 * "Sensitive" in Vercel (write-only, unreadable via env pull), supply them from
 * your shell instead — they are never written to disk by this script:
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/verify-upstash-runtime.mjs
 *
 * Exit 0 = verified. Exit 1 = NOT verified. Do not configure the monetary
 * budget variables unless this exits 0.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const file = process.argv[2] || '';
const fromFile = {};
if (file) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (m) fromFile[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  } catch (error) {
    console.error(`Could not read ${file}: ${error.message}`);
    process.exit(1);
  }
}
const read = name => {
  const shell = String(process.env[name] ?? '');
  if (shell) return { value: shell, source: 'shell' };
  const disk = String(fromFile[name] ?? '');
  return { value: disk, source: disk ? 'pulled-file' : (name in fromFile ? 'pulled-file-EMPTY' : 'absent') };
};

const fail = [];
const url = read('UPSTASH_REDIS_REST_URL');
const token = read('UPSTASH_REDIS_REST_TOKEN');
const rate = read('RATE_LIMIT_HASH_SECRET');
const tier = read('TIER_SECRET');

console.log('── configuration ──────────────────────────────────────────────');

let host = '(unparseable)';
let scheme = '(none)';
if (url.value) {
  try { const u = new URL(url.value); scheme = u.protocol.replace(':', ''); host = u.hostname.split('.').slice(-2).join('.'); }
  catch { /* leave placeholders */ }
}
console.log(`UPSTASH_REDIS_REST_URL    ${url.value ? 'PRESENT' : 'MISSING'}  source=${url.source}  bytes=${url.value.length}  scheme=${scheme}  host=*.${host}`);
console.log(`UPSTASH_REDIS_REST_TOKEN  ${token.value ? 'PRESENT' : 'MISSING'}  source=${token.source}  bytes=${token.value.length}`);

const partition = rate.value || tier.value;
const partitionFrom = rate.value ? 'RATE_LIMIT_HASH_SECRET' : (tier.value ? 'TIER_SECRET (fallback)' : 'NONE');
console.log(`partition secret          ${partition.length >= 32 ? 'OK' : 'TOO SHORT'}  via=${partitionFrom}  bytes=${partition.length}  (>=32 required)`);

if (!url.value) fail.push('UPSTASH_REDIS_REST_URL is empty or absent');
if (!token.value) fail.push('UPSTASH_REDIS_REST_TOKEN is empty or absent');
if (scheme !== 'https') fail.push('UPSTASH_REDIS_REST_URL is not https');
if (partition.length < 32) fail.push('partition secret is shorter than 32 characters');

if (fail.length) {
  console.log('\n── result ─────────────────────────────────────────────────────');
  console.log('NOT VERIFIED — configuration incomplete:');
  for (const reason of fail) console.log(`  · ${reason}`);
  console.log('\nDo NOT write the monetary budget variables.');
  process.exit(1);
}

console.log('\n── reachability (read-after-write round trip) ─────────────────');
const probe = `1ststep:verify:${randomUUID()}`;
const call = async path => {
  const response = await fetch(`${url.value.replace(/\/$/, '')}/${path}`, {
    headers: { Authorization: `Bearer ${token.value}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

try {
  const t0 = Date.now();
  await call(`set/${probe}/ok?EX=60`);
  const got = await call(`get/${probe}`);
  await call(`del/${probe}`);
  const ms = Date.now() - t0;
  if (String(got?.result) !== 'ok') throw new Error('read-after-write mismatch');
  console.log(`SET → GET → DEL succeeded in ${ms} ms`);
  console.log('\n── result ─────────────────────────────────────────────────────');
  console.log('VERIFIED — Upstash is configured and reachable.');
  console.log('The monetary budget variables may be written.');
  process.exit(0);
} catch (error) {
  console.log(`round trip FAILED: ${error.message}`);
  console.log('\n── result ─────────────────────────────────────────────────────');
  console.log('NOT VERIFIED — credentials present but the store did not respond correctly.');
  console.log('Do NOT write the monetary budget variables.');
  process.exit(1);
}
