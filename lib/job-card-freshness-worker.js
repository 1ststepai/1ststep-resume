import { reverifyPublicJob } from './public-ats-discovery.js';
import { readTenantCampaignStateForTenant, saveTenantCampaignStateForTenant } from './tenant-campaign-store.js';

const ACTIVE_CARD_STATUSES = new Set(['Found', 'Verified', 'Package Ready']);

function exactUrl(value) {
  try { const url = new URL(String(value || '')); url.hash = ''; return url.href; } catch { return ''; }
}

function numberOrNull(value) { const number = Number(value); return value == null || value === '' || !Number.isFinite(number) ? null : number; }

function materiallyChanged(card, job) {
  if (String(card.title || '') !== String(job.title || '') || exactUrl(card.directEmployerUrl) !== exactUrl(job.applyUrl)) return true;
  if (numberOrNull(card.salaryMin) !== numberOrNull(job.salaryMin) || numberOrNull(card.salaryMax) !== numberOrNull(job.salaryMax)) return true;
  const cardEmployment = String(card.employmentType || 'Unknown');
  const jobEmployment = String(job.employmentType || 'Unknown');
  return cardEmployment !== jobEmployment;
}

export async function refreshTenantJobCardFreshness({
  redis, tenantId, dataEncryptionKey, sources = [], runId, fetchImpl = fetch, now = new Date(), maxCards = 5,
  readCampaign = readTenantCampaignStateForTenant, saveCampaign = saveTenantCampaignStateForTenant,
} = {}) {
  const current = new Date(now);
  if (!Number.isFinite(current.getTime()) || !/^[a-f0-9]{40}$/.test(String(tenantId || '')) || !/^[A-Za-z0-9:_-]{8,160}$/.test(String(runId || ''))) throw new Error('JOB_CARD_FRESHNESS_INPUT_INVALID');
  const restored = await readCampaign({ redis, tenantId, dataEncryptionKey });
  const cards = restored.state?.subscriberView?.jobCards;
  if (!Array.isArray(cards) || !cards.length) return { status: 'idle', checked: 0, open: 0, closed: 0, changed: 0, failures: 0, saved: false, conflict: false, contentFree: true, containsCandidateValues: false };
  const selected = cards.filter(card => ACTIVE_CARD_STATUSES.has(card.status) && ['greenhouse', 'lever', 'ashby', 'smartrecruiters'].includes(String(card.sourceProvider || '').toLowerCase())).slice(0, Math.max(1, Math.min(10, Number(maxCards) || 5)));
  if (!selected.length) return { status: 'idle', checked: 0, open: 0, closed: 0, changed: 0, failures: 0, saved: false, conflict: false, contentFree: true, containsCandidateValues: false };
  const outcomes = await Promise.allSettled(selected.map(card => reverifyPublicJob({
    job: {
      provider: card.sourceProvider, employer: card.employer, title: card.title, requisitionId: card.requisitionId,
      applyUrl: card.directEmployerUrl, jobUrl: card.sourceUrl || card.directEmployerUrl,
    },
    sources, fetchImpl, now: current,
  })));
  const updates = new Map();
  let open = 0; let closed = 0; let changed = 0; let failures = 0;
  outcomes.forEach((outcome, index) => {
    const card = selected[index];
    if (outcome.status !== 'fulfilled') { failures += 1; return; }
    if (outcome.value.status === 'closed') {
      closed += 1;
      updates.set(card.id, { ...card, status: 'Rejected/Closed', applyPathActive: false, updatedAt: current.toISOString() });
      return;
    }
    if (outcome.value.status !== 'open' || !outcome.value.job) { failures += 1; return; }
    if (materiallyChanged(card, outcome.value.job)) {
      changed += 1;
      updates.set(card.id, { ...card, status: 'Rejected/Closed', applyPathActive: false, updatedAt: current.toISOString() });
      return;
    }
    open += 1;
    updates.set(card.id, { ...card, applyPathActive: true, updatedAt: current.toISOString() });
  });
  if (!updates.size) return { status: failures ? 'partial' : 'idle', checked: selected.length, open, closed, changed, failures, saved: false, conflict: false, contentFree: true, containsCandidateValues: false };
  const state = {
    ...restored.state,
    subscriberView: { ...restored.state.subscriberView, jobCards: cards.map(card => updates.get(card.id) || card) },
  };
  const saved = await saveCampaign({
    redis, tenantId, dataEncryptionKey, state, expectedVersion: restored.version,
    idempotencyKey: `freshness_${runId}_${restored.version}`, now: current,
  });
  return {
    status: saved.conflict ? 'conflict' : failures ? 'partial' : 'completed', checked: selected.length, open, closed, changed, failures,
    saved: saved.ok === true, conflict: saved.conflict === true, contentFree: true, containsCandidateValues: false,
  };
}
