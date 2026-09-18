// Review-only contract. It never writes a resume, fact, selection, or package.
const VERIFIED = new Set(['user-confirmed', 'document-verified']);
const MATERIAL = new Set(['employer', 'jobTitle', 'employmentDates', 'degree', 'school', 'certification', 'skill', 'metric', 'contact']);
const text = value => String(value ?? '').trim();
const normalized = value => text(value).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}%]+/gu, ' ').trim().replace(/\s+/g, ' ');

function factKind(fact) {
  if (fact.originKind === 'generated' || fact.originKind === 'parsed-proposal') return fact.originKind;
  if (fact.originKind === 'reviewed-document') return 'reviewed-document';
  if (fact.originKind === 'legacy-unknown') return 'legacy-unknown';
  if (VERIFIED.has(fact.verificationState)) return 'verified';
  return 'legacy-unknown';
}

function active(fact) {
  return fact.revoked !== true && fact.superseded !== true && fact.revokedAt == null && fact.supersededAt == null
    && fact.status !== 'revoked' && fact.status !== 'superseded';
}

function comparable(fact) {
  return `${text(fact.fieldKey)}:${text(fact.entityKey)}`;
}

export function reconcileResumeSources({ resumes = [], facts = [], requiredSourcesAvailable = true } = {}) {
  const candidates = resumes.map(resume => ({
    id: text(resume.id) || (resume.hash ? `sha256:${text(resume.hash).toLowerCase()}` : ''),
    version: text(resume.version) || text(resume.hash).toLowerCase(),
    hash: text(resume.hash).toLowerCase(), source: text(resume.source),
    timestamp: text(resume.timestamp), selectedAt: text(resume.selectedAt), provenance: text(resume.provenance),
    selected: resume.selected === true, selectionMode: text(resume.selectionMode),
    current: resume.current === true, accountBacked: resume.accountBacked === true,
    reviewed: resume.reviewed === true, facts: Array.isArray(resume.facts) ? resume.facts : [],
  }));
  const selected = candidates.filter(resume => resume.selected);
  const selectedBaseResume = selected.length === 1 ? selected[0] : null;
  const documentFacts = (selectedBaseResume?.facts || []).filter(active).map(fact => ({
    ...fact, originKind: fact.originKind || (selectedBaseResume.reviewed ? 'reviewed-document' : 'legacy-unknown'),
  }));
  const currentFacts = [...facts, ...documentFacts].filter(active).map(fact => ({ ...fact, kind: factKind(fact) }));
  const confirmedFacts = currentFacts.filter(fact => fact.kind === 'verified');
  const unverifiedFacts = currentFacts.filter(fact => fact.kind !== 'verified');
  const conflicts = [];
  if (selected.length > 1) conflicts.push({ type: 'MULTIPLE_SELECTED_BASES', candidates: selected.map(({ id, version, hash }) => ({ id, version, hash })) });
  if (selectedBaseResume) for (const other of candidates) {
    if (other.current && other.id !== selectedBaseResume.id && other.hash && other.hash !== selectedBaseResume.hash) {
      conflicts.push({ type: 'BASE_DOCUMENT_DIVERGENCE', candidates: [selectedBaseResume, other].map(({ id, version, hash, source, provenance }) => ({ id, version, hash, source, provenance })) });
    }
  }

  const byKey = new Map();
  for (const fact of [...confirmedFacts, ...documentFacts.map(fact => ({ ...fact, kind: factKind(fact) }))]) {
    if (!MATERIAL.has(fact.fieldKey) || !text(fact.value)) continue;
    const key = comparable(fact);
    const group = byKey.get(key) || [];
    group.push(fact);
    byKey.set(key, group);
  }
  for (const [key, group] of byKey) {
    const verified = group.filter(fact => fact.kind === 'verified');
    if (!verified.length || new Set(group.map(fact => normalized(fact.value))).size < 2) continue;
    conflicts.push({ type: 'MATERIAL_FACT_MISMATCH', fieldKey: group[0].fieldKey, entityKey: text(group[0].entityKey),
      values: group.map(fact => ({ value: fact.value, source: fact.source, provenance: fact.provenance,
        verificationState: fact.verificationState || 'unverified', version: fact.version || null,
        timestamp: fact.timestamp || null, kind: fact.kind })) });
  }
  const packageReadiness = !selected.length ? 'NO_BASE_RESUME'
    : conflicts.length || !selectedBaseResume?.reviewed ? 'NEEDS_REVIEW'
      : !requiredSourcesAvailable || !selectedBaseResume.id || !selectedBaseResume.version || !/^[a-f0-9]{64}$/.test(selectedBaseResume.hash) ? 'INCOMPLETE' : 'READY';
  return {
    selectedBaseResume, confirmedFacts, conflicts, unverifiedFacts,
    legacyOnlyFacts: unverifiedFacts.filter(fact => fact.kind === 'legacy-unknown'),
    generatedOnlyFacts: unverifiedFacts.filter(fact => fact.kind === 'generated'),
    packageReadiness,
  };
}

// Conservative adapter for the existing free-text UI: no guessed jobs or semantic matching.
export function firstJobTitleFact(value, source, verificationState = 'unverified') {
  const raw = text(value);
  const match = raw.match(/(?:^|\n)(?:job title|title)\s*:\s*([^\n]+)/i)
    || raw.match(/(?:^|\n)EXPERIENCE\s*\n[^\n]+\n([^\n|]+)/i)
    || raw.match(/^([^\n,]+?)\s+at\s+[^\n,]+/i);
  const title = text(match?.[1]);
  return title ? { fieldKey: 'jobTitle', entityKey: 'primary-role', value: title, source, provenance: source, verificationState } : null;
}
