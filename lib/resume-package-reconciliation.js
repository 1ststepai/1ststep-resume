import { createHash } from 'node:crypto';
import { verifiedVaultFacts, verifiedVaultFactsHash } from './applicant-vault-domain.js';

const SHA256 = /^[a-f0-9]{64}$/;
const LABELS = Object.freeze({
  jobTitle: ['job title', 'title'],
  employer: ['employer', 'company'],
  degree: ['degree'],
  school: ['school'],
  certification: ['certification'],
  metric: ['metric'],
});
const digest = value => createHash('sha256').update(String(value || '')).digest('hex');
const comparable = value => String(value || '').normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}%]+/gu, ' ').trim();

function labelledClaim(source, fieldKey) {
  const labels = LABELS[fieldKey] || [];
  for (const line of String(source || '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]{2,40})\s*:\s*(.{1,300})$/);
    if (match && labels.includes(match[1].trim().toLowerCase())) return match[2].trim();
  }
  return '';
}

function conflictsWithFacts(source, sourceName, facts) {
  return facts.flatMap(fact => {
    const claim = labelledClaim(source, fact.fieldKey);
    return claim && comparable(claim) !== comparable(fact.value)
      ? [{ type: 'MATERIAL_FACT_MISMATCH', fieldKey: fact.fieldKey,
        values: [{ value: fact.value, source: 'verified-applicant-fact', provenance: fact.provenance, version: fact.version },
          { value: claim, source: sourceName, provenance: 'document-claim', version: null }] }]
      : [];
  });
}

export function reconcilePackageResumeInput({ vault, browserText = '' } = {}) {
  const facts = vault?.consent?.status === 'granted' ? verifiedVaultFacts(vault) : [];
  const factsHash = vault?.consent?.status === 'granted' ? verifiedVaultFactsHash(vault) : digest('[]');
  const selected = vault?.selectedBaseResume;
  const legacy = String(browserText || '').trim();
  const conflicts = [];
  if (!selected) {
    return {
      status: 'needs-review',
      conflicts: [{ type: 'BASE_RESUME_SELECTION_REQUIRED', source: legacy ? 'legacy-browser' : 'none' }],
      resumeText: '', verifiedFacts: facts, verifiedFactsHash: factsHash, baseResume: null,
    };
  }
  if (vault.consent?.status !== 'granted' || selected.source !== 'applicant-vault'
    || selected.reviewState !== 'candidate-reviewed' || !SHA256.test(selected.sha256)) {
    throw new Error('The selected account-backed base resume is invalid.');
  }
  const document = vault.documents?.find(item => item.id === selected.documentId && item.type === 'master-resume' && item.status === 'active');
  const version = document?.versions?.find(item => item.version === selected.version);
  if (!version || digest(version.text) !== selected.sha256 || version.sha256 !== selected.sha256) {
    throw new Error('The selected base resume version could not be restored.');
  }
  if (selected.factsHash !== factsHash) conflicts.push({ type: 'VERIFIED_FACTS_CHANGED',
    selectedFactsHash: selected.factsHash || '', currentFactsHash: factsHash });
  if (legacy && digest(legacy) !== selected.sha256) conflicts.push({ type: 'BASE_DOCUMENT_DIVERGENCE',
    selected: { documentId: selected.documentId, version: selected.version, sha256: selected.sha256, source: 'applicant-vault' },
    other: { sha256: digest(legacy), source: 'legacy-browser' } });
  conflicts.push(...conflictsWithFacts(version.text, 'selected-base-resume', facts));
  if (legacy) conflicts.push(...conflictsWithFacts(legacy, 'legacy-browser', facts));
  return {
    status: conflicts.length ? 'needs-review' : 'ready',
    conflicts, resumeText: version.text, verifiedFacts: facts, verifiedFactsHash: factsHash,
    baseResume: { documentId: selected.documentId, version: selected.version, sha256: selected.sha256,
      source: 'applicant-vault', provenance: selected.provenance, reviewState: selected.reviewState },
  };
}

export function packageSourceReviewMatches(review, reconciled, requisitionId) {
  return review?.accepted === true
    && review.baseResumeSha256 === reconciled?.baseResume?.sha256
    && review.verifiedFactsHash === reconciled?.verifiedFactsHash
    && review.requisitionId === requisitionId;
}
