const text = (value, max = 500) => String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const normalized = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function money(value, currency = 'USD') {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: text(currency, 3) || 'USD', maximumFractionDigits: 0 }).format(amount); }
  catch { return `$${Math.round(amount).toLocaleString('en-US')}`; }
}

function fieldWords(fields = []) {
  return fields.map(field => normalized(`${field?.label || ''} ${field?.name || ''} ${field?.question || ''}`)).filter(Boolean);
}

export function hasAuthoritativeEmployerReceipt(session = {}) {
  const receipt = session?.receipt;
  if (!receipt || receipt.simulated === true) return false;
  const source = text(receipt.source || receipt.evidenceSource).toUpperCase();
  const allowedSource = ['EMPLOYER_CONFIRMATION_PAGE', 'EMPLOYER_CONFIRMATION_EMAIL', 'EMPLOYER_ATS_API'].includes(source);
  return allowedSource && Boolean(text(receipt.confirmationId || receipt.reference || receipt.receivedAt));
}

export function detectApplicationConflicts({ roleEvidence = {}, formFields = [], actions = [] } = {}) {
  const warnings = [];
  const words = fieldWords(formFields);
  const add = (code, message) => {
    if (!warnings.some(item => item.code === code)) warnings.push({ code, message });
  };
  const listingRemote = roleEvidence.remote === true || /remote/.test(normalized(roleEvidence.workplaceType));
  const onsiteForm = words.some(value => /\b(on site|onsite|in office|hybrid|relocat)/.test(value) && /\b(required|requirement|able|willing|days|attendance|work)\b/.test(value));
  if (listingRemote && onsiteForm) add('REMOTE_ONSITE_CONFLICT', 'The listing says remote, but the application asks about onsite, hybrid, or relocation requirements.');

  const salaryBasis = normalized(roleEvidence.compensationBasis);
  if (['ote', 'total compensation'].includes(salaryBasis)) add('COMPENSATION_NOT_BASE', `The advertised pay is described as ${salaryBasis === 'ote' ? 'OTE' : 'total compensation'}, not verified base salary.`);

  const travelForm = words.some(value => /\btravel\b/.test(value) && /\b(required|requirement|percent|percentage|willing|able|up to)\b/.test(value));
  if (travelForm && !text(roleEvidence.travelDisclosure)) add('UNEXPECTED_TRAVEL', 'The application asks about travel that was not disclosed in the verified listing facts.');

  if (roleEvidence.peopleLeadershipRequired === true) add('LEADERSHIP_REQUIREMENT', 'The listing appears to require people leadership. Verify that this matches your experience before continuing.');
  if (roleEvidence.categoryManagementRequired === true) add('CATEGORY_MANAGEMENT_EXCLUSION', 'The listing appears to require category management, which is outside your saved search preferences.');

  for (const action of actions) {
    const detail = normalized(`${action?.type || ''} ${action?.summary || ''}`);
    if (/salary discrepancy|compensation discrepancy/.test(detail)) add('FORM_COMPENSATION_CONFLICT', 'The employer form and listing contain different compensation information.');
    if (/travel discrepancy/.test(detail)) add('FORM_TRAVEL_CONFLICT', 'The employer form introduces a travel requirement that needs review.');
    if (/qualification discrepancy/.test(detail)) add('FORM_QUALIFICATION_CONFLICT', 'The employer form introduces a qualification that needs review.');
  }
  return warnings;
}

export function canonicalApplicationStatus(session = {}, role = {}) {
  if (hasAuthoritativeEmployerReceipt(session)) return 'Receipt Verified';
  if (session?.submissionAttempt || session?.submissionExecution?.status === 'outcome-unknown') return 'Awaiting Employer Receipt';
  if (session?.approvals?.transmission || ['employer_form', 'final_review', 'submission_approval', 'submission_execution', 'receipt_verification'].includes(session?.stage)) return 'Approved';
  if (session?.id) return 'Package Ready';
  const status = normalized(role?.status);
  if (status.includes('package ready')) return 'Package Ready';
  if (status.includes('verified') || status.includes('screen')) return 'Screened';
  return 'Discovered';
}

