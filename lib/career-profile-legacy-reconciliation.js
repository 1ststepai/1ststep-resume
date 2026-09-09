import { createHash } from 'node:crypto';
import { legacyCareerProfileImportDecision } from './career-profile-fact-policy.js';

const RECONCILIATION_TARGETS = Object.freeze({
  contact: ['firstName', 'lastName', 'email', 'phone'],
  address: ['city', 'region', 'country'],
  location: ['city', 'region', 'country'],
  licenses: ['certifications'],
});

function currentVersion(fact = {}) {
  return fact.versions?.find(version => version.version === fact.currentVersion) || fact.versions?.at(-1) || null;
}

export function buildLegacyCareerProfilePlan(vault) {
  const plan = { importable: [], reconcile: [], excluded: [] };
  for (const fact of Array.isArray(vault?.facts) ? vault.facts : []) {
    if (fact?.status !== 'active' || String(fact?.fieldKey || '').startsWith('memory_')) continue;
    const version = currentVersion(fact);
    if (!version) continue;
    const decision = legacyCareerProfileImportDecision({ fieldKey: fact.fieldKey, ...version });
    const common = { legacyFactId: String(fact.id || ''), fieldKey: String(fact.fieldKey || ''), legacyFactVersion: Number(version.version) || 0 };
    if (decision.action === 'import') {
      plan.importable.push({
        ...common,
        value: decision.normalizedValue || version.value,
        provenance: String(version.provenance || 'legacy-vault'),
        confidence: Number(version.confidence),
        verificationState: String(version.verificationState || ''),
        sensitivity: decision.sensitivity,
        confirmedAt: String(version.confirmedAt || ''),
        sourceType: 'legacy-import',
        idempotencySeed: createHash('sha256').update(`legacy-vault|${common.legacyFactId}|${common.legacyFactVersion}`).digest('hex'),
      });
    } else if (decision.action === 'reconcile') {
      plan.reconcile.push({ ...common, targetFields: RECONCILIATION_TARGETS[common.fieldKey] || [], reason: decision.reason });
    } else {
      plan.excluded.push({ ...common, reason: decision.reason });
    }
  }
  return plan;
}

export function publicLegacyCareerProfilePlan(plan, legacyVersion) {
  const safe = items => items.map(({ value, provenance, confidence, verificationState, sensitivity, confirmedAt, sourceType, idempotencySeed, ...item }) => item);
  return {
    legacyVersion,
    importable: safe(plan.importable),
    reconcile: safe(plan.reconcile),
    excluded: safe(plan.excluded),
    createsReuseGrants: false,
    destructive: false,
  };
}

export function reconcileLegacyPlanAgainstCanonical(plan, canonicalFacts = []) {
  const existingKeys = new Set((Array.isArray(canonicalFacts) ? canonicalFacts : []).map(fact => String(fact?.fieldKey || '')).filter(Boolean));
  return {
    ...plan,
    importable: plan.importable.filter(fact => !existingKeys.has(fact.fieldKey)),
    alreadyPresent: plan.importable.filter(fact => existingKeys.has(fact.fieldKey)).map(fact => ({
      legacyFactId: fact.legacyFactId,
      fieldKey: fact.fieldKey,
      legacyFactVersion: fact.legacyFactVersion,
      reason: 'CAREER_PROFILE_FACT_ALREADY_PRESENT',
    })),
  };
}
