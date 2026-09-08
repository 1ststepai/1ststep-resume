import { createHash } from 'node:crypto';
import { readTenantCampaignStateForTenant } from './tenant-campaign-store.js';
import { readDurableApplicationSessionForTenant } from './application-session-store.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const normalized = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const PACKAGE_HISTORY_REQUIRED = 'PACKAGE_HISTORY_RECONCILIATION_REQUIRED';

export function canonicalPackageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    url.hash = '';
    // Keep identity-bearing query parameters and case-sensitive ATS paths.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|source|ref|referrer|trackingId|gh_src|lever-source|lever-origin)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.href;
  } catch { return ''; }
}

export function packageIdentityAliases(role = {}) {
  const employer = normalized(role.employer);
  // Requisition punctuation can be meaningful; preserve it.
  const requisition = String(role.requisitionId || '').normalize('NFKC').trim().toLowerCase();
  const url = canonicalPackageUrl(role.directEmployerUrl || role.applyUrl);
  return [employer && requisition ? digest(`requisition|${employer}|${requisition}`) : '', url ? digest(`url|${url}`) : ''].filter(Boolean);
}

export function packageIdentityMatch(left, right) {
  const aliases = new Set(packageIdentityAliases(left));
  if (packageIdentityAliases(right).some(key => aliases.has(key))) return 'exact';
  if (normalized(left.employer) && normalized(left.employer) === normalized(right.employer)
    && normalized(left.title) && normalized(left.title) === normalized(right.title)) return 'possible';
  return null;
}

// Read every retained entry within the pilot bound, not only the newest page.
// Missing or oversized history is unknown and cannot authorize paid work.
async function retainedRecords(redis, index, read) {
  const ids = await redis.zrange(index, 0, 250);
  if (!Array.isArray(ids) || ids.length > 250) throw new Error(PACKAGE_HISTORY_REQUIRED);
  const records = [];
  for (let offset = 0; offset < ids.length; offset += 10) {
    const batch = await Promise.all(ids.slice(offset, offset + 10).map(read));
    if (batch.some(record => !record)) throw new Error(PACKAGE_HISTORY_REQUIRED);
    records.push(...batch);
  }
  return records;
}

export async function reconcilePackageHistory({ redis, tenantId, dataEncryptionKey, mission, readRun }) {
  const config = { redis, tenantId, dataEncryptionKey };
  const [runs, sessions, campaign] = await Promise.all([
    retainedRecords(redis, `1ststep:job-agent:v1:tenant:${tenantId}:runs`, runId => readRun({ ...config, runId })),
    retainedRecords(redis, `1ststep:application-session:v1:tenant:${tenantId}:sessions`, sessionId => readDurableApplicationSessionForTenant({ ...config, sessionId })),
    readTenantCampaignStateForTenant(config),
  ]);
  const packages = runs.filter(run => run.taskType === 'application_package' && !run.mission?.revision);
  const exact = packages.filter(run => packageIdentityMatch(mission, run.mission) === 'exact');
  // Existing sessions include terminal states and receipt/outcome-unknown history.
  // They block a new draft even if its original package has expired or was deleted.
  const priorSession = sessions.find(session => packageIdentityMatch(mission, session.role));
  if (priorSession) throw new Error(PACKAGE_HISTORY_REQUIRED);
  if (exact.length > 1) throw new Error(PACKAGE_HISTORY_REQUIRED);
  if (runs.some(run => run.taskType === 'application_package' && run.mission?.revision && packageIdentityMatch(mission, run.mission))) throw new Error(PACKAGE_HISTORY_REQUIRED);
  if (!exact.length && packages.some(run => packageIdentityMatch(mission, run.mission))) throw new Error(PACKAGE_HISTORY_REQUIRED);
  for (const card of campaign.state?.subscriberView?.jobCards || []) {
    const match = packageIdentityMatch(mission, card);
    if (!match) continue;
    // The current unprepared discovery card is the input, not a second application.
    if (match === 'exact' && card.id === mission.roleId && !card.packageRunId && ['Found', 'Verified', 'New'].includes(card.status)) continue;
    if (match === 'exact' && exact[0]?.id === card.packageRunId && ['Found', 'Verified', 'New', 'Package Ready', 'Needs You'].includes(card.status)) continue;
    throw new Error(PACKAGE_HISTORY_REQUIRED);
  }
  return exact[0]?.id || '';
}

// Identity reservation and queue insertion share a single Redis transaction.
// The ledger outlives private package payloads; a stale pointer requires reconciliation.
export const CREATE_UNIQUE_PACKAGE_SCRIPT = `
local rawLedger = redis.call('GET', KEYS[5])
local ledger = rawLedger and cjson.decode(rawLedger) or {}
local aliases = cjson.decode(ARGV[6])
local idem = redis.call('GET', KEYS[2])
local existing = idem or ARGV[7]
local matched = false
for _, alias in ipairs(aliases) do
  if ledger[alias] then
    matched = true
    if existing ~= '' and existing ~= ledger[alias] then return {'history_required'} end
    existing = ledger[alias]
  end
end
if idem and not matched and ARGV[7] ~= idem then return {'history_required'} end
local count = 0
for _ in pairs(ledger) do count = count + 1 end
if count > 2000 then return {'history_required'} end
local id = existing ~= '' and existing or ARGV[2]
for _, alias in ipairs(aliases) do ledger[alias] = id end
redis.call('SET', KEYS[5], cjson.encode(ledger), 'EX', ARGV[8])
if existing ~= '' then return {'replayed', existing} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[5], 'NX')
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[2])
redis.call('ZADD', KEYS[4], ARGV[3], ARGV[2])
redis.call('EXPIRE', KEYS[4], ARGV[4])
return {'created', ARGV[2]}
`;