export function applicationControlCenterModel(session = {}, { formFields = [] } = {}) {
  const evidence = session?.role?.evidence || {};
  const conflicts = detectApplicationConflicts({ roleEvidence: evidence, formFields, actions: session?.actions || [] });
  const salaryMin = money(evidence.salaryMin, evidence.salaryCurrency);
  const salaryMax = money(evidence.salaryMax, evidence.salaryCurrency);
  const salary = salaryMin && salaryMax ? `${salaryMin}–${salaryMax}` : salaryMin || salaryMax || 'Not disclosed';
  const location = text(evidence.location) || (evidence.remote === true ? 'Remote' : 'Not verified');
  const travel = text(evidence.travelDisclosure) || 'No listing disclosure found';
  const proposedFields = (session?.proposedFields || []).map(item => ({
    label: text(item.label, 160), preview: text(item.maskedPreview, 160), source: text(item.provenance, 200), confidence: Number(item.confidence || 0),
  })).filter(item => item.label && item.preview);
  const documents = [{ label: 'Resume/package', version: text(session?.documentVersion, 180) || 'Not selected' }];
  const mappedClaims = Math.max(0, Number(session?.evidenceMapSummary?.mappedClaims || 0));
  if (!mappedClaims) conflicts.push({ code: 'SOURCE_MAP_UNAVAILABLE', message: 'Resume evidence links are unavailable for this saved session. Review the package before sharing it.' });
  const status = canonicalApplicationStatus(session);
  return {
    employer: text(session?.role?.employer, 160) || 'Employer not verified',
    title: text(session?.role?.title, 200) || 'Role not verified',
    requisitionId: text(session?.role?.requisitionId, 160),
    status,
    facts: [
      { label: 'Location', value: `${location}${evidence.remote === true && !/remote/i.test(location) ? ' · Remote' : ''}` },
      { label: evidence.compensationBasis === 'base' ? 'Base salary' : 'Compensation', value: salary },
      { label: 'Travel', value: travel },
    ],
    conflicts,
    proposedFields,
    documents,
    mappedClaims,
    personalDataSummary: proposedFields.length ? `${proposedFields.length} masked, verified answer${proposedFields.length === 1 ? '' : 's'}` : 'No reusable answers selected',
    receiptVerified: hasAuthoritativeEmployerReceipt(session),
  };
}

function recordKey(role = {}) {
  const employer = normalized(role.employer);
  const req = normalized(role.requisitionId);
  if (employer && req) return `${employer}|${req}`;
  return normalized(role.directEmployerUrl) || `${employer}|${normalized(role.title)}`;
}

function recordRank(record) {
  const order = { 'Discovered': 1, 'Screened': 2, 'Package Ready': 3, 'Approved': 4, 'Awaiting Employer Receipt': 5, 'Receipt Verified': 6 };
  return (order[record.status] || 0) * 10 ** 15 + (Number.isFinite(new Date(record.updatedAt).getTime()) ? new Date(record.updatedAt).getTime() : 0);
}

export function canonicalApplicationRecords({ sessions = [], roles = [] } = {}) {
  const records = [];
  for (const role of roles) records.push({ role, session: null, status: canonicalApplicationStatus({}, role), updatedAt: role.updatedAt || role.verifiedAt || role.discoveredAt || '' });
  for (const session of sessions) records.push({ role: session.role || {}, session, status: canonicalApplicationStatus(session), updatedAt: session.updatedAt || session.createdAt || '' });
  const byKey = new Map();
  for (const record of records) {
    const key = recordKey(record.role);
    if (!key) continue;
    const previous = byKey.get(key);
    if (!previous || recordRank(record) >= recordRank(previous)) byKey.set(key, record);
  }
  return [...byKey.values()].sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
}

function cell(value) { return text(value, 900).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }

export function applicationLedgerMarkdown(input = {}, generatedAt = new Date()) {
  const rows = canonicalApplicationRecords(input);
  const lines = [
    '# Application ledger', '',
    `Generated: ${new Date(generatedAt).toISOString()}`, '',
    'An application counts as submitted only when an authoritative employer receipt is verified.', '',
    '| Employer | Role | Requisition | Status | Updated | Employer link |',
    '|---|---|---|---|---|---|',
  ];
  for (const item of rows) {
    const role = item.role || {};
    const url = /^https:\/\//i.test(text(role.directEmployerUrl, 900)) ? `[Open](${text(role.directEmployerUrl, 900)})` : '';
    lines.push(`| ${cell(role.employer)} | ${cell(role.title)} | ${cell(role.requisitionId)} | ${cell(item.status)} | ${cell(item.updatedAt)} | ${url} |`);
  }
  if (!rows.length) lines.push('| No applications yet |  |  |  |  |  |');
  return `${lines.join('\n')}\n`;
}
