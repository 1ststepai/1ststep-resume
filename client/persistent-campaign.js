import { PROHIBITED_CREDENTIAL_KEY, PROHIBITED_SECRET_VALUE } from './prohibited-secret.js';

const text = value => String(value ?? '').trim();
const list = value => Array.isArray(value)
  ? value.map(text).filter(Boolean)
  : text(value).split(/[\n;]/).map(text).filter(Boolean);
const stamp = value => value || new Date().toISOString();
const id = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const CAMPAIGN_TYPES = Object.freeze([
  'remote_job_search', 'vendor_sourcing', 'competitor_monitoring', 'website_qa', 'custom_operations',
]);

export const CAMPAIGN_STATUSES = Object.freeze(['design', 'paused', 'active', 'completed']);
export const CAMPAIGN_ITEM_STATUSES = Object.freeze([
  'Discovered', 'Verified', 'Prepared', 'Ready', 'Awaiting Human Action', 'Executed', 'Verified Complete', 'Blocked', 'Closed',
]);
export const CONTROL_CLASSES = Object.freeze(['AUTOMATIC', 'AUTHORIZED', 'REQUIRES_HUMAN_ACTION', 'PROHIBITED']);
export const HUMAN_ACTION_TYPES = Object.freeze([
  'LOGIN', 'OTP', 'CAPTCHA', 'IDENTITY_VERIFICATION', 'SIGNATURE', 'MATERIAL_CONSENT', 'PAYMENT',
  'NEW_FACT', 'QUALIFICATION_GAP', 'CONFLICT', 'INTEGRATION_REQUIRED', 'OTHER',
]);

export const CAMPAIGN_TEMPLATES = Object.freeze([
  {
    id: 'remote-job-search', campaignType: 'remote_job_search', name: 'Remote Job Search',
    objective: 'Continuously discover, verify, prepare, and track qualified remote opportunities until the configured stop condition is met.',
    hardRules: ['Verify the authoritative source', 'Reject stale or duplicate items', 'Apply configured eligibility filters'],
    standingAuthorization: ['Research and verify', 'Prepare approved materials', 'Continue unrelated work when one item is blocked'],
    humanActionTriggers: ['New factual question', 'Login, OTP, CAPTCHA, or identity verification', 'Material consent or qualification gap'],
    evidenceRules: ['Authoritative receipt or trusted confirmation is required for Verified Complete'],
    stopConditions: ['User marks the goal achieved', 'No viable work remains', 'Configured expiry is reached'],
  },
  {
    id: 'vendor-sourcing', campaignType: 'vendor_sourcing', name: 'Vendor Sourcing',
    objective: 'Research and verify vendors against configured requirements until the sourcing target or stop condition is reached.',
    hardRules: ['Use authoritative company sources', 'Deduplicate vendor identities', 'Do not transmit private requirements without authorization'],
    standingAuthorization: ['Research public sources', 'Compare verified capabilities', 'Prepare a shortlist'],
    humanActionTriggers: ['Pricing commitment', 'Contract term', 'External outreach', 'New confidential requirement'],
    evidenceRules: ['Verified source URL and review timestamp are required for qualification'],
    stopConditions: ['Target shortlist is verified', 'No viable vendors remain', 'User pauses the campaign'],
  },
  {
    id: 'competitor-monitor', campaignType: 'competitor_monitoring', name: 'Competitor Monitor',
    objective: 'Monitor authoritative public sources for material competitor changes and report evidence-backed updates.',
    hardRules: ['Use public sources only', 'Do not infer unverified changes', 'Deduplicate repeated observations'],
    standingAuthorization: ['Inspect public sources', 'Classify verified changes', 'Prepare reports'],
    humanActionTriggers: ['Paywall or login', 'Ambiguous identity', 'Requested external communication'],
    evidenceRules: ['Source URL, observation timestamp, and verification method are required'],
    stopConditions: ['Expiry date is reached', 'User pauses the campaign', 'Source coverage is no longer viable'],
  },
  {
    id: 'website-qa', campaignType: 'website_qa', name: 'Website QA',
    objective: 'Check configured website journeys for verified regressions and surface reproducible failures.',
    hardRules: ['Use non-destructive checks', 'Do not submit production forms', 'Do not expose private session data'],
    standingAuthorization: ['Open public pages', 'Run read-only checks', 'Capture minimal diagnostic metadata'],
    humanActionTriggers: ['Login required', 'Destructive test step', 'Customer data exposure', 'Production write required'],
    evidenceRules: ['Route, timestamp, expected state, and observed state are required'],
    stopConditions: ['Test window ends', 'Failure threshold is reached', 'User pauses the campaign'],
  },
]);

export const DEFAULT_PRIVACY_POLICY = Object.freeze({
  persistCampaignConfiguration: true,
  persistPrivateExecutionContext: false,
  privateContextRetention: 'session_only',
  analytics: 'operational_metadata_only',
});

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+?1[\s.-])?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/;
const SECRET_KEY = PROHIBITED_CREDENTIAL_KEY;
const SECRET_VALUE = PROHIBITED_SECRET_VALUE;
const PRIVATE_KEYS = /^(firstName|lastName|fullName|email|phone|address|resume|resumeText|employmentHistory|accountId|loginState|privateContext|candidateProfile)$/i;

function assertSafeValue(value, path = 'campaign') {
  if (Array.isArray(value)) return value.forEach((entry, index) => assertSafeValue(entry, `${path}.${index}`));
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (PRIVATE_KEYS.test(key) || SECRET_KEY.test(key)) throw new Error(`Private execution field is not allowed in campaign configuration: ${path}.${key}`);
      assertSafeValue(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && (EMAIL.test(value) || PHONE.test(value) || SECRET_VALUE.test(value))) {
    throw new Error(`Private or secret content is not allowed in persistent campaign configuration: ${path}`);
  }
}

function normalizeCadence(input = {}) {
  return {
    timezone: text(input.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    recurrence: text(input.recurrence) || 'manual',
    allowedRunWindow: text(input.allowedRunWindow),
    reportingTime: text(input.reportingTime),
  };
}

function normalizeTargets(input = {}) {
  return {
    dailyTarget: Number(input.dailyTarget) || null,
    runTarget: Number(input.runTarget) || null,
    floor: Number(input.floor) || null,
    ceiling: Number(input.ceiling) || null,
  };
}

export function createPersistentCampaign(input = {}, at) {
  assertSafeValue(input);
  const campaignType = CAMPAIGN_TYPES.includes(input.campaignType) ? input.campaignType : 'custom_operations';
  const createdAt = stamp(at);
  return {
    id: text(input.id) || id('campaign'), version: 1, campaignType,
    name: text(input.name) || CAMPAIGN_TEMPLATES.find(template => template.campaignType === campaignType)?.name || 'Untitled campaign',
    objective: text(input.objective), description: text(input.description),
    cadence: normalizeCadence(input.cadence), targets: normalizeTargets(input.targets),
    priorities: list(input.priorities), hardRules: list(input.hardRules), exclusions: list(input.exclusions),
    standingAuthorization: list(input.standingAuthorization), humanActionTriggers: list(input.humanActionTriggers),
    evidenceRules: list(input.evidenceRules), reportingRequirements: list(input.reportingRequirements),
    stopConditions: list(input.stopConditions), statuses: [...CAMPAIGN_ITEM_STATUSES],
    privacyPolicy: { ...DEFAULT_PRIVACY_POLICY }, status: CAMPAIGN_STATUSES.includes(input.status) ? input.status : 'design',
    executionCapability: { schedulerConnected: false, externalExecutionConnected: false },
    createdAt: text(input.createdAt) || createdAt, updatedAt: createdAt,
    pausedAt: text(input.pausedAt) || null, completedAt: text(input.completedAt) || null,
  };
}

export function validateOperatingContract(campaign) {
  const issues = [];
  if (!text(campaign?.objective)) issues.push('objective');
  if (!text(campaign?.cadence?.timezone)) issues.push('timezone');
  if (!text(campaign?.cadence?.recurrence)) issues.push('cadence');
  if (!campaign?.hardRules?.length) issues.push('hard rules');
  if (!campaign?.standingAuthorization?.length) issues.push('standing authorization');
  if (!campaign?.humanActionTriggers?.length) issues.push('human action triggers');
  if (!campaign?.evidenceRules?.length) issues.push('evidence rules');
  if (!campaign?.stopConditions?.length) issues.push('stop conditions');
  return { complete: issues.length === 0, issues };
}

export function createCampaignStore(input = {}) {
  return {
    version: 1,
    campaigns: Array.isArray(input.campaigns) ? input.campaigns.map(campaign => createPersistentCampaign(campaign, campaign.updatedAt)) : [],
    activeCampaignId: text(input.activeCampaignId),
    runs: Array.isArray(input.runs) ? input.runs : [],
    items: Array.isArray(input.items) ? input.items : [],
    humanActions: Array.isArray(input.humanActions) ? input.humanActions : [],
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    transitions: Array.isArray(input.transitions) ? input.transitions : [],
  };
}

export function addCampaign(inputStore, campaignInput, at) {
  const store = createCampaignStore(inputStore);
  const campaign = createPersistentCampaign(campaignInput, at);
  return { ...store, campaigns: [campaign, ...store.campaigns], activeCampaignId: campaign.id };
}

export function updatePersistentCampaign(inputStore, campaignId, patch = {}, at) {
  const store = createCampaignStore(inputStore);
  const current = store.campaigns.find(campaign => campaign.id === campaignId);
  if (!current) throw new Error('Campaign not found.');
  const updated = createPersistentCampaign({ ...current, ...patch, id: current.id, createdAt: current.createdAt, status: current.status }, at);
  return { ...store, campaigns: store.campaigns.map(campaign => campaign.id === campaignId ? updated : campaign) };
}

export function updateCampaignStatus(inputStore, campaignId, nextStatus, at) {
  const store = createCampaignStore(inputStore);
  if (!CAMPAIGN_STATUSES.includes(nextStatus)) throw new Error('Unknown campaign status.');
  const campaign = store.campaigns.find(item => item.id === campaignId);
  if (!campaign) throw new Error('Campaign not found.');
  if (nextStatus === 'active' && !campaign.executionCapability.schedulerConnected) {
    throw new Error('Integration Required: scheduling is not connected. Keep this campaign in Design mode.');
  }
  const when = stamp(at);
  return {
    ...store,
    campaigns: store.campaigns.map(item => item.id === campaignId ? {
      ...item, status: nextStatus, updatedAt: when,
      pausedAt: nextStatus === 'paused' ? when : item.pausedAt,
      completedAt: nextStatus === 'completed' ? when : item.completedAt,
    } : item),
  };
}

export function createCampaignRun(inputStore, campaignId, input = {}, at) {
  const store = createCampaignStore(inputStore);
  const campaign = store.campaigns.find(item => item.id === campaignId);
  if (!campaign) throw new Error('Campaign not found.');
  if (!campaign.executionCapability.schedulerConnected && input.allowDesignFixture !== true) {
    throw new Error('Integration Required: no scheduler is connected, so a real run cannot start.');
  }
  const run = {
    id: id('run'), campaignId, startedAt: stamp(at), finishedAt: null,
    status: input.allowDesignFixture === true ? 'design_fixture' : 'running',
    counts: { discovered: 0, verified: 0, ready: 0, completed: 0, humanActionRequired: 0, blocked: 0, closed: 0, errors: 0 },
    nextRun: null,
  };
  return { store: { ...store, runs: [run, ...store.runs] }, run };
}

export function addCampaignItem(inputStore, campaignId, input = {}, at) {
  const store = createCampaignStore(inputStore);
  if (!store.campaigns.some(item => item.id === campaignId)) throw new Error('Campaign not found.');
  assertSafeValue(input, 'item');
  const item = {
    id: text(input.id) || id('item'), campaignId, runId: text(input.runId),
    title: text(input.title) || 'Untitled work item', status: CAMPAIGN_ITEM_STATUSES.includes(input.status) ? input.status : 'Discovered',
    createdAt: stamp(at), updatedAt: stamp(at), blocker: null,
  };
  return { store: { ...store, items: [item, ...store.items] }, item };
}

function evidenceMetadata(input = {}, at) {
  assertSafeValue(input, 'evidence');
  return {
    id: id('evidence'), timestamp: stamp(at), evidenceType: text(input.evidenceType),
    evidenceReference: text(input.evidenceReference), source: text(input.source),
    verificationMethod: text(input.verificationMethod), notes: text(input.notes),
  };
}

export function transitionCampaignItem(inputStore, itemId, input = {}, at) {
  const store = createCampaignStore(inputStore);
  const item = store.items.find(entry => entry.id === itemId);
  if (!item) throw new Error('Campaign item not found.');
  const newStatus = text(input.newStatus);
  if (!CAMPAIGN_ITEM_STATUSES.includes(newStatus)) throw new Error('Unknown campaign item status.');
  let evidence = null;
  if (input.evidence) evidence = evidenceMetadata(input.evidence, at);
  if (['Executed', 'Verified Complete'].includes(newStatus) && (!evidence?.evidenceType || !evidence?.evidenceReference || !evidence?.source || !evidence?.verificationMethod)) {
    throw new Error(`${newStatus} requires authoritative evidence metadata.`);
  }
  const when = stamp(at);
  const transition = {
    id: id('transition'), campaignId: item.campaignId, itemId, previousStatus: item.status, newStatus,
    timestamp: when, evidenceId: evidence?.id || null, blocker: text(input.blocker), notes: text(input.notes),
  };
  const updatedItem = { ...item, status: newStatus, updatedAt: when, blocker: transition.blocker || null };
  return {
    ...store,
    items: store.items.map(entry => entry.id === itemId ? updatedItem : entry),
    evidence: evidence ? [evidence, ...store.evidence] : store.evidence,
    transitions: [transition, ...store.transitions],
  };
}

export function queueCampaignHumanAction(inputStore, itemId, input = {}, at) {
  let store = createCampaignStore(inputStore);
  const item = store.items.find(entry => entry.id === itemId);
  if (!item) throw new Error('Campaign item not found.');
  const blockerType = HUMAN_ACTION_TYPES.includes(input.blockerType) ? input.blockerType : 'OTHER';
  const when = stamp(at);
  const action = {
    id: id('action'), campaignId: item.campaignId, itemId, reason: text(input.reason) || 'Human review required',
    blockerType, requiredUserAction: text(input.requiredUserAction), timestamp: when,
    priority: ['low', 'normal', 'high', 'urgent'].includes(input.priority) ? input.priority : 'normal',
    resumeStateReference: text(input.resumeStateReference), status: 'open',
  };
  assertSafeValue(action, 'humanAction');
  store = transitionCampaignItem(store, itemId, { newStatus: 'Awaiting Human Action', blocker: action.reason }, at);
  return { ...store, humanActions: [action, ...store.humanActions] };
}

export function campaignMetrics(storeInput, campaignId) {
  const store = createCampaignStore(storeInput);
  const items = store.items.filter(item => item.campaignId === campaignId);
  return {
    queue: items.filter(item => !['Verified Complete', 'Closed'].includes(item.status)).length,
    discovered: items.filter(item => item.status === 'Discovered').length,
    verified: items.filter(item => item.status === 'Verified').length,
    ready: items.filter(item => ['Prepared', 'Ready'].includes(item.status)).length,
    completed: items.filter(item => item.status === 'Verified Complete').length,
    humanAction: items.filter(item => item.status === 'Awaiting Human Action').length,
    blocked: items.filter(item => item.status === 'Blocked').length,
  };
}

export function campaignAnalyticsEvent(eventName, input = {}) {
  const allowed = ['campaignType', 'runCount', 'runDuration', 'statusTransition', 'blockerCategory', 'itemCount', 'completionCount', 'humanActionCount', 'errorCategory'];
  const metadata = {};
  for (const key of allowed) {
    if (['string', 'number', 'boolean'].includes(typeof input[key])) metadata[key] = input[key];
  }
  return { event: text(eventName), metadata };
}

export function operatingContractText(campaign) {
  const section = (label, value) => `${label}\n${list(value).join('\n') || '—'}`;
  return [
    section('OBJECTIVE', campaign.objective),
    section('TARGETS', Object.entries(campaign.targets || {}).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`)),
    section('SCHEDULE', [`Timezone: ${campaign.cadence?.timezone || '—'}`, `Recurrence: ${campaign.cadence?.recurrence || '—'}`, `Run window: ${campaign.cadence?.allowedRunWindow || '—'}`, `Reporting: ${campaign.cadence?.reportingTime || '—'}`]),
    section('HARD RULES', campaign.hardRules), section('PRIORITIES', campaign.priorities),
    section('STANDING AUTHORIZATION', campaign.standingAuthorization),
    section('HUMAN ACTION REQUIRED WHEN', campaign.humanActionTriggers),
    section('EVIDENCE REQUIRED FOR COMPLETION', campaign.evidenceRules),
    section('REPORTING REQUIREMENTS', campaign.reportingRequirements),
    section('STOP CONDITIONS', campaign.stopConditions),
  ].join('\n\n');
}
