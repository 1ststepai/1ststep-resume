/* PDF text extraction — items must be joined by geometry, not by a blank space.
   A resume with letter-spaced headings emits one item per glyph, so join(' ')
   produced "P R O C U R E M E N T" and lost every line break. */
function pdfItemsToText(items) {
  var out = '';
  var prev = null;
  for (var i = 0; i < (items || []).length; i += 1) {
    var item = items[i];
    if (!item || typeof item.str !== 'string') continue;
    if (item.str === '') { if (item.hasEOL) { out += '\n'; prev = null; } continue; }
    if (prev) {
      var t = item.transform || [0,0,0,0,0,0];
      var p = prev.transform || [0,0,0,0,0,0];
      var line = Math.abs(item.height || prev.height || 10) || 10;
      var dy = Math.abs((t[5] || 0) - (p[5] || 0));
      if (dy > line * 0.5) {
        out += '\n';
      } else {
        var gap = (t[4] || 0) - ((p[4] || 0) + (prev.width || 0));
        if (gap > line * 0.25) out += ' ';
      }
    }
    out += item.str;
    if (item.hasEOL) { out += '\n'; prev = null; } else { prev = item; }
  }
  return out;
}
function collapseLetterSpacing(text) {
  return String(text == null ? '' : text)
    .replace(/(?:\b[A-Za-z0-9]\b[ \t](?![ \t])){3,}\b[A-Za-z0-9]\b/g, function (run) {
      return run.replace(/[ \t]+/g, '');
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

import { buildSearchLinks, classifyConciergeMessage, conciergeStateGuidance, missionGaps, parseMission } from './client/concierge-router.js';
import {
  ACTION_TYPES, APPLICATION_WORKFLOW_STEPS, DEMO_STAGES, ONBOARDING_REQUIRED_FIELDS, READINESS_FIELDS, REDACTED_WORKFLOW_REPLAY, addActionItem, addRole, advanceManagedApplicationSession, advanceSalesDemo, approveBatch,
  buildCareerStoryDraft, buildReadinessDraftFromSources, buildVerifiedResumeDraft, confirmReadinessDraft, confirmReusableFact, createApprovalBatch, createDeskState, createSalesDemo, deleteReusableFact, discardReadinessDraft,
  exportReadinessData, importLegacyEntries, pauseManagedApplicationSession, pipelineCounts, readinessStatus, resetSalesDemo,
  recordGeneratedPackage, recordPackageRunCheckpoint, resolveActionItem, resolveManagedApplicationException, resumeManagedApplicationSession, setAutonomyLevel, setStandingPolicy, stageReadinessDraft, startManagedApplicationSession, transitionRole, truthProfileGaps, updateTruthProfile,
  verificationGaps,
} from './client/concierge-domain.js';
import { acquisitionFunnel, evaluateCandidateFit, extractStructuredRequirements, upsertHiringEcosystem } from './client/job-intelligence.js';
import { JOB_RELEVANCE_POLICY_VERSION, jobTitleMatchesMission, restoredJobCardIsRelevant } from './client/job-mission-relevance.js';
import { buildAnswerCoachingRequest, summarizePracticeSession } from './client/interview-practice.js';
import { OPPORTUNITY_PATHS, OPPORTUNITY_SECTORS, mergeAuthoritativeOutcomeEvidence, opportunityPathOutcomeEvidence, rankOpportunityPaths, suggestedOpportunityPaths } from './client/opportunity-paths.js';
import { authoritativeReceiptCount, canonicalConversation, directSourceCoverage, maskedActivityFeed, missionStats, needsYouKind, statusBadgeClass, statusTab, subscriberStatus as subscriberUiStatus } from './client/subscriber-ui-model.js';
import {
  CAMPAIGN_TEMPLATES, addCampaign, campaignMetrics, createCampaignStore, operatingContractText, updateCampaignStatus, updatePersistentCampaign,
} from './client/persistent-campaign.js';

const MISSION_KEY = '1ststep_concierge_mission_v1';
const DESK_KEY = '1ststep_concierge_desk_v2';
const TAILOR_REQUEST_KEY = '1ststep_concierge_tailor_request_v1';
const PACKAGE_RESULT_KEY = '1ststep_concierge_package_result_v1';
const AI_CONSENT_KEY = '1ststep_concierge_ai_consent_v1';
const CAREER_STORY_CONSENT_KEY = '1ststep_career_story_ai_consent_v1';
const PACKAGE_AI_CONSENT_KEY = '1ststep_package_ai_consent_v1';
const CAMPAIGN_KEY = '1ststep_persistent_campaigns_v1';
const DAILY_GOAL_KEY = '1ststep_concierge_daily_goal_v1';
const JOB_AGENT_RUN_KEY = '1ststep_job_agent_run_v1';
const VAULT_PREFERENCE_KEY = '1ststep_applicant_vault_preference_v1';
const RESUME_KEYS = ['1ststep_resume', '1ststep_resume_text'];
const $ = id => document.getElementById(id);
const list = value => String(value || '').split(/[\n,]/).map(item => item.trim()).filter(Boolean);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const escapeXmlData = value => String(value ?? '').replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]);
let missionState = loadWorkflowJson(MISSION_KEY, { mission: {}, messages: [] });
let deskState = createDeskState(loadWorkflowJson(DESK_KEY, {}));
let campaignStore = createCampaignStore(loadWorkflowJson(CAMPAIGN_KEY, {}));
let dailyGoal = loadWorkflowJson(DAILY_GOAL_KEY, { target: 10, updatedAt: null });
let campaignSync = { version: 0, hydrated: false, status: 'local', timer: null, inFlight: false, queued: false };
let sessionCapabilities = { adminConsole: false, jobAgentAccess: false, tier: 'guest', checked: false, authentication: 'none', expiresAt: null, pilotAccess: null, jobAgentConsent: null, jobAgentConsentPolicyConfigured: null, jobAgentConsentVersion: 0 };
let publicAppConfig = { authentication: { restoreAccessAvailable: null } };
let operationalMetrics = null;
let durableRun = loadWorkflowJson(JOB_AGENT_RUN_KEY, null);
let jobAgentSchedule = { version: 0, schedule: null, enabled: null, status: 'local' };
let jobAgentNotifications = { version: 0, preference: null, available: null, status: 'local' };
let applicantVault = { version: 0, vault: null, status: 'local', inFlight: false };
let jobAgentLearning = { version: 0, learning: null, facts: [], status: 'local' };
let syncedSubscriberView = { jobCards: [], needsYou: [], runState: null };
let durableApplicationSessions = [];
let finalSubmissionExecutionEnabled = false;
let activeDurableApplicationSessionId = '';
let durableApplicationSessionStatus = 'local';
let durableBrowserHandoff = { applicationSessionId: '', session: null, view: null, provider: null, status: 'idle', error: '' };
let agentRestoreChallenge = '';
let campaignWizardStep = 0;
let editingCampaignId = null;
let activeQuestionKey = '';
let resumeInterviewActive = false;
let careerStoryActive = false;
let activePackageRoleId = '';
let activeJobTab = 'Matches';
let pendingConsequence = null;
let pendingConsentContinuation = null;
let lastDialogTrigger = null;
const LOCAL_APPLICATION_UI_FIXTURE = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
  && new URLSearchParams(window.location.search).get('uiFixture') === 'durable-application';
const LOCAL_SUBSCRIBER_UI_FIXTURE = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
  && new URLSearchParams(window.location.search).get('uiFixture') === 'subscriber';
if (LOCAL_APPLICATION_UI_FIXTURE) {
  const fixtureNow = new Date().toISOString();
  durableApplicationSessions = [{
    id: 'application_local_fixture_001', version: 1, packageRunId: 'run_local_fixture_package_001',
    role: { employer: 'Harbor Supply Co.', title: 'Strategic Sourcing Manager', requisitionId: 'REQ-DEMO-204', directEmployerUrl: 'https://careers.example.com/jobs/REQ-DEMO-204' },
    documentVersion: 'resume-demo-v3', state: 'Waiting for You', stage: 'transmission_approval', externalApplicationExecution: false,
    worker: { mode: 'disabled', isolated: false, browserSessionReference: null },
    proposedFields: [{ fieldKey: 'startDate', label: 'Start date', factId: 'fact_local_start_date', maskedPreview: 'Verified answer ••••', confidence: 1, provenance: 'candidate confirmation', ordinaryVerified: true }],
    formCheckpoint: { status: 'not-started', pageUrl: 'https://careers.example.com/jobs/REQ-DEMO-204', stepKey: null, fieldSchemaHash: null, stagedFieldKeys: [], attachedDocumentVersion: 'resume-demo-v3', preservedAt: null },
    approvals: { transmission: null, submission: null }, receipt: null,
    actions: [{ id: 'action_local_transmission_001', type: 'TRANSMISSION_APPROVAL', status: 'open', summary: 'Approve sharing the masked verified fields and resume-demo-v3 with Harbor Supply Co. Nothing will be submitted.', metadata: { scopeHash: '0'.repeat(64), documentVersion: 'resume-demo-v3' }, createdAt: fixtureNow, resolvedAt: null }],
    createdAt: fixtureNow, updatedAt: fixtureNow,
    timeline: [{ id: 'event_local_fixture_001', kind: 'SESSION_CREATED', summary: 'Durable application session created. No employer request or personal-data transmission occurred.', metadata: {}, at: fixtureNow }],
  }];
}
if (LOCAL_SUBSCRIBER_UI_FIXTURE) {
  const fixtureNow = new Date().toISOString();
  missionState = { mission: { role: 'Procurement Manager', roleFamily: 'procurement', workModes: ['Remote'], employmentTypes: ['Full-time'], salaryMin: 100000, location: 'United States', target: 10 }, messages: [], discovery: { status: 'complete', matches: 5 }, runState: 'Preparing' };
  deskState = createDeskState({
    roles: [
      { id: 'fixture-found', employer: 'Northwind Logistics', title: 'Procurement Manager', requisitionId: 'NW-102', directEmployerUrl: 'https://careers.example.com/NW-102', status: 'Found', fitScore: 91, remoteEligibility: 'Remote · United States', salaryMin: 110000, salaryMax: 135000, createdAt: fixtureNow },
      { id: 'fixture-stale-off-mission', employer: 'Archived Example', title: 'Legal Operations Analyst II', requisitionId: 'OLD-099', directEmployerUrl: 'https://careers.example.com/OLD-099', status: 'Found', fitScore: 95, remoteEligibility: 'Remote · United States', salaryMin: 120000, createdAt: fixtureNow },
      { id: 'fixture-verified', employer: 'Harbor Supply Co.', title: 'Strategic Sourcing Manager', requisitionId: 'HS-204', directEmployerUrl: 'https://careers.example.com/HS-204', status: 'Verified', fitScore: 88, remoteEligibility: 'Remote · New Jersey eligible', salaryMin: 105000, createdAt: fixtureNow },
      { id: 'fixture-ready', employer: 'Summit Manufacturing', title: 'Vendor Operations Lead', requisitionId: 'SM-310', directEmployerUrl: 'https://careers.example.com/SM-310', status: 'Package Ready', fitScore: 84, remoteEligibility: 'Hybrid · Newark, NJ', salaryMin: 100000, createdAt: fixtureNow },
      { id: 'fixture-receipt', employer: 'Brightline Services', title: 'Senior Procurement Specialist', requisitionId: 'BS-412', directEmployerUrl: 'https://careers.example.com/BS-412', status: 'Submitted', fitScore: 82, remoteEligibility: 'Remote · United States', receipt: { confirmationId: 'BR-412-OK', receivedAt: fixtureNow, simulated: false }, createdAt: fixtureNow },
      { id: 'fixture-interview', employer: 'Cedar Systems', title: 'Supplier Relationship Manager', requisitionId: 'CS-509', directEmployerUrl: 'https://careers.example.com/CS-509', status: 'Interview', fitScore: 86, remoteEligibility: 'Remote · Eastern time', createdAt: fixtureNow },
    ],
    actionQueue: [{ id: 'fixture-action', roleId: 'fixture-ready', type: 'OUTSIDE_EMPLOYMENT_CONFLICT', status: 'open', summary: 'The employer asks about a possible outside-employment conflict. Confirm the facts before this application continues.', createdAt: fixtureNow }],
    reusableFacts: [], standingPolicies: [], approvalBatches: [], applicationSessions: [], hiringEcosystem: [], acquisitionOutcomes: [], auditEvents: [],
  });
}
let guidedSelection = {
  goal: missionState.onboardingDraft?.goal || missionState.mission?.searchGoal || '',
  pathId: missionState.onboardingDraft?.pathId || missionState.mission?.roleFamily || '',
  workMode: missionState.onboardingDraft?.workMode || missionState.mission?.workModes?.[0] || missionState.mission?.workMode || 'Remote',
  employmentType: missionState.onboardingDraft?.employmentType || missionState.mission?.employmentTypes?.[0] || 'Full-time',
  salary: Number(missionState.onboardingDraft?.salary ?? missionState.mission?.salaryMin) || 0,
  location: missionState.onboardingDraft?.location || missionState.mission?.location || '',
};
let opportunitySector = 'recommended';
let guidedLaunchStep = Math.min(6, Math.max(0, Number(missionState.onboardingDraft?.step) || 0));
let guidedLaunchOpen = false;
const GUIDED_LAUNCH_STAGES = Object.freeze(['goal', 'resume', 'path', 'work', 'employment', 'salary', 'review']);
if (LOCAL_SUBSCRIBER_UI_FIXTURE) guidedSelection = { goal: 'best-fit', pathId: 'procurement', workMode: 'Remote', employmentType: 'Full-time', salary: 100000, location: 'United States' };
const QUICK_ANSWERS = Object.freeze({
  authorization: ['Authorized to work in the United States', 'Not currently authorized', 'Unsure'],
  sponsorship: ['No sponsorship required', 'Sponsorship required', 'Unsure'],
  startDate: ['Two weeks notice', 'Available immediately', 'Ask me per job'],
  travel: ['No travel', 'Up to 10%', 'Up to 25%', 'Flexible'], relocation: ['No relocation', 'Open to relocation', 'Case by case'],
  schedule: ['Standard business hours', 'Flexible', 'Ask me per job'], outsideEmployment: ['No known conflict', 'Review per employer'],
  driving: ['Valid license and willing', 'Not available', 'Not applicable'], background: ['Willing', 'Review per employer'],
  drugHealth: ['Willing', 'Review per employer'], references: ['Ask before contacting', 'May contact listed references'],
  recruiterContact: ['Email allowed', 'Email and phone allowed', 'Ask before contact'],
  accountCreation: ['Allow approved credential flow', 'Ask each time'], privacyTerms: ['Accept ordinary terms in policy', 'Ask each time'],
  demographics: ['Leave optional demographics unanswered', 'Prefer not to answer'],
});
const SENSITIVE_QUESTION_KEYS = new Set(['contact', 'address', 'authorization', 'sponsorship', 'salary', 'outsideEmployment', 'background', 'drugHealth', 'formerEmployerConflict', 'demographics']);
const CONSEQUENTIAL_QUESTION_KEYS = new Set(['authorization', 'sponsorship', 'outsideEmployment', 'background', 'drugHealth', 'formerEmployerConflict', 'references', 'licenses', 'driving', 'demographics']);
const WORKFLOW_LABELS = Object.freeze({
  discover_verify: 'Discover & Verify', deduplicate: 'Deduplicate', tailor_package: 'Tailor Package',
  account_profile: 'Account/Profile', autofill: 'Autofill', review_exception: 'Review Exception',
  transmit: 'Transmit', submit: 'Submit', verify_receipt: 'Verify Receipt',
});
const RUN_STATES = Object.freeze(['Searching', 'Preparing', 'Waiting for You', 'Paused', 'Finished']);
const REQUEST_TIMEOUTS = Object.freeze({ discovery: 30000, aiFast: 20000, aiQuality: 40000, persistence: 10000, capability: 8000 });

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('That request is taking longer than expected. Your progress is saved; try again when ready.');
      timeout.code = 'REQUEST_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function consumeGeneratedPackage() {
  const result = loadJson(PACKAGE_RESULT_KEY, null);
  if (!result?.roleId) return;
  try {
    deskState = recordGeneratedPackage(deskState, result.roleId, result);
    localStorage.removeItem(PACKAGE_RESULT_KEY);
    saveAll();
  } catch { /* retain unmatched result for recovery after its role is restored */ }
}

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; }
}
function loadWorkflowJson(key, fallback) {
  try {
    const sessionValue = sessionStorage.getItem(key);
    if (sessionValue) return JSON.parse(sessionValue) || fallback;
    const legacyValue = localStorage.getItem(key);
    if (!legacyValue) return fallback;
    sessionStorage.setItem(key, legacyValue);
    localStorage.removeItem(key);
    return JSON.parse(legacyValue) || fallback;
  } catch {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    return fallback;
  }
}
function accountWorkflowIsAuthoritative() {
  return sessionCapabilities.authentication === 'opaque-session' && hasJobAgentAccess();
}
function clearBrowserWorkflowCopies() {
  for (const key of [MISSION_KEY, DESK_KEY, CAMPAIGN_KEY, DAILY_GOAL_KEY, JOB_AGENT_RUN_KEY]) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}
function cacheDurableRun(run) {
  localStorage.removeItem(JOB_AGENT_RUN_KEY);
  if (accountWorkflowIsAuthoritative() || !run) sessionStorage.removeItem(JOB_AGENT_RUN_KEY);
  else sessionStorage.setItem(JOB_AGENT_RUN_KEY, JSON.stringify(run));
}
function saveAll() {
  if (accountWorkflowIsAuthoritative()) {
    clearBrowserWorkflowCopies();
    scheduleCampaignSync();
    return;
  }
  sessionStorage.setItem(MISSION_KEY, JSON.stringify(missionState));
  sessionStorage.setItem(DESK_KEY, JSON.stringify(deskState));
  sessionStorage.setItem(CAMPAIGN_KEY, JSON.stringify(campaignStore));
  sessionStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(dailyGoal));
  localStorage.removeItem(MISSION_KEY);
  localStorage.removeItem(DESK_KEY);
  localStorage.removeItem(CAMPAIGN_KEY);
  localStorage.removeItem(DAILY_GOAL_KEY);
}

function renderCampaignSyncStatus() {
  const target = $('campaignSyncStatus');
  if (!target) return;
  const labels = accountWorkflowIsAuthoritative() ? {
    local: 'Loading secure account state…', pending: 'Saving securely…', synced: 'Secure account state current',
    unavailable: 'Secure account save needs attention · retry before leaving', conflict: 'Changed in another session · refresh to reconcile',
  } : {
    local: 'Preview saved for this tab', pending: 'Saving securely…', synced: 'Secure account state current',
    unavailable: 'Secure account state unavailable', conflict: 'Changed in another session · refresh to reconcile',
  };
  target.textContent = labels[campaignSync.status] || labels.local;
  target.dataset.state = campaignSync.status;
}

function scheduleCampaignSync() {
  if (!campaignSync.hydrated || !hasApiSession()) return;
  campaignSync.queued = true;
  clearTimeout(campaignSync.timer);
  campaignSync.status = 'pending';
  renderCampaignSyncStatus();
  campaignSync.timer = setTimeout(pushCampaignStore, 650);
}

function durableCampaignSnapshot() {
  const durableRoleSource = deskState.roles.length ? visibleSubscriberRoles(deskState.roles) : (syncedSubscriberView.jobCards || []);
  const jobCards = durableRoleSource.slice(0, 100).map(role => ({
    id: role.id, employer: role.employer, title: role.title, status: subscriberUiStatus(role),
    requisitionId: role.requisitionId || '', sourceUrl: role.sourceUrl || '', sourceProvider: role.sourceProvider || '',
    discoveryRunId: role.discoveryRunId || '', applyPathActive: role.applyPathActive === true,
    packageRunId: role.packageRunId || '', packageRunStatus: role.packageRunStatus || '',
    fitScore: role.fitScore == null ? null : Number(role.fitScore), remoteEligibility: role.remoteEligibility || '',
    salaryMin: Number(role.salaryMin) || null, salaryMax: Number(role.salaryMax) || null,
    geographyEligibility: role.geographyEligibility || '', salaryDisclosure: role.salaryDisclosure || '',
    employmentType: role.employmentType || '', postedDate: role.postedDate || '', travel: role.travel || '', schedule: role.schedule || '',
    directEmployerUrl: role.directEmployerUrl || '', updatedAt: role.updatedAt || role.createdAt || null,
  }));
  const durableActionSource = deskState.actionQueue.length ? deskState.actionQueue.filter(item => item.status === 'open') : (syncedSubscriberView.needsYou || []);
  const needsYou = durableActionSource.slice(0, 100).map(item => ({
    id: item.id, roleId: item.roleId || '', type: item.type || 'HUMAN_ACTION',
    summary: item.summary || 'A secure step needs your attention.', status: 'open',
  }));
  return {
    ...campaignStore,
    workspace: {
      version: 1,
      mission: missionState.mission || {},
      onboardingDraft: missionState.onboardingDraft || null,
      dailyGoal: { target: Math.min(50, Math.max(1, Number(dailyGoal.target) || 10)), updatedAt: dailyGoal.updatedAt || null },
    },
    subscriberView: { version: 1, runState: currentRunState(), jobCards, needsYou },
  };
}

async function pushCampaignStore() {
  const headers = apiAuthorizationHeaders();
  if (!hasApiSession()) return;
  if (campaignSync.inFlight) return;
  campaignSync.inFlight = true;
  campaignSync.queued = false;
  const snapshot = durableCampaignSnapshot();
  try {
    const response = await fetchWithTimeout('/api/concierge-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...headers },
      body: JSON.stringify({ version: campaignSync.version, state: snapshot }),
    }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (response.status === 409) {
      campaignSync.status = 'conflict';
    } else if (!response.ok) {
      campaignSync.status = 'unavailable';
    } else {
      campaignSync.version = Number(data.version) || campaignSync.version;
      syncedSubscriberView = snapshot.subscriberView;
      campaignSync.status = 'synced';
    }
  } catch {
    campaignSync.status = 'unavailable';
  }
  campaignSync.inFlight = false;
  renderCampaignSyncStatus();
  if (campaignSync.queued && campaignSync.status !== 'conflict') {
    clearTimeout(campaignSync.timer);
    campaignSync.timer = setTimeout(pushCampaignStore, 150);
  }
}

async function hydrateCampaignStore() {
  const headers = apiAuthorizationHeaders();
  if (!hasApiSession()) {
    campaignSync.hydrated = true;
    renderCampaignSyncStatus();
    return;
  }
  try {
    const response = await fetchWithTimeout('/api/concierge-state', { headers }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      campaignSync.status = 'unavailable';
    } else {
      campaignSync.version = Number(data.version) || 0;
      if (data.state) {
        syncedSubscriberView = data.state.subscriberView || syncedSubscriberView;
        campaignStore = createCampaignStore(data.state);
        if (data.state.workspace?.version === 1) {
          missionState = {
            mission: data.state.workspace.mission || {}, messages: [],
            onboardingDraft: data.state.workspace.onboardingDraft || null,
            runState: data.state.subscriberView?.runState || null,
            discovery: { status: data.state.subscriberView?.runState === 'Searching' ? 'searching' : 'restored' },
          };
          dailyGoal = data.state.workspace.dailyGoal || { target: missionState.mission?.target || 10, updatedAt: null };
          guidedSelection = {
            goal: missionState.onboardingDraft?.goal || missionState.mission?.searchGoal || '',
            pathId: missionState.onboardingDraft?.pathId || missionState.mission?.roleFamily || '',
            workMode: missionState.onboardingDraft?.workMode || missionState.mission?.workModes?.[0] || 'Remote',
            employmentType: missionState.onboardingDraft?.employmentType || missionState.mission?.employmentTypes?.[0] || 'Full-time',
            salary: Number(missionState.onboardingDraft?.salary ?? missionState.mission?.salaryMin) || 0,
            location: missionState.onboardingDraft?.location || missionState.mission?.location || '',
          };
          guidedLaunchStep = Math.min(6, Math.max(0, Number(missionState.onboardingDraft?.step) || 0));
        }
        clearBrowserWorkflowCopies();
        renderAll();
      }
      campaignSync.status = 'synced';
    }
  } catch {
    campaignSync.status = 'unavailable';
  }
  campaignSync.hydrated = true;
  renderCampaignSyncStatus();
}

function vaultEnabled() { return applicantVault.vault?.consent?.status === 'granted'; }

// Names the actual reason encrypted account backup is unavailable. Encryption and durable
// storage can be fully configured while backup is still blocked by the controlled-beta
// consent policy, so the copy must not blame storage for a gate the user cannot act on.
function vaultInactiveReason() {
  if (applicantVault.status === 'unavailable') return 'Secure encrypted storage is temporarily unavailable.';
  if (!(hasApiSession() && hasJobAgentAccess())) return 'Sign in with Job Agent access to turn on encrypted backup.';
  if (sessionCapabilities.jobAgentConsentPolicyConfigured === false) return 'Controlled-beta policy review is not complete, so encrypted account backup cannot be turned on yet.';
  if (!consentControlAvailable()) return 'Encrypted account backup becomes available once the controlled-beta policy is enabled.';
  return 'Encrypted account backup is off.';
}

function renderVaultStatus() {
  renderJobAgentConsentState();
  const active = vaultEnabled();
  const authenticated = Boolean(hasApiSession() && hasJobAgentAccess());
  const inactiveReason = vaultInactiveReason();
  const statusText = active
    ? `Encrypted backup active · ${applicantVault.vault.facts.filter(item => item.status === 'active').length} confirmed answer(s) · ${applicantVault.vault.documents.filter(item => item.status === 'active').length} document(s)`
    : `${inactiveReason} Unsaved details remain only in this tab.`;
  if ($('vaultStatus')) $('vaultStatus').textContent = statusText;
  if ($('questionVaultStatus')) $('questionVaultStatus').textContent = active
    ? 'Encrypted across your signed-in account.'
    : `${inactiveReason} Answers remain only in this tab.`;
  if ($('resumeVaultStatus')) $('resumeVaultStatus').textContent = active
    ? 'Encrypted across your signed-in account. Passwords, OTPs, and CAPTCHA answers are never stored.'
    : `${inactiveReason} Your resume remains only in this tab. Passwords, OTPs, and CAPTCHA answers are never stored.`;
  if ($('enableVault')) { $('enableVault').hidden = active; $('enableVault').disabled = !authenticated; }
  for (const id of ['exportVault', 'revokeVault', 'deleteVault']) if ($(id)) $(id).disabled = !active;
  renderNeedsYouNotificationPreference();
  if (!$('vaultList')) return;
  const facts = applicantVault.vault?.facts?.filter(item => item.status === 'active') || [];
  const documents = applicantVault.vault?.documents?.filter(item => item.status === 'active') || [];
  const scheduleStatus = jobAgentSchedule.status === 'unavailable' ? 'Daily background status is temporarily unavailable.'
    : jobAgentSchedule.schedule?.status === 'active' ? `Daily search active · next run ${new Date(jobAgentSchedule.schedule.nextRunAt).toLocaleString()}`
      : jobAgentSchedule.enabled === false ? 'Daily background search is not enabled for this controlled beta.' : 'Daily background search is off.';
  const scheduleAction = jobAgentSchedule.schedule?.status === 'active' ? 'pause' : 'resume';
  const scheduleRow = authenticated ? `<div class="desk-row"><div><strong>Daily background search</strong><small>${escapeHtml(scheduleStatus)} · direct-employer discovery only · no applications submitted</small></div><div class="desk-actions"><button data-schedule-action="${scheduleAction}" ${scheduleAction === 'resume' && (!missionState.mission?.role || !activeJobAgentConsent()) ? 'disabled' : ''}>${scheduleAction === 'pause' ? 'Pause daily search' : 'Resume daily search'}</button></div></div>` : '';
  $('vaultList').innerHTML = [scheduleRow, ...facts.map(fact => {
    const version = fact.versions.find(item => item.version === fact.currentVersion) || fact.versions.at(-1);
    return `<div class="desk-row"><div><strong>${escapeHtml(fact.label)}</strong><small>Saved securely · ${escapeHtml(version?.provenance || 'candidate confirmation')} · confidence ${Math.round((Number(version?.confidence) || 0) * 100)}% · version ${fact.currentVersion}${version?.autoReuse ? ' · reusable when meaning matches' : ' · manual review required'}</small></div><div class="desk-actions"><button data-vault-edit-fact="${escapeHtml(fact.fieldKey)}">Edit</button><button data-vault-revoke-fact="${escapeHtml(fact.id)}">Revoke</button></div></div>`;
  }), ...documents.map(document => `<div class="desk-row"><div><strong>${escapeHtml(document.title)}</strong><small>Encrypted document · ${escapeHtml(document.type)} · version ${document.currentVersion} · contents hidden</small></div><div class="desk-actions"><button data-vault-revoke-document="${escapeHtml(document.id)}">Revoke</button></div></div>`)].filter(Boolean).join('') || empty('No encrypted account-backed answers or documents. Unsaved details remain only in this tab.');
}

async function hydrateApplicantVault() {
  if (!hasApiSession() || !hasJobAgentAccess()) { applicantVault.status = 'local'; renderVaultStatus(); return; }
  try {
    const response = await fetchWithTimeout('/api/applicant-vault', { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Secure backup is unavailable.');
    applicantVault = { version: Number(data.version) || 0, vault: data.vault || null, status: 'synced', inFlight: false };
    if (vaultEnabled()) {
      for (const fact of applicantVault.vault.facts.filter(item => item.status === 'active')) {
        if (deskState.reusableFacts.some(item => item.fieldKey === fact.fieldKey)) continue;
        const version = fact.versions.find(item => item.version === fact.currentVersion) || fact.versions.at(-1);
        if (!version?.value) continue;
        deskState = confirmReusableFact(deskState, { fieldKey: fact.fieldKey, value: version.value, confirmed: true, verificationState: version.verificationState, source: `secure-vault:${version.provenance}`, sensitivity: version.sensitivity, autoReuse: version.autoReuse });
      }
      const master = applicantVault.vault.documents.find(document => document.status === 'active' && document.type === 'master-resume');
      if (master && !hasResume()) {
        const version = master.versions.find(item => item.version === master.currentVersion) || master.versions.at(-1);
        if (version?.text) saveResumeText(version.text, 'secure-vault', version.fileName || '');
      }
      saveAll(); renderAll();
    }
  } catch { applicantVault.status = 'unavailable'; }
  renderVaultStatus();
}

async function vaultAction(action, input = {}) {
  if (applicantVault.inFlight) throw new Error('Secure backup is already saving.');
  const headers = apiAuthorizationHeaders();
  if (!hasApiSession() || !hasJobAgentAccess()) throw new Error('Sign in with Job Agent access first.');
  applicantVault.inFlight = true;
  try {
    const response = await fetchWithTimeout('/api/applicant-vault', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...headers },
      body: JSON.stringify({ version: applicantVault.version, action, input }),
    }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (response.status === 409) { await hydrateApplicantVault(); throw new Error('Secure backup changed in another session. Review it and try again.'); }
    if (!response.ok) throw new Error(data.error || 'Secure backup could not be updated.');
    applicantVault.version = Number(data.version) || applicantVault.version;
    applicantVault.vault = data.vault || applicantVault.vault;
    applicantVault.status = 'synced';
    renderVaultStatus();
    return data;
  } finally { applicantVault.inFlight = false; }
}

async function enableApplicantVault({ ask = true } = {}) {
  if (vaultEnabled()) return true;
  if (!hasApiSession() || !hasJobAgentAccess()) return false;
  if (ask && !window.confirm('Back up your confirmed answers and resumes securely across devices? They are encrypted and revocable. Passwords, OTPs, and CAPTCHA answers are never stored.')) {
    localStorage.setItem(VAULT_PREFERENCE_KEY, 'device-only');
    renderVaultStatus();
    return false;
  }
  await vaultAction('grant-consent', { scopes: ['confirmed-facts', 'documents'] });
  localStorage.setItem(VAULT_PREFERENCE_KEY, 'enabled');
  for (const fact of deskState.reusableFacts) await backupConfirmedFact(fact, false);
  const resume = savedResumeText();
  if (resume) await backupResume(resume, '', false);
  return true;
}

async function backupConfirmedFact(fact, ask = true) {
  if (!vaultEnabled() && !(await enableApplicantVault({ ask }))) return false;
  await vaultAction('upsert-fact', {
    fieldKey: fact.fieldKey, label: fact.label, value: fact.value, provenance: fact.source || 'candidate confirmation', confidence: 1,
    verificationState: fact.verificationState === 'document-verified' ? 'document-verified' : 'user-confirmed', sensitivity: fact.sensitivity,
    autoReuse: CONSEQUENTIAL_QUESTION_KEYS.has(fact.fieldKey) ? false : fact.autoReuse === true, scope: fact.scope || {},
  });
  return true;
}

async function backupResume(resumeText, fileName = '', ask = true) {
  if (!vaultEnabled() && !(await enableApplicantVault({ ask }))) return false;
  await vaultAction('upsert-document', { type: 'master-resume', title: 'Master resume', text: resumeText, fileName, provenance: 'candidate-reviewed', qa: { atsTextExtracted: true, renderedPagesReviewed: false } });
  return true;
}

async function backupPackageDocument(type, title, documentText, fileName = '') {
  if (!vaultEnabled() || !documentText) return false;
  await vaultAction('upsert-document', { type, title, text: documentText, fileName, provenance: 'durable-role-package', qa: { atsTextExtracted: true, renderedPagesReviewed: false } });
  return true;
}

function applyDurablePackageRun(run) {
  if (!run?.mission?.roleId) return;
  const roleId = run.mission.roleId;
  deskState = recordPackageRunCheckpoint(deskState, roleId, { runId: run.id, status: run.status, errorCode: run.lastErrorCode || '' });
  if (run.result?.resumeText) {
    deskState = recordGeneratedPackage(deskState, roleId, {
      historyId: run.id, packageRunId: run.id, documentVersion: run.result.documentVersion,
      resumeText: run.result.resumeText, coverLetterText: run.result.coverLetterText || '', atsIssues: run.result.qa?.issues || [],
      atsQa: run.result.qa, qaStatus: run.result.qaStatus, generatedAt: run.result.generatedAt, artifacts: run.result.artifacts || [],
      renderEvidence: run.result.renderEvidence || null,
      source: 'durable-job-agent-package',
    });
    if (vaultEnabled()) {
      backupPackageDocument('tailored-resume', `${run.mission.employer} — ${run.mission.title} resume`, run.result.resumeText, `${run.result.documentVersion}.txt`).catch(() => {});
      if (run.result.coverLetterText) backupPackageDocument('cover-letter', `${run.mission.employer} — ${run.mission.title} cover letter`, run.result.coverLetterText, `${run.result.documentVersion}-cover.txt`).catch(() => {});
    }
  }
  const qa = run.result?.qa;
  const currentRole = deskState.roles.find(item => item.id === roleId);
  if (currentRole?.status === 'Verified - Package Preparation' && run.result?.renderEvidence?.complete === true && qa?.visualPageInspection === true && !(qa.issues || []).length) {
    deskState = transitionRole(deskState, roleId, 'Package Ready', {
      documentVersion: run.result.documentVersion, formats: qa.formats, humanWritten: qa.humanWritten,
      docxTextOrderChecked: qa.docxTextOrderChecked, pdfTextExtracted: qa.pdfTextExtracted,
      visualPageInspection: true, pagesInspected: true, pageCount: qa.pageCount,
      aiTemplateAvoided: qa.aiTemplateAvoided, aiLanguagePolicy: qa.aiLanguagePolicy,
      renderEvidenceId: run.result.renderEvidence.id, renderer: run.result.renderEvidence.renderer,
    });
  }
  if (run.status === 'Waiting for You' && !deskState.actionQueue.some(item => item.roleId === roleId && item.status === 'open' && /package/i.test(item.summary || ''))) {
    const issues = (run.result?.qa?.issues || []).slice(0, 4).join(', ');
    deskState = addActionItem(deskState, { roleId, type: 'NEW_QUESTION', summary: `Review the generated package${issues ? `: ${issues}` : ''}. No document was transmitted.` }).state;
  }
  saveAll(); renderAll();
}

async function refreshDurablePackage(runId, announce = false) {
  try {
    const response = await fetchWithTimeout(`/api/application-packages?id=${encodeURIComponent(runId)}`, { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.run) throw new Error(data.error || 'Package status is unavailable.');
    applyDurablePackageRun(data.run);
    if (announce) addMessage('assistant', data.run.result?.resumeText
      ? '<strong>Your role-specific package is ready for review.</strong><br>Private DOCX/PDF files were generated and their text order, hashes, and page count were checked. Isolated visual-render evidence remains required before Package Ready.'
      : '<strong>Your package is still safely queued.</strong><br>You can close this page; the durable run will resume from its checkpoint.');
    return data.run;
  } catch (error) {
    if (announce) addMessage('assistant', `<strong>Package status is temporarily unavailable.</strong><br>${escapeHtml(error.message)} Your saved role and master resume remain intact.`);
    return null;
  }
}

async function generateDurablePackage(roleId) {
  const role = deskState.roles.find(item => item.id === roleId);
  if (!role) throw new Error('Role not found.');
  if (!hasJobAgentAccess() || !hasApiSession()) throw new Error('Restore Job Agent access before preparing a durable package.');
  if (role.packageRunId && !role.packageDraft) {
    const current = await refreshDurablePackage(role.packageRunId, false);
    if (current?.status !== 'Failed') {
      if (current) addMessage('assistant', '<strong>Your package checkpoint is current.</strong><br>I’ll keep the draft private and surface it here when generation or review is ready.');
      return current;
    }
    const retryResponse = await fetchWithTimeout(`/api/application-packages?id=${encodeURIComponent(role.packageRunId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() }, body: JSON.stringify({ action: 'retry' }),
    }, 55000);
    const retryData = await retryResponse.json().catch(() => ({}));
    if (!retryResponse.ok) throw new Error(retryData.error || 'The failed package could not be retried.');
    applyDurablePackageRun(retryData.run);
    return retryData.run;
  }
  if (!role.jobDescription || role.jobDescription.length < 200) throw new Error('A verified employer job description is required.');
  const resumeText = savedResumeText();
  if (resumeText.length < 200) throw new Error('Save a candidate-reviewed master resume first.');
  if (localStorage.getItem(PACKAGE_AI_CONSENT_KEY) !== 'approved') {
    const approved = window.confirm('Prepare this application package? Your reviewed resume and this verified employer job description will be encrypted in your durable run and sent to 1stStep’s configured AI provider. Nothing is sent to the employer, and no application is submitted.');
    if (!approved) return null;
    localStorage.setItem(PACKAGE_AI_CONSENT_KEY, 'approved');
  }
  if (role.status === 'Verified') deskState = transitionRole(deskState, roleId, 'Verified - Package Preparation', { reason: 'Durable role-specific package generation started' });
  saveAll(); renderAll();
  const requestId = `package_${role.id}_${role.requisitionId}`.replace(/[^A-Za-z0-9:_-]/g, '_').slice(0, 120);
  const response = await fetchWithTimeout('/api/application-packages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId, ...apiAuthorizationHeaders() },
    body: JSON.stringify({ package: {
      roleId: role.id, discoveryRunId: role.discoveryRunId, employer: role.employer, title: role.title, requisitionId: role.requisitionId,
      directEmployerUrl: role.directEmployerUrl, applyPathActive: role.applyPathActive === true,
      jobDescription: role.jobDescription, resumeText, includeCoverLetter: true,
    }, runNow: true }),
  }, 55000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    if (data.code === 'DIRECT_EMPLOYER_REQUISITION_CLOSED') {
      deskState = transitionRole(deskState, roleId, 'Rejected/Closed', { reason: 'The exact direct-employer requisition is no longer active.' });
      saveAll(); renderAll();
      addMessage('assistant', '<strong>This role is closed.</strong><br>The exact employer requisition was rechecked and is no longer active. It was moved to Closed and no résumé was generated.');
      return null;
    }
    if (data.code === 'DIRECT_EMPLOYER_REQUISITION_CHANGED') {
      deskState = transitionRole(deskState, roleId, 'Rejected/Closed', { reason: 'The employer changed the requisition after discovery; the saved snapshot was retired.' });
      saveAll(); renderAll();
      addMessage('assistant', '<strong>The employer changed this posting.</strong><br>The old verified snapshot was retired without generating documents. Your next search can add the current version if it still fits.');
      return null;
    }
    throw new Error(data.error || 'The package could not be started.');
  }
  applyDurablePackageRun(data.run);
  if (!data.run?.result) setTimeout(() => refreshDurablePackage(data.run.id, true), 5000);
  else openPackageReview(deskState.roles.find(item => item.id === roleId));
  return data.run;
}

async function renderDurablePackage(roleId) {
  const role = deskState.roles.find(item => item.id === roleId);
  if (!role?.packageRunId || !role.packageDraft?.artifacts?.length) throw new Error('Generate verified DOCX/PDF files before running the secure render check.');
  const response = await fetchWithTimeout('/api/application-package-render', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() },
    body: JSON.stringify({ runId: role.packageRunId }),
  }, 175000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.run) throw new Error(data.error || 'Secure document rendering did not complete.');
  applyDurablePackageRun(data.run);
  return data.run;
}

function openPackageReview(role) {
  if (!role?.packageDraft) return;
  activePackageRoleId = role.id;
  $('packageReviewTitle').textContent = `${role.employer} — ${role.title}`;
  $('packageReviewStatus').textContent = role.packageDraft.atsIssues?.length
    ? `Needs your review: ${role.packageDraft.atsIssues.join(', ')}`
    : role.packageDraft.artifacts?.length
      ? 'DOCX/PDF text order, integrity, and page count passed. Isolated visual-render evidence is still required before Package Ready.'
      : 'ATS text checks passed. Generate fresh DOCX/PDF files after any edit; visual-render evidence is still required.';
  $('packageResumeText').value = role.packageDraft.resumeText || '';
  $('packageCoverText').value = role.packageDraft.coverLetterText || '';
  $('packageCoverWrap').hidden = !role.packageDraft.coverLetterText;
  $('packageArtifactActions').innerHTML = (role.packageDraft.artifacts || []).map(artifact => `<button type="button" data-package-artifact="${escapeHtml(artifact.key)}">Download ${escapeHtml(artifact.key.replace('_', ' ').toUpperCase())}</button>`).join('');
  $('packageReviewOverlay').classList.add('open');
}

async function downloadPrivatePackageArtifact(role, artifactKey, button) {
  if (!role?.packageRunId || !artifactKey) throw new Error('This document artifact is not available.');
  button.disabled = true;
  try {
    const response = await fetchWithTimeout(`/api/application-package-artifact?id=${encodeURIComponent(role.packageRunId)}&artifact=${encodeURIComponent(artifactKey)}`, { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'The private document could not be downloaded.');
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || `${artifactKey}.${artifactKey.endsWith('pdf') ? 'pdf' : 'docx'}`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
  } finally { button.disabled = false; }
}

function closePackageReview() { $('packageReviewOverlay').classList.remove('open'); activePackageRoleId = ''; }

function stableClientHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

async function reviseDurablePackage(role, resumeText, coverLetterText) {
  if (!role?.packageRunId || !role.packageDraft?.documentVersion) throw new Error('Restore the exact durable package before saving an edit.');
  if (!hasJobAgentAccess() || !hasApiSession()) throw new Error('Sign in again before saving an encrypted package revision.');
  const idempotencyKey = `revision_${stableClientHash(`${role.packageRunId}|${resumeText}|${coverLetterText}`)}`;
  const response = await fetchWithTimeout('/api/application-packages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, ...apiAuthorizationHeaders() },
    body: JSON.stringify({ action: 'revise', baseRunId: role.packageRunId, resumeText, coverLetterText, runNow: true }),
  }, 55000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) throw new Error(data.error || 'The edited package could not be revalidated.');
  applyDurablePackageRun(data.run);
  return data.run;
}

async function loadSessionCapabilities() {
  const headers = apiAuthorizationHeaders();
  try {
    const response = await fetchWithTimeout('/api/session-capabilities', { headers }, REQUEST_TIMEOUTS.capability);
    const data = await response.json().catch(() => ({}));
    const cachedSubscription = loadJson('1ststep_sub_cache', {});
    if (response.ok && data.sessionAuthentication === 'opaque-session') {
      localStorage.setItem('1ststep_sub_cache', JSON.stringify({ ...cachedSubscription, jobAgentSession: true }));
    } else if ([401, 409].includes(response.status) && cachedSubscription.jobAgentSession) {
      const { jobAgentSession: _staleSession, ...remainingSubscription } = cachedSubscription;
      localStorage.setItem('1ststep_sub_cache', JSON.stringify(remainingSubscription));
    }
    sessionCapabilities = {
      adminConsole: response.ok && data.adminConsole === true,
      jobAgentAccess: response.ok && data.jobAgentAccess === true,
      tier: response.ok ? String(data.tier || 'free') : 'free',
      checked: true,
      authentication: response.ok ? String(data.sessionAuthentication || data.authentication || 'unknown') : 'none',
      expiresAt: response.ok ? data.sessionExpiresAt || null : null,
      pilotAccess: response.ok && data.pilotAccess ? data.pilotAccess : null,
      jobAgentConsent: response.ok && Object.prototype.hasOwnProperty.call(data, 'jobAgentConsent') ? data.jobAgentConsent : null,
      jobAgentConsentPolicyConfigured: response.ok && Object.prototype.hasOwnProperty.call(data, 'jobAgentConsentPolicyConfigured') ? data.jobAgentConsentPolicyConfigured === true : null,
      jobAgentConsentVersion: response.ok ? Number(data.jobAgentConsentVersion) || 0 : 0,
    };
    if (response.ok && data.sessionRenewalRecommended === true) {
      await fetchWithTimeout('/api/user-session?action=renew', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() }, body: '{}',
      }, REQUEST_TIMEOUTS.persistence).catch(() => null);
    }
  } catch {
    sessionCapabilities = { adminConsole: false, jobAgentAccess: false, tier: 'unknown', checked: true, authentication: 'none', expiresAt: null, pilotAccess: null, jobAgentConsent: null, jobAgentConsentPolicyConfigured: null, jobAgentConsentVersion: 0 };
  }
  $('openDesk').hidden = !sessionCapabilities.adminConsole;
  $('activity').hidden = !sessionCapabilities.adminConsole;
  if (sessionCapabilities.adminConsole) await hydrateOperationalMetrics();
  else operationalMetrics = null;
  renderAgentAccessState();
  renderJobAgentConsentState();
}

function initializeAccountWorkflowAuthority() {
  if (!accountWorkflowIsAuthoritative()) return;
  clearBrowserWorkflowCopies();
  for (const key of RESUME_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
  missionState = { mission: {}, messages: [], discovery: { status: 'idle' }, runState: null };
  deskState = createDeskState({});
  campaignStore = createCampaignStore({});
  dailyGoal = { target: 10, updatedAt: null };
  durableRun = null;
  jobAgentLearning = { version: 0, learning: null, facts: [], status: 'local' };
  syncedSubscriberView = { jobCards: [], needsYou: [], runState: null };
  campaignSync = { version: 0, hydrated: false, status: 'local', timer: null, inFlight: false, queued: false };
  renderAll();
}

async function hydrateOperationalMetrics() {
  try {
    const response = await fetchWithTimeout('/api/job-agent-operations?days=2', { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    operationalMetrics = response.ok && data.contentFree === true ? data : { unavailable: true };
  } catch { operationalMetrics = { unavailable: true }; }
}

function hasJobAgentAccess() { return sessionCapabilities.jobAgentAccess === true; }

function activeDurableApplicationSession() {
  return durableApplicationSessions.find(session => session.id === activeDurableApplicationSessionId) || null;
}

function upsertDurableApplicationSession(session) {
  if (!session?.id) return;
  const previous = durableApplicationSessions.find(item => item.id === session.id);
  durableApplicationSessions = [session, ...durableApplicationSessions.filter(item => item.id !== session.id)]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  if (!previous?.receipt && session.receipt && session.receipt.simulated !== true) showToast('Receipt verified');
}

async function hydrateDurableApplicationSessions() {
  if (!hasApiSession() || !hasJobAgentAccess()) return;
  durableApplicationSessionStatus = 'loading';
  try {
    const response = await fetchWithTimeout('/api/application-sessions', { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.sessions)) throw new Error(data.error || 'Saved application steps are temporarily unavailable.');
    durableApplicationSessions = data.sessions;
    finalSubmissionExecutionEnabled = data.submissionsEnabled === true;
    durableApplicationSessionStatus = 'synced';
  } catch {
    durableApplicationSessionStatus = 'unavailable';
  }
  renderAll();
}

async function hydrateJobAgentLearning() {
  if (!hasApiSession() || !hasJobAgentAccess()) {
    jobAgentLearning = { version: 0, learning: null, facts: [], status: 'local' };
    renderLearningCenter();
    return;
  }
  jobAgentLearning.status = 'loading';
  try {
    const response = await fetchWithTimeout('/api/job-agent-learning', { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.learning) throw new Error(data.error || 'Learning profile is unavailable.');
    jobAgentLearning = { version: Number(data.version) || 0, learning: data.learning, facts: Array.isArray(data.facts) ? data.facts : [], status: 'synced' };
  } catch { jobAgentLearning = { ...jobAgentLearning, status: 'unavailable' }; }
  renderLearningCenter();
}

async function learningAction(action, input = {}) {
  const response = await fetchWithTimeout('/api/job-agent-learning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `learning_${action}_${Date.now()}`, ...apiAuthorizationHeaders() },
    body: JSON.stringify({ action, input, version: jobAgentLearning.version }),
  }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.learning) throw new Error(data.error || 'The learned profile could not be updated.');
  jobAgentLearning = { version: Number(data.version) || jobAgentLearning.version + 1, learning: data.learning, facts: Array.isArray(data.facts) ? data.facts : jobAgentLearning.facts, status: 'synced' };
  renderLearningCenter();
  return data;
}

async function saveConfirmedLaunchPreferences() {
  if (jobAgentLearning.status !== 'synced') return;
  const preferences = [
    { key: 'workMode', label: 'Work setting', value: guidedSelection.workMode },
    { key: 'remoteOnly', label: 'Remote-only rule', value: guidedSelection.workMode === 'Remote' },
    { key: 'location', label: 'Eligible location', value: guidedSelection.workMode === 'Remote' ? 'United States' : guidedSelection.location },
    { key: 'employmentType', label: 'Employment type', value: guidedSelection.employmentType },
    { key: 'salaryMin', label: 'Minimum salary', value: Number(guidedSelection.salary) || 0 },
  ];
  for (const preference of preferences) {
    await learningAction('record-preference', { ...preference, originalSource: 'Guided Job Agent onboarding', confidence: 1, verificationStatus: 'user-confirmed', userConfirmed: true });
  }
}

function applyCorrectedPreferenceLocally(preference, value) {
  if (!preference) return;
  if (preference.key === 'workMode') guidedSelection.workMode = value;
  if (preference.key === 'remoteOnly' && /^(?:true|yes|remote)$/i.test(String(value))) guidedSelection.workMode = 'Remote';
  if (preference.key === 'location') guidedSelection.location = value;
  if (preference.key === 'employmentType') guidedSelection.employmentType = value;
  if (preference.key === 'salaryMin' && Number.isFinite(Number(value))) guidedSelection.salary = Number(value);
  if (missionState.mission?.role) {
    missionState.mission = { ...missionState.mission, workMode: guidedSelection.workMode, workModes: [guidedSelection.workMode], location: guidedSelection.workMode === 'Remote' ? 'United States' : guidedSelection.location, employmentTypes: [guidedSelection.employmentType], salaryMin: Number(guidedSelection.salary) || null };
    saveAll(); renderMission();
    syncJobAgentSchedule(missionState.mission, jobAgentSchedule.schedule?.status === 'active').catch(() => null);
  }
}

function maskedVerifiedFields() {
  const safeOrdinaryKeys = new Set(['startDate', 'travel', 'relocation', 'schedule', 'recruiterContact', 'accountCreation', 'privacyTerms']);
  return deskState.reusableFacts.filter(fact => safeOrdinaryKeys.has(fact.fieldKey) && fact.autoReuse === true && ['user-confirmed', 'document-verified'].includes(fact.verificationState)).slice(0, 20).map(fact => ({
    fieldKey: fact.fieldKey,
    label: fact.label || fact.fieldKey.replace(/([A-Z])/g, ' $1').trim(),
    factId: fact.id,
    maskedPreview: 'Verified answer ••••',
    confidence: 1,
    provenance: fact.source || 'candidate confirmation',
    ordinaryVerified: true,
  }));
}

async function startDurableApplication(roleId) {
  const role = deskState.roles.find(item => item.id === roleId);
  if (!role?.packageRunId || role.status !== 'Package Ready') throw new Error('The exact package must be Package Ready before an application step can start.');
  const existing = durableApplicationSessions.find(session => session.packageRunId === role.packageRunId);
  if (existing) { openDurableApplicationWorkspace(existing.id); return existing; }
  const response = await fetchWithTimeout('/api/application-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `application_${role.packageRunId}`, ...apiAuthorizationHeaders() },
    body: JSON.stringify({ packageRunId: role.packageRunId, proposedFields: maskedVerifiedFields() }),
  }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.session) throw new Error(data.error || 'The saved application step could not be started.');
  finalSubmissionExecutionEnabled = data.submissionsEnabled === true;
  upsertDurableApplicationSession(data.session);
  renderAll();
  openDurableApplicationWorkspace(data.session.id);
  return data.session;
}

async function updateDurableApplicationSession(action, confirmed, details = {}) {
  const session = activeDurableApplicationSession();
  if (!session) throw new Error('No durable application session is selected.');
  const response = await fetchWithTimeout(`/api/application-sessions?id=${encodeURIComponent(session.id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() },
    body: JSON.stringify({ sessionId: session.id, version: session.version, action, ...(typeof confirmed === 'boolean' ? { confirmed } : {}), ...details }),
  }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.session) {
    if (response.status === 400 && /changed/i.test(data.error || '')) await hydrateDurableApplicationSessions();
    throw new Error(data.error || 'The saved application step could not be updated.');
  }
  finalSubmissionExecutionEnabled = data.submissionsEnabled === true;
  upsertDurableApplicationSession(data.session);
  renderAll();
  renderApplicationWorkspace();
  return data.session;
}

function safeBrowserPreview(value) {
  const preview = String(value || '');
  return /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(preview) && preview.length < 180000 ? preview : '';
}

function safeBrowserStream(value, expectedOrigin) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password && url.origin === String(expectedOrigin || '') ? url.href : '';
  } catch { return ''; }
}

function browserStreamFrame() {
  let frame = $('browserStreamFrame');
  if (frame) return frame;
  frame = document.createElement('iframe');
  frame.id = 'browserStreamFrame';
  frame.title = 'Isolated employer application workspace';
  frame.hidden = true;
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
  $('browserPreviewImage').before(frame);
  return frame;
}

async function hydrateDurableBrowserHandoff(applicationSessionId) {
  if (!hasApiSession() || !applicationSessionId) return;
  durableBrowserHandoff = { applicationSessionId, session: null, view: null, provider: null, status: 'loading', error: '' };
  renderApplicationWorkspace();
  try {
    const response = await fetchWithTimeout(`/api/employer-browser-session?applicationSessionId=${encodeURIComponent(applicationSessionId)}`, { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 410) throw new Error(data.error || 'The secure browser handoff is temporarily unavailable.');
    durableBrowserHandoff = { applicationSessionId, session: data.session || null, view: data.view || null, provider: data.provider || null, status: data.view?.status === 'expired' ? 'expired' : 'ready', error: '' };
  } catch (error) {
    durableBrowserHandoff = { applicationSessionId, session: null, view: null, provider: null, status: 'unavailable', error: error.message };
  }
  renderApplicationWorkspace();
}

async function startDurableBrowserHandoff() {
  const session = activeDurableApplicationSession();
  if (!session) throw new Error('No saved application step is selected.');
  durableBrowserHandoff = { ...durableBrowserHandoff, applicationSessionId: session.id, status: 'starting', error: '' };
  renderApplicationWorkspace();
  const response = await fetchWithTimeout('/api/employer-browser-session', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() },
    body: JSON.stringify({ applicationSessionId: session.id }),
  }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.session || !data.view) {
    durableBrowserHandoff = { ...durableBrowserHandoff, status: 'unavailable', provider: data.provider || durableBrowserHandoff.provider, error: data.error || 'The secure browser handoff could not start.' };
    renderApplicationWorkspace();
    throw new Error(durableBrowserHandoff.error);
  }
  durableBrowserHandoff = { applicationSessionId: session.id, session: data.session, view: data.view, provider: data.provider || null, status: 'ready', error: '' };
  renderApplicationWorkspace();
}

async function closeDurableBrowserHandoff() {
  const session = activeDurableApplicationSession();
  if (!session) return;
  const response = await fetchWithTimeout(`/api/employer-browser-session?applicationSessionId=${encodeURIComponent(session.id)}`, { method: 'DELETE', headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The browser session could not be closed.');
  durableBrowserHandoff = { applicationSessionId: session.id, session: null, view: null, provider: durableBrowserHandoff.provider, status: 'ready', error: '' };
  renderApplicationWorkspace();
}

function renderAgentAccessState() {
  const active = hasJobAgentAccess();
  const pilotInviteRequired = sessionCapabilities.pilotAccess?.code === 'JOB_AGENT_PILOT_INVITE_REQUIRED';
  if ($('openAgentAccess')) $('openAgentAccess').textContent = active ? 'Job Agent active' : pilotInviteRequired ? 'Pilot invite required' : 'Sign in';
  if ($('deleteAccountData')) $('deleteAccountData').textContent = 'Delete Job Agent cloud data';
  if (!$('startJobSearch')) return;
  const missionActive = Boolean(missionState.mission?.role);
  $('startJobSearch').textContent = active
    ? (missionActive ? 'Update my job agent' : 'Start my job agent')
    : pilotInviteRequired ? 'Check pilot access' : 'Unlock my job agent';
}

async function loadPublicAppConfig() {
  try {
    const response = await fetchWithTimeout('/api/app-config', {}, REQUEST_TIMEOUTS.capability);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    publicAppConfig = {
      authentication: {
        restoreAccessAvailable: data.authentication?.restoreAccessAvailable === true,
      },
    };
  } catch {
    publicAppConfig = { authentication: { restoreAccessAvailable: null } };
  }
}

function openAgentAccess() {
  agentRestoreChallenge = '';
  $('agentAccessCode').hidden = true;
  $('agentAccessCodeLabel').hidden = true;
  $('agentAccessCode').required = false;
  $('agentAccessCode').value = '';
  const restoreUnavailable = publicAppConfig.authentication.restoreAccessAvailable === false;
  $('verifyAgentAccess').textContent = hasJobAgentAccess() ? 'Access is active' : restoreUnavailable ? 'Sign in unavailable' : 'Email me a code';
  $('verifyAgentAccess').disabled = hasJobAgentAccess() || restoreUnavailable;
  $('agentSessionActions').hidden = !hasApiSession();
  $('agentAccessEmail').disabled = hasJobAgentAccess() || restoreUnavailable;
  const pilotInviteRequired = sessionCapabilities.pilotAccess?.code === 'JOB_AGENT_PILOT_INVITE_REQUIRED';
  $('agentAccessMessage').textContent = hasJobAgentAccess()
    ? 'Your signed account has controlled-beta Job Agent access.'
    : pilotInviteRequired
      ? 'You’re signed in, but this controlled beta is currently limited to invited members. Your saved-data controls remain available.'
      : sessionCapabilities.pilotAccess?.code === 'JOB_AGENT_PILOT_NOT_CONFIGURED'
        ? 'Controlled-beta admission is temporarily unavailable. No Job Agent work can start.'
        : restoreUnavailable
          ? 'Secure sign-in is not configured for this environment. No code was sent.'
          : 'We’ll email a one-time code. Enter it here—not in chat.';
  $('agentAccessMessage').className = hasJobAgentAccess() ? 'good' : pilotInviteRequired ? 'warn' : '';
  $('agentAccessOverlay').classList.add('open');
}

function closeAgentAccess() { $('agentAccessOverlay').classList.remove('open'); }

function consentControlAvailable() { return sessionCapabilities.jobAgentConsent !== null || sessionCapabilities.jobAgentConsentPolicyConfigured !== null; }
function activeJobAgentConsent() { return sessionCapabilities.jobAgentConsent?.active === true; }

function renderJobAgentConsentState() {
  const status = $('jobAgentAuthorizationStatus');
  const revoke = $('revokeJobAgentConsent');
  if (!status || !revoke) return;
  if (!hasJobAgentAccess()) status.textContent = 'Sign in to view or change this authorization.';
  else if (!consentControlAvailable()) status.textContent = 'Authorization controls will appear when the controlled-beta policy is enabled.';
  else if (activeJobAgentConsent()) status.textContent = 'Active. Consequential employer actions still require separate confirmation.';
  else if (sessionCapabilities.jobAgentConsentPolicyConfigured === false) status.textContent = 'Controlled-beta policy review is not complete; the agent cannot start.';
  else status.textContent = 'Not active. The agent will ask before starting.';
  revoke.disabled = !hasJobAgentAccess() || !activeJobAgentConsent();
}

function closeJobAgentConsent({ discardContinuation = true } = {}) {
  $('jobAgentConsentOverlay').classList.remove('open');
  if (discardContinuation) pendingConsentContinuation = null;
  lastDialogTrigger?.focus?.();
}

function renderJobAgentPolicyBundle(bundle = sessionCapabilities.jobAgentConsent?.policyBundle) {
  const disclosure = bundle?.schemaVersion === 1 ? bundle.disclosure : null;
  const expected = ['age18OrOlder', 'termsAccepted', 'privacyAcknowledged', 'candidateAuthorizationAccepted'];
  const attestations = Array.isArray(disclosure?.attestations) ? disclosure.attestations : [];
  const valid = typeof disclosure?.heading === 'string' && typeof disclosure?.introduction === 'string'
    && typeof disclosure?.scopeHeading === 'string' && Array.isArray(disclosure?.scope) && disclosure.scope.length === 2
    && expected.every((id, index) => attestations[index]?.id === id && typeof attestations[index]?.statement === 'string');
  if (!valid) return false;
  $('jobAgentConsentTitle').textContent = disclosure.heading;
  $('jobAgentConsentIntroduction').textContent = disclosure.introduction;
  $('jobAgentConsentScopeHeading').textContent = disclosure.scopeHeading;
  $('jobAgentConsentScope').replaceChildren(...disclosure.scope.map(item => {
    const paragraph = document.createElement('p'); paragraph.textContent = item; return paragraph;
  }));
  for (const item of attestations) {
    const span = $(`jobAgentConsentChecks`)?.querySelector(`input[name="${item.id}"]`)?.nextElementSibling;
    if (!span) return false;
    span.replaceChildren();
    const link = item.link;
    if (link && ['/terms', '/privacy'].includes(link.href) && item.statement.includes(link.label)) {
      const [before, ...after] = item.statement.split(link.label);
      span.append(document.createTextNode(before));
      const anchor = document.createElement('a'); anchor.href = link.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = link.label;
      span.append(anchor, document.createTextNode(after.join(link.label)));
    } else span.textContent = item.statement;
  }
  if (typeof disclosure.safetyNotice === 'string') $('jobAgentConsentMessage').textContent = disclosure.safetyNotice;
  return true;
}

function openJobAgentConsent(message = '') {
  lastDialogTrigger = document.activeElement;
  $('jobAgentConsentForm').reset();
  const policyBundleReady = renderJobAgentPolicyBundle();
  $('jobAgentConsentMessage').textContent = message || sessionCapabilities.jobAgentConsent?.policyBundle?.disclosure?.safetyNotice || 'The exact policy text could not be loaded. The Job Agent will stay paused.';
  $('jobAgentConsentMessage').className = `consent-message${message || !policyBundleReady ? ' warn' : ''}`;
  $('grantJobAgentConsent').disabled = sessionCapabilities.jobAgentConsentPolicyConfigured === false || !policyBundleReady;
  $('jobAgentConsentOverlay').classList.add('open');
  setTimeout(() => $('jobAgentConsentChecks').querySelector('input')?.focus(), 0);
}

async function refreshJobAgentConsent() {
  const response = await fetchWithTimeout('/api/job-agent-consent', { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Job Agent authorization could not be checked.');
  sessionCapabilities.jobAgentConsent = data.consent || null;
  sessionCapabilities.jobAgentConsentPolicyConfigured = data.policyConfigured === true;
  sessionCapabilities.jobAgentConsentVersion = Number(data.version) || 0;
  renderJobAgentConsentState();
  return data;
}

async function hydrateJobAgentSchedule() {
  if (!hasApiSession() || !hasJobAgentAccess()) { jobAgentSchedule = { version: 0, schedule: null, enabled: null, status: 'local' }; return; }
  try {
    const response = await fetchWithTimeout('/api/job-agent-schedule', { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Daily search status is unavailable.');
    jobAgentSchedule = { version: Number(data.version) || 0, schedule: data.schedule || null, enabled: data.schedulingEnabled === true, status: 'synced' };
    if ($('dailyBackgroundSearch') && data.schedule) $('dailyBackgroundSearch').checked = data.schedule.status === 'active';
  } catch { jobAgentSchedule = { ...jobAgentSchedule, enabled: null, status: 'unavailable' }; }
  renderVaultStatus();
  renderAgentConfiguration();
}

function renderNeedsYouNotificationPreference() {
  const enabled = jobAgentNotifications.preference?.enabled === true;
  for (const id of ['emailNeedsYouAlerts', 'savedNeedsYouEmailAlerts']) if ($(id)) $(id).checked = enabled;
  if ($('savedNeedsYouEmailAlerts')) $('savedNeedsYouEmailAlerts').disabled = !(hasApiSession() && hasJobAgentAccess() && jobAgentNotifications.available === true);
  if (!$('needsYouNotificationStatus')) return;
  $('needsYouNotificationStatus').textContent = jobAgentNotifications.status === 'unavailable'
    ? 'Email alerts are temporarily unavailable. Your in-app Needs You queue still works.'
    : jobAgentNotifications.available === false
      ? 'Email alerts are not enabled for this beta. Your in-app Needs You queue still works.'
      : enabled
        ? 'On · generic email only · provider acceptance is not treated as delivery or application progress.'
        : hasApiSession() && hasJobAgentAccess() ? 'Off · optional. Emails never include job or personal details.' : 'Sign in with Job Agent access to enable generic email alerts.';
}

async function hydrateNeedsYouNotifications() {
  if (!hasApiSession() || !hasJobAgentAccess()) {
    jobAgentNotifications = { version: 0, preference: null, available: null, status: 'local' };
    renderNeedsYouNotificationPreference(); return;
  }
  try {
    const response = await fetchWithTimeout('/api/job-agent-notifications', { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Email alert status is unavailable.');
    jobAgentNotifications = { version: Number(data.version) || 0, preference: data.preference || null, available: data.deliveryAvailable === true, status: 'synced' };
  } catch { jobAgentNotifications = { ...jobAgentNotifications, available: null, status: 'unavailable' }; }
  renderNeedsYouNotificationPreference(); renderAgentConfiguration();
}

async function syncNeedsYouNotifications(enabled) {
  if (!hasApiSession() || !hasJobAgentAccess()) throw new Error('Sign in with Job Agent access before enabling email alerts.');
  const response = await fetchWithTimeout('/api/job-agent-notifications', {
    method: enabled ? 'PUT' : 'DELETE',
    headers: enabled ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...apiAuthorizationHeaders() } : apiAuthorizationHeaders(),
    body: enabled ? JSON.stringify({ enabled: true, version: Number(jobAgentNotifications.version) || 0 }) : undefined,
  }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Email alert preference could not be updated.');
  jobAgentNotifications = { version: Number(data.version) || 0, preference: data.preference || null, available: data.deliveryAvailable === true, status: 'synced' };
  renderNeedsYouNotificationPreference(); renderAgentConfiguration();
  return jobAgentNotifications;
}

async function syncJobAgentSchedule(mission, active = $('dailyBackgroundSearch')?.checked === true) {
  if (!active) {
    const response = await fetchWithTimeout('/api/job-agent-schedule', { method: 'DELETE', headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Daily search could not be paused.');
    jobAgentSchedule = { version: 0, schedule: null, enabled: jobAgentSchedule.enabled, status: 'synced' };
    renderVaultStatus(); renderAgentConfiguration();
    return jobAgentSchedule;
  }
  const currentResponse = await fetchWithTimeout('/api/job-agent-schedule', { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
  const current = await currentResponse.json().catch(() => ({}));
  if (!currentResponse.ok) throw new Error(current.error || 'Daily search status could not be checked.');
  const response = await fetchWithTimeout('/api/job-agent-schedule', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...apiAuthorizationHeaders() },
    body: JSON.stringify({ version: Number(current.version) || 0, status: 'active', mission }),
  }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Daily background search could not be enabled.');
  jobAgentSchedule = { version: Number(data.version) || 0, schedule: data.schedule || null, enabled: true, status: 'synced' };
  renderVaultStatus(); renderAgentConfiguration();
  return jobAgentSchedule;
}

async function ensureJobAgentConsent(continuation) {
  if (!consentControlAvailable()) return true; // Backward-compatible only for servers that do not expose the new control yet.
  pendingConsentContinuation = continuation;
  try {
    await refreshJobAgentConsent();
  } catch (error) {
    openJobAgentConsent(error.message);
    $('grantJobAgentConsent').disabled = true;
    return false;
  }
  if (activeJobAgentConsent()) { pendingConsentContinuation = null; return true; }
  openJobAgentConsent(sessionCapabilities.jobAgentConsentPolicyConfigured === false
    ? 'Controlled-beta policy review is not complete. The Job Agent will stay paused until approved policy versions are configured.'
    : sessionCapabilities.jobAgentConsent?.code === 'JOB_AGENT_CONSENT_RENEWAL_REQUIRED'
      ? 'The Job Agent terms changed. Review and accept the current versions before work resumes.' : '');
  return false;
}

async function submitJobAgentConsent(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const button = $('grantJobAgentConsent');
  const message = $('jobAgentConsentMessage');
  button.disabled = true;
  message.className = 'consent-message';
  message.textContent = 'Saving your encrypted authorization…';
  try {
    const form = new FormData(event.currentTarget);
    const response = await fetchWithTimeout('/api/job-agent-consent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...apiAuthorizationHeaders() },
      body: JSON.stringify({ action: 'grant', version: sessionCapabilities.jobAgentConsentVersion, attestations: {
        age18OrOlder: form.get('age18OrOlder') === 'on', termsAccepted: form.get('termsAccepted') === 'on',
        privacyAcknowledged: form.get('privacyAcknowledged') === 'on', candidateAuthorizationAccepted: form.get('candidateAuthorizationAccepted') === 'on',
      } }),
    }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (response.status === 409) { await refreshJobAgentConsent(); throw new Error('Authorization changed in another session. Review the current state and try again.'); }
    if (!response.ok || data.consent?.active !== true) throw new Error(data.error || 'Job Agent authorization could not be saved.');
    sessionCapabilities.jobAgentConsent = data.consent;
    sessionCapabilities.jobAgentConsentVersion = Number(data.version) || sessionCapabilities.jobAgentConsentVersion;
    sessionCapabilities.jobAgentConsentPolicyConfigured = true;
    const continuation = pendingConsentContinuation;
    pendingConsentContinuation = null;
    closeJobAgentConsent({ discardContinuation: false });
    renderJobAgentConsentState();
    showToast('Job Agent authorized');
    if (typeof continuation === 'function') await continuation();
  } catch (error) {
    message.textContent = error.message;
    message.className = 'consent-message warn';
  } finally { button.disabled = sessionCapabilities.jobAgentConsentPolicyConfigured === false || !renderJobAgentPolicyBundle(); }
}

async function revokeJobAgentAuthorization() {
  if (!activeJobAgentConsent() || !window.confirm('Pause current Job Agent work and revoke its authorization? Saved work stays available, but no agent run can resume until you authorize it again.')) return;
  const response = await fetchWithTimeout('/api/job-agent-consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), ...apiAuthorizationHeaders() },
    body: JSON.stringify({ action: 'revoke', version: sessionCapabilities.jobAgentConsentVersion, reason: 'user-request' }),
  }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Job Agent authorization could not be revoked.');
  sessionCapabilities.jobAgentConsent = data.consent || null;
  sessionCapabilities.jobAgentConsentVersion = Number(data.version) || sessionCapabilities.jobAgentConsentVersion;
  if (jobAgentSchedule.schedule) jobAgentSchedule.schedule = { ...jobAgentSchedule.schedule, status: 'paused' };
  if ($('dailyBackgroundSearch')) $('dailyBackgroundSearch').checked = false;
  missionState.runState = 'Paused';
  if (durableRun && !['Finished', 'Failed'].includes(durableRun.status)) durableRun.status = 'Paused';
  saveAll(); renderAll(); renderJobAgentConsentState();
  showToast(data.authorizationShutdownReconciliationRequired
    ? 'Authorization revoked. Secure cleanup is finishing; no new work can start.'
    : 'Agent paused and authorization revoked');
}

async function signOutAgent(allDevices = false) {
  if (allDevices && !window.confirm('Sign out every Job Agent device? Saved encrypted work remains available after you verify access again.')) return;
  const response = await fetchWithTimeout(`/api/user-session?scope=${allDevices ? 'all' : 'current'}`, {
    method: 'DELETE', headers: apiAuthorizationHeaders(),
  }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not sign out safely.');
  clearSignedAccessState();
}

function clearSignedAccessState() {
  const cache = loadJson('1ststep_sub_cache', {});
  localStorage.setItem('1ststep_sub_cache', JSON.stringify({ email: cache.email || '', tier: 'free', ts: Date.now(), status: 'signed_out' }));
  sessionCapabilities = { adminConsole: false, jobAgentAccess: false, tier: 'free', checked: true, authentication: 'none', expiresAt: null, pilotAccess: null, jobAgentConsent: null, jobAgentConsentPolicyConfigured: null, jobAgentConsentVersion: 0 };
  applicantVault = { version: 0, vault: null, status: 'local', inFlight: false };
  jobAgentSchedule = { version: 0, schedule: null, enabled: null, status: 'local' };
  durableApplicationSessions = [];
  durableRun = null;
  syncedSubscriberView = { jobCards: [], needsYou: [], runState: null };
  campaignStore = createCampaignStore({});
  missionState = { mission: {}, messages: [], discovery: { status: 'idle' }, runState: null };
  deskState = createDeskState({});
  dailyGoal = { target: 10, updatedAt: null };
  clearBrowserWorkflowCopies();
  for (const key of RESUME_KEYS) { localStorage.removeItem(key); sessionStorage.removeItem(key); }
  finalSubmissionExecutionEnabled = false;
  $('openDesk').hidden = true;
  $('activity').hidden = true;
  closeAgentAccess();
  renderAgentAccessState();
  renderVaultStatus();
}

async function downloadAccountData() {
  const button = $('downloadAccountData');
  const message = $('agentAccessMessage');
  button.disabled = true;
  button.textContent = 'Preparing export…';
  message.textContent = 'Preparing a complete encrypted snapshot. You can safely retry if this takes too long.';
  message.className = '';
  const requested = await fetchWithTimeout('/api/account-data', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() }, body: '{}',
  }, REQUEST_TIMEOUTS.persistence);
  const requestData = await requested.json().catch(() => ({}));
  if (!requested.ok || !requestData.task?.id) throw new Error(requestData.error || 'Your cloud-data export could not be queued.');
  const taskId = requestData.task.id;
  let task = requestData.task;
  for (let attempt = 0; attempt < 45 && task.status !== 'ready'; attempt += 1) {
    if (task.status === 'failed') throw new Error('A complete export could not be prepared automatically. Retry once; if it still fails, contact support for an assisted complete export.');
    await new Promise(resolve => setTimeout(resolve, 2_000));
    const statusResponse = await fetchWithTimeout(`/api/account-data?taskId=${encodeURIComponent(taskId)}`, { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const statusData = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) throw new Error(statusData.error || 'Export status could not be checked.');
    task = statusData.task;
  }
  if (task.status !== 'ready') throw new Error('Your export is still running safely in the background. Click Download my cloud data again in a minute to resume checking it.');
  button.textContent = 'Downloading…';
  const response = await fetchWithTimeout(`/api/account-data?taskId=${encodeURIComponent(taskId)}&download=1`, { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Your completed cloud-data export could not be downloaded.');
  }
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `1ststep-account-data-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  message.textContent = 'Complete cloud-data export downloaded.';
  message.className = 'success';
  button.disabled = false;
  button.textContent = 'Download my cloud data';
}

async function deleteAccountData() {
  const phrase = window.prompt('This permanently deletes your encrypted Job Agent cloud vault, saved searches, agent runs, packages, application checkpoints, and operational audit entries. Device-only browser data remains on this device. Billing, subscription, fraud-prevention, legally required transaction records, and any content-free retention-locked audit heads follow their separately disclosed retention or legal-hold process.\n\nType DELETE MY JOB AGENT CLOUD DATA to continue.');
  if (phrase === null) return;
  const response = await fetchWithTimeout('/api/account-data', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() }, body: JSON.stringify({ confirmation: phrase }),
  }, REQUEST_TIMEOUTS.persistence);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.code === 'BROWSER_HANDOFF_CLOSE_RETRY_REQUIRED') {
      const closed = Math.max(0, Number(data.closedEmployerBrowserSessionsThisAttempt) || 0);
      const remaining = Math.max(1, Number(data.employerBrowserSessionsRequiringRetry) || 1);
      throw new Error(`Browser cleanup is still in progress. ${closed} session${closed === 1 ? '' : 's'} closed safely; ${remaining} still need${remaining === 1 ? 's' : ''} provider confirmation. No other cloud data was deleted. Try Delete Job Agent cloud data again after the provider recovers.`);
    }
    throw new Error(data.error || 'Your cloud data could not be deleted.');
  }
  clearSignedAccessState();
  window.alert('Your Job Agent operational cloud data was deleted and all Job Agent devices were signed out. Device-only browser data remains on this device. Separately disclosed billing, fraud-prevention, transaction, and retention-locked audit records follow their legal retention process.');
}

async function submitAgentAccess(event) {
  event.preventDefault();
  if (hasJobAgentAccess()) return;
  if (publicAppConfig.authentication.restoreAccessAvailable === false) {
    $('agentAccessMessage').textContent = 'Secure sign-in is not configured for this environment. No code was sent.';
    $('agentAccessMessage').className = 'warn';
    return;
  }
  const email = $('agentAccessEmail').value.trim().toLowerCase();
  const code = $('agentAccessCode').value.trim();
  const message = $('agentAccessMessage');
  const button = $('verifyAgentAccess');
  button.disabled = true;
  message.className = '';
  try {
    if (!agentRestoreChallenge) {
      const response = await fetchWithTimeout(`/api/subscription?action=restore-code&email=${encodeURIComponent(email)}`, {}, REQUEST_TIMEOUTS.persistence);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.restoreChallenge) throw new Error(data.error || 'Could not send the verification code.');
      agentRestoreChallenge = data.restoreChallenge;
      $('agentAccessCode').hidden = false;
      $('agentAccessCodeLabel').hidden = false;
      $('agentAccessCode').required = true;
      $('agentAccessCode').focus();
      message.textContent = 'Code sent. Enter the latest six-digit code from your email.';
      message.className = 'good';
      button.textContent = 'Verify existing access';
      return;
    }
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the six-digit verification code.');
    const response = await fetchWithTimeout(`/api/subscription?client=job-agent&email=${encodeURIComponent(email)}`, {
      headers: { 'X-Subscription-Restore-Code': code, 'X-Subscription-Restore-Challenge': agentRestoreChallenge },
    }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Access verification failed.');
    const tier = String(data.tier || 'free');
    localStorage.setItem('1ststep_sub_cache', JSON.stringify({
      email, tier, ts: Date.now(), jobAgentSession: true, expiresInDays: data.expiresInDays ?? null, status: data.status || '',
    }));
    if (tier === 'free') {
      sessionCapabilities = { adminConsole: false, jobAgentAccess: false, tier: 'free', checked: true };
      message.textContent = 'No current controlled-beta access was found. Your free job-path preview remains available; no charge was created.';
      message.className = 'warn';
      button.textContent = 'Check another email';
      agentRestoreChallenge = '';
      $('agentAccessCode').hidden = true;
      $('agentAccessCodeLabel').hidden = true;
      $('agentAccessCode').required = false;
      return;
    }
    await loadSessionCapabilities();
    await hydrateAccountWorkflow();
    if (!hasJobAgentAccess()) throw new Error('The subscription was restored, but Job Agent access could not be verified.');
    message.textContent = 'Job Agent access restored.';
    message.className = 'good';
    setTimeout(closeAgentAccess, 500);
  } catch (error) {
    message.textContent = error.message || 'Access verification is unavailable right now.';
    message.className = 'warn';
  } finally {
    button.disabled = hasJobAgentAccess();
  }
}
function hasResume() {
  if (LOCAL_SUBSCRIBER_UI_FIXTURE) return true;
  return Boolean(savedResumeText());
}

function selectedOpportunityPath() {
  return OPPORTUNITY_PATHS.find(path => path.id === guidedSelection.pathId) || null;
}

function saveGuidedLaunchDraft() {
  missionState.onboardingDraft = {
    goal: guidedSelection.goal || '',
    pathId: guidedSelection.pathId || '',
    workMode: guidedSelection.workMode,
    employmentType: guidedSelection.employmentType,
    salary: Number(guidedSelection.salary) || 0,
    location: guidedSelection.location || '',
    step: guidedLaunchStep,
    updatedAt: new Date().toISOString(),
  };
  saveAll();
}

function guidedStageIsReady(stage = GUIDED_LAUNCH_STAGES[guidedLaunchStep]) {
  if (stage === 'goal') return Boolean(guidedSelection.goal);
  if (stage === 'resume') return hasResume();
  if (stage === 'path') return Boolean(guidedSelection.pathId);
  if (stage === 'work') return guidedSelection.workMode === 'Remote' || Boolean($('launchLocation')?.value.trim() || guidedSelection.location);
  return true;
}

function renderGuidedLaunch() {
  const overlay = $('guidedLaunchOverlay');
  if (!overlay) return;
  overlay.classList.toggle('open', guidedLaunchOpen);
  document.body.classList.toggle('guided-launch-open', guidedLaunchOpen);
  const stage = GUIDED_LAUNCH_STAGES[guidedLaunchStep];
  document.querySelectorAll('[data-guided-stage]').forEach(node => {
    const active = node.dataset.guidedStage === stage;
    node.classList.toggle('active', active);
    node.hidden = !active;
  });
  $('guidedLaunchProgress').value = guidedLaunchStep + 1;
  $('guidedLaunchProgressText').textContent = `${guidedLaunchStep + 1} of ${GUIDED_LAUNCH_STAGES.length}`;
  $('guidedLaunchBack').disabled = guidedLaunchStep === 0;
  $('guidedLaunchNext').hidden = stage === 'review';
  $('guidedLaunchNext').disabled = !guidedStageIsReady(stage);
  const goalButtons = [...document.querySelectorAll('[data-guided-goal]')];
  goalButtons.forEach((button, index) => {
    const selected = button.dataset.guidedGoal === guidedSelection.goal;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected || (!guidedSelection.goal && index === 0) ? 0 : -1;
  });
  if (stage === 'review') {
    const path = selectedOpportunityPath();
    const goalLabels = { 'best-fit': 'Best long-term fit', fast: 'Land a job sooner', explore: 'Explore better opportunities' };
    const salary = guidedSelection.salary ? `$${Math.round(guidedSelection.salary / 1000)}K+` : 'Any salary';
    const location = guidedSelection.workMode === 'Remote' ? 'United States remote' : ($('launchLocation').value.trim() || guidedSelection.location || 'Location needed');
    $('guidedLaunchReview').innerHTML = [
      ['Goal', goalLabels[guidedSelection.goal] || 'Not selected'],
      ['Job path', path?.label || 'Not selected'],
      ['Work', `${guidedSelection.workMode} · ${location}`],
      ['Job type', guidedSelection.employmentType],
      ['Minimum salary', salary],
    ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }
}

function openGuidedLaunch(options = {}) {
  if (Number.isInteger(options.step)) guidedLaunchStep = Math.min(6, Math.max(0, options.step));
  guidedLaunchOpen = true;
  renderMission();
  setTimeout(() => document.querySelector('[data-guided-stage].active button:not([disabled]), [data-guided-stage].active input')?.focus(), 0);
}

function closeGuidedLaunch() {
  guidedLaunchOpen = false;
  saveGuidedLaunchDraft();
  renderGuidedLaunch();
  $('openGuidedLaunch')?.focus();
}

function advanceGuidedLaunch() {
  const stage = GUIDED_LAUNCH_STAGES[guidedLaunchStep];
  if (!guidedStageIsReady(stage)) {
    if (stage === 'resume') openResumeSetup();
    if (stage === 'work' && guidedSelection.workMode !== 'Remote') $('launchLocation').focus();
    return;
  }
  guidedLaunchStep = Math.min(GUIDED_LAUNCH_STAGES.length - 1, guidedLaunchStep + 1);
  saveGuidedLaunchDraft();
  renderMission();
}

function opportunityPathOptions() {
  const live = missionState.pathScan?.recommendations;
  const starters = suggestedOpportunityPaths(deskState.truthProfile, savedResumeText(), OPPORTUNITY_PATHS.length);
  if (Array.isArray(live) && live.length) {
    const outcomes = mergeAuthoritativeOutcomeEvidence(deskState.acquisitionOutcomes, durableApplicationSessions);
    const livePaths = live.map(path => {
      const canonical = OPPORTUNITY_PATHS.find(item => item.id === path.id) || {};
      return { ...canonical, ...path, ...opportunityPathOutcomeEvidence({ ...canonical, ...path }, outcomes) };
    });
    const liveIds = new Set(livePaths.map(path => path.id));
    return [...livePaths, ...starters.filter(path => !liveIds.has(path.id))];
  }
  return starters;
}

function renderOpportunityPaths() {
  const allOptions = opportunityPathOptions();
  const options = opportunitySector === 'recommended'
    ? allOptions.slice(0, 6)
    : opportunitySector === 'all' ? allOptions : allOptions.filter(path => path.sector === opportunitySector);
  $('jobSectorFilter').innerHTML = [
    '<option value="recommended">Recommended for me</option>',
    '<option value="all">All job paths</option>',
    ...OPPORTUNITY_SECTORS.map(sector => `<option value="${escapeHtml(sector.id)}">${escapeHtml(sector.label)}</option>`),
  ].join('');
  $('jobSectorFilter').value = opportunitySector;
  if (!guidedSelection.pathId && hasResume() && options[0]?.profileSignal > 0) guidedSelection.pathId = options[0].id;
  $('opportunityPaths').innerHTML = options.map((path, index) => {
    const selected = path.id === guidedSelection.pathId;
    const live = Number.isFinite(path.openings);
    const analyzed = Number.isFinite(path.verifiedOpeningsAnalyzed) ? path.verifiedOpeningsAnalyzed : path.openings;
    const supply = live ? `${path.openings} current opening${path.openings === 1 ? '' : 's'} · ${path.qualifiedOpenings} of ${analyzed} verified role${analyzed === 1 ? '' : 's'} above fit floor` : 'Select to search this role family';
    const outcome = path.outcomeConfidence === 'reliable'
      ? `Your observed rate: ${path.interviewRate}% reached recruiter screen · ${path.sampleSize} receipt-verified applications`
      : path.outcomeConfidence === 'directional'
        ? `Directional only: ${path.interviewRate}% reached recruiter screen · ${path.sampleSize} receipt-verified applications`
      : path.outcomeConfidence === 'early'
        ? `Too early for a rate: ${path.screens} screens from ${path.sampleSize} receipt-verified applications`
        : 'Observed interview rate: learning from your tracker';
    return `<button class="opportunity-path${selected ? ' selected' : ''}" type="button" role="radio" aria-checked="${selected}" data-opportunity-path="${escapeHtml(path.id)}"><i aria-hidden="true"></i><strong>${escapeHtml(path.label)}</strong><small>${escapeHtml(supply)}${live && path.averageFit ? ` · ${path.averageFit}/100 average fit` : ''}</small><small>${escapeHtml(outcome)}</small>${live && index === 0 ? '<em class="path-best">Best current evidence</em>' : ''}</button>`;
  }).join('');
  const scan = missionState.pathScan;
  $('pathEvidence').textContent = scan?.status === 'complete'
    ? `Compared ${scan.jobsScanned} current postings across ${scan.sourcesChecked} connected direct-employer feeds and ${OPPORTUNITY_PATHS.length} job paths. Your observed rate appears after 5 receipt-verified applications and is not labeled reliable before 20.`
    : scan?.status === 'error'
      ? `Live comparison needs attention: ${scan.message}. Starter paths remain available.`
      : 'Starter paths come from your confirmed experience. Live opening counts appear only after a direct-employer feed scan.';
  const locationReady = guidedSelection.workMode === 'Remote' || Boolean($('launchLocation').value.trim() || guidedSelection.location);
  $('startJobSearch').disabled = !guidedSelection.pathId || !hasResume() || !locationReady;
  $('locationPreference').hidden = guidedSelection.workMode === 'Remote';
  if (!$('launchLocation').value && guidedSelection.location) $('launchLocation').value = guidedSelection.location;
}

async function scanOpportunityPaths() {
  if (!hasResume()) {
    openResumeSetup();
    setResumeMessage('Add or build your resume before comparing paths.', 'warn');
    return;
  }
  const button = $('scanOpportunityPaths');
  button.disabled = true;
  button.textContent = 'Comparing…';
  missionState.pathScan = { status: 'searching', checkedAt: new Date().toISOString() };
  saveAll(); renderOpportunityPaths();
  try {
    const response = await fetchWithTimeout('/api/concierge-discovery', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() },
      body: JSON.stringify({
        mission: {
          roleFamilies: OPPORTUNITY_PATHS.flatMap(path => path.terms),
          workModes: [guidedSelection.workMode], employmentTypes: [guidedSelection.employmentType],
          salaryMin: guidedSelection.salary || null, location: guidedSelection.workMode === 'Remote' ? 'United States' : '',
        },
        limit: 100,
      }),
    }, REQUEST_TIMEOUTS.discovery);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Live path comparison is unavailable');
    const ranked = rankOpportunityPaths({ jobs: data.jobs || [], supplyByPath: data.supplyByPath || {}, outcomes: mergeAuthoritativeOutcomeEvidence(deskState.acquisitionOutcomes, durableApplicationSessions), profile: deskState.truthProfile, resumeText: savedResumeText() });
    missionState.pathScan = {
      status: 'complete', checkedAt: new Date().toISOString(), jobsScanned: Number(data.filterSummary?.scanned) || (data.jobs || []).length,
      sourcesChecked: (data.sourceSummary || []).filter(source => ['ok', 'partial'].includes(source.status)).length,
      recommendations: ranked.map(path => ({
        id: path.id, label: path.label, searchRole: path.searchRole, rankScore: path.rankScore,
        openings: path.openings, verifiedOpeningsAnalyzed: path.verifiedOpeningsAnalyzed, qualifiedOpenings: path.qualifiedOpenings, averageFit: path.averageFit, topFit: path.topFit,
        sampleSize: path.sampleSize, screens: path.screens, offers: path.offers,
        interviewRate: path.interviewRate, offerRate: path.offerRate, outcomeConfidence: path.outcomeConfidence,
      })),
    };
    if (ranked[0]) guidedSelection.pathId = ranked[0].id;
  } catch (error) {
    missionState.pathScan = { status: 'error', checkedAt: new Date().toISOString(), message: error.message || 'Unknown error' };
  } finally {
    button.disabled = false;
    button.textContent = 'Compare live paths';
    saveAll(); renderOpportunityPaths();
  }
}
function savedResumeText() {
  for (const key of RESUME_KEYS) {
    let raw = sessionStorage.getItem(key);
    if (!raw) {
      raw = localStorage.getItem(key);
      if (raw) {
        sessionStorage.setItem(key, raw);
        localStorage.removeItem(key);
      }
    }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const text = typeof parsed === 'string' ? parsed : parsed?.text;
      if (String(text || '').trim()) return String(text).trim();
    } catch { if (raw.trim()) return raw.trim(); }
  }
  return '';
}
function sanitizeResumeText(text) {
  let clean = String(text || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
  const patterns = [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context)/gi,
    /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?)/gi,
    /you\s+are\s+now\s+(a\s+)?(different|new|another|an?\s+)?(?:AI|assistant|model|bot|GPT)/gi,
    /system\s*prompt\s*[:i14]/gi,
    /\[\s*system\s*\]/gi,
    /<\s*system\s*>/gi,
  ];
  patterns.forEach(pattern => { clean = clean.replace(pattern, '[REDACTED]'); });
  return clean.trim();
}
function saveResumeText(text, source, fileName = '') {
  const clean = sanitizeResumeText(text);
  if (clean.length < 100) throw new Error('Add at least 100 characters so there is enough resume content to use.');
  const value = JSON.stringify({ source, text: clean, fileName, savedAt: new Date().toISOString() });
  sessionStorage.setItem('1ststep_resume', value);
  localStorage.removeItem('1ststep_resume');
  try { window.postMessage({ source: 'app', action: 'SYNC_PROFILE' }, '*'); } catch { /* extension not installed */ }
  return clean;
}
async function extractResumeFile(file) {
  if (!file) throw new Error('Choose a resume file first.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a resume file under 5 MB.');
  const name = file.name.toLowerCase();
  if (!['.pdf', '.docx', '.txt'].some(extension => name.endsWith(extension))) throw new Error('Use a PDF, DOCX, or TXT resume.');
  if (name.endsWith('.pdf')) {
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (String.fromCharCode(...header) !== '%PDF') throw new Error('This file does not appear to be a valid PDF.');
    if (!window.pdfjsLib) throw new Error('The PDF reader is still loading. Try again in a moment.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      pages.push(collapseLetterSpacing(pdfItemsToText(content.items)));
    }
    return sanitizeResumeText(pages.join('\n\n'));
  }
  if (name.endsWith('.docx')) {
    if (!window.mammoth) throw new Error('The Word reader is still loading. Try again in a moment.');
    return sanitizeResumeText((await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value);
  }
  return sanitizeResumeText(await file.text());
}
function setResumeMessage(message, kind = '') {
  $('resumeMeta').textContent = message;
  $('resumeMeta').className = `resume-meta ${kind}`.trim();
}
function openResumeSetup() {
  $('resumeEditor').value = savedResumeText();
  setResumeMessage(hasResume() ? 'Saved resume loaded. Review it or replace it.' : 'Nothing is saved until you review and choose Save resume.', hasResume() ? 'good' : '');
  $('resumeOverlay').classList.add('open');
}
function closeResumeSetup() { $('resumeOverlay').classList.remove('open'); }
function money(value) { return value ? `$${Math.round(value / 1000)}k+` : 'Not set'; }
function compensationRange(minimum, maximum) {
  const min = Number(minimum) || 0;
  const max = Number(maximum) || 0;
  if (min && max) return `$${Math.round(min / 1000)}k–$${Math.round(max / 1000)}k`;
  if (min) return `$${Math.round(min / 1000)}k+`;
  if (max) return `Up to $${Math.round(max / 1000)}k`;
  return 'Compensation not provided';
}
function empty(text) { return `<div class="desk-empty">${escapeHtml(text)}</div>`; }
function showDeskMessage(message = '', error = false) {
  const box = $('deskError');
  box.textContent = message;
  box.classList.toggle('show', Boolean(message));
  box.classList.toggle('failure', Boolean(message) && error);
  box.classList.toggle('success', Boolean(message) && !error);
}
function safeAction(action) {
  try { showDeskMessage(); action(); saveAll(); renderAll(); return true; }
  catch (error) { showDeskMessage(error.message, true); return false; }
}

function addMessage(role, html, persist = true) {
  const node = document.createElement('div');
  node.className = `bubble ${role}`;
  node.innerHTML = html;
  $('messages').appendChild(node);
  $('messages').scrollTop = $('messages').scrollHeight;
  if (persist) {
    missionState.messages.push({ role, html });
    missionState.messages = missionState.messages.slice(-30);
    saveAll();
  }
  return node;
}

function apiAuthorizationHeaders() {
  return { 'X-1stStep-Client': 'job-agent' };
}

function hasApiSession() {
  const subscription = loadJson('1ststep_sub_cache', {});
  return Boolean(subscription.jobAgentSession || sessionCapabilities.authentication === 'opaque-session');
}

async function callAI(callType, quality, content, maxTokens) {
  const response = await fetchWithTimeout('/api/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() },
    body: JSON.stringify({ callType, quality, maxTokens, content }),
  }, quality === 'quality' ? REQUEST_TIMEOUTS.aiQuality : REQUEST_TIMEOUTS.aiFast);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The AI assistant is unavailable right now.');
  const text = String(data.text || '').trim();
  if (!text) throw new Error('The AI assistant returned an empty response.');
  return text;
}

function redactChatForModel(input) {
  return String(input || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]')
    .replace(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g, '[phone redacted]')
    .replace(/\b(?:otp|code|password|passcode)\s*[:=-]\s*\S+/gi, '[secret redacted]');
}

function currentGuidance() {
  const readiness = readinessStatus(deskState);
  return conciergeStateGuidance({
    mission: missionState.mission, counts: pipelineCounts(deskState), unresolved: readiness.unresolved,
    openActions: deskState.actionQueue.filter(item => item.status === 'open').length, hasResume: hasResume(),
  });
}

function guidanceHtml(guidance, lead = '') {
  const actions = guidance.actions.map(action => `<button data-prompt="${escapeHtml(action.prompt)}">${escapeHtml(action.label)}</button>`).join('');
  return `${lead ? `${escapeHtml(lead)}<br>` : ''}<strong>${escapeHtml(guidance.headline)}</strong><br>${escapeHtml(guidance.detail)}<div class="quick">${actions}</div>`;
}

async function askSmartConcierge(input) {
  const guidance = currentGuidance();
  if (localStorage.getItem(AI_CONSENT_KEY) !== 'approved') {
    const approved = window.confirm('Use Smart Concierge for this workspace? It sends your current job request and a redacted workflow summary to 1stStep’s configured AI provider. Saved resumes, stored answers, credentials, OTPs, and CAPTCHA responses are not included.');
    if (!approved) {
      addMessage('assistant', guidanceHtml(guidance, 'Smart AI processing was not enabled. I can still guide this workspace locally.'));
      return;
    }
    localStorage.setItem(AI_CONSENT_KEY, 'approved');
  }
  const counts = pipelineCounts(deskState);
  const readiness = readinessStatus(deskState);
  const stateSummary = {
    mission: missionState.mission, pipelineCounts: counts, readinessScore: readiness.score,
    nextUnresolvedLabel: readiness.unresolved[0]?.label || null,
    openHumanActions: deskState.actionQueue.filter(item => item.status === 'open').length,
    resumeAvailable: hasResume(), recommendedPriority: guidance.priority,
    productionCapabilities: { publicEmployerFeedDiscovery: true, externalSubmission: false, managedApplicationWorkspace: 'simulated' },
  };
  const pending = addMessage('assistant', '<strong>Reviewing your mission and deciding the best next step…</strong>', false);
  try {
    const reply = await callAI('concierge', 'fast', `<concierge_state>${escapeXmlData(JSON.stringify(stateSummary))}</concierge_state>\n<user_request>${escapeXmlData(redactChatForModel(input))}</user_request>`, 350);
    pending.remove();
    addMessage('assistant', `${escapeHtml(reply).replaceAll('\n', '<br>')}<div class="quick">${guidance.actions.map(action => `<button data-prompt="${escapeHtml(action.prompt)}">${escapeHtml(action.label)}</button>`).join('')}</div>`);
  } catch {
    pending.remove();
    addMessage('assistant', guidanceHtml(guidance, 'I saved what I could from that request.'));
  }
}

async function discoverMatchingJobs() {
  const mission = missionState.mission || {};
  const previousRequestId = missionState.discovery?.requestId || '';
  missionState.runState = 'Searching';
  missionState.discovery = { status: 'searching', checkedAt: new Date().toISOString(), requestId: previousRequestId };
  saveAll(); renderMission();
  const pending = addMessage('assistant', '<strong>Checking free direct-employer feeds now…</strong><br>A broad scan usually takes 10–25 seconds. I’ll keep only mission matches and suppress duplicates. External applications remain disabled.', false);
  $('agentRunState').textContent = 'Checking public employer feeds';
  try {
    const headers = apiAuthorizationHeaders();
    const requestId = missionState.discovery?.requestId || crypto.randomUUID();
    missionState.discovery.requestId = requestId;
    saveAll();
    const signedSession = hasApiSession();
    const response = await fetchWithTimeout(signedSession ? '/api/job-agent-runs' : '/api/concierge-discovery', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(signedSession ? { 'Idempotency-Key': requestId } : {}), ...headers },
      body: JSON.stringify(signedSession ? { mission, runNow: true } : { mission, limit: mission.target || 10 }),
    }, signedSession ? 45000 : REQUEST_TIMEOUTS.discovery);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 202) throw new Error(payload.error || 'Public employer-feed discovery is unavailable.');
    if (payload.run) {
      durableRun = payload.run;
      cacheDurableRun(durableRun);
      missionState.durableRunId = durableRun.id;
      if (durableRun.status !== 'Finished' || !durableRun.result) {
        pending.remove();
        missionState.runState = durableRun.status === 'Failed' ? 'Paused' : durableRun.status;
        missionState.discovery = { ...missionState.discovery, status: 'queued', checkedAt: new Date().toISOString(), requestId };
        saveAll(); renderMission();
        addMessage('assistant', '<strong>Your search run is safely queued.</strong><br>It can be retried from its durable checkpoint if a feed is slow or temporarily unavailable. Nothing was submitted.<div class="quick"><button data-prompt="Retry job discovery">Check again</button></div>');
        setTimeout(() => refreshDurableDiscovery(durableRun.id), 5000);
        return;
      }
    }
    const data = payload.run?.result || payload;
    pending.remove();
    if (data.status === 'sources-not-configured') {
      missionState.discovery = { status: 'catalog-needed', checkedAt: new Date().toISOString(), sourcesChecked: 0, matches: 0 };
      saveAll(); renderMission();
      addMessage('assistant', '<strong>Your search is saved, but this preview has no employer-feed catalog connected yet.</strong><br>I did not use the disabled paid job API or invent results. Greenhouse, Lever, Ashby, and SmartRecruiters feeds can be enabled without a paid search subscription; browser-extension discovery remains the next coverage layer.');
      return;
    }
    let added = 0;
    let duplicates = 0;
    let rejectedByQualityFloor = 0;
    const missionJobs = (data.jobs || []).filter(job => jobTitleMatchesMission(job, mission));
    const rejectedByMission = Math.max(0, (data.jobs || []).length - missionJobs.length);
    for (const job of missionJobs) {
      if (job.applyPathVerified !== true) continue;
      const requirements = extractStructuredRequirements(job);
      const fit = evaluateCandidateFit({ ...job, requirements }, deskState.truthProfile, mission);
      deskState.hiringEcosystem = upsertHiringEcosystem(deskState.hiringEcosystem, { ...job, requirements }, new Date().toISOString());
      if (!fit.credibleInterviewPath) {
        rejectedByQualityFloor += 1;
        continue;
      }
      const result = addRole(deskState, {
        employer: job.employer, title: job.title, requisitionId: job.requisitionId,
        jobDescription: job.description, directEmployerUrl: job.applyUrl, sourceUrl: job.jobUrl,
        sourceType: 'direct-employer', applyPathActive: job.applyPathVerified === true,
        remoteEligibility: job.remote ? 'Remote listed by employer feed' : `As listed: ${job.workplaceType || job.location || 'Unknown'}`,
        geographyEligibility: job.location ? `Employer listing: ${job.location}` : 'Unknown',
        salaryMin: job.salaryMin, salaryMax: job.salaryMax, salaryDisclosure: job.salaryDisclosure || 'Unknown',
        employmentType: job.employmentType || 'Unknown',
        requirements, fitScore: fit.score, fitClassification: fit.classification,
        credibleInterviewPath: fit.credibleInterviewPath, fitRationale: fit.rationale,
        fitComponents: fit.components, hardDisqualifiers: fit.hardDisqualifiers,
        sourceProvider: job.provider, sourceEvidence: `${job.sourceEvidence || 'Published employer feed'} · ${job.applyPathVerification || 'exact requisition verified'}`, discoveryRunId: durableRun?.id || '',
        relevancePolicyVersion: JOB_RELEVANCE_POLICY_VERSION, missionRole: mission.role || (mission.roleFamilies || []).join(', '),
        postedDate: job.postedDate || 'Unknown', travel: 'Unknown', schedule: 'Unknown',
        materialGaps: [
          'Travel and schedule require direct-page review before Verified',
          job.employmentType === 'Unknown' ? 'Employment type requires direct-page review' : '',
        ].filter(Boolean),
      });
      deskState = result.state;
      if (result.duplicate) duplicates += 1; else added += 1;
    }
    if (missionState.runState !== 'Paused') missionState.runState = 'Preparing';
    saveAll(); renderAll();
    const checked = (data.sourceSummary || []).filter(source => ['ok', 'partial'].includes(source.status)).length;
    missionState.discovery = { status: 'complete', checkedAt: new Date().toISOString(), sourcesChecked: checked, matches: added, duplicates, rejectedByMission, rejectedByQualityFloor, requestId, durableRunId: durableRun?.id || null };
    saveAll(); renderMission();
    const topMatches = missionJobs.slice(0, 5).map(job => {
      const details = [job.employmentType, job.workplaceType || job.location].filter(Boolean).map(escapeHtml).join(' · ');
      const fit = evaluateCandidateFit({ ...job, requirements: extractStructuredRequirements(job) }, deskState.truthProfile, mission);
      if (!fit.credibleInterviewPath) return '';
      return `<a class="job-match" href="${escapeHtml(job.applyUrl)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(job.title)}</strong><span>${escapeHtml(job.employer)}${details ? ` · ${details}` : ''} · ${fit.score}/100 ${escapeHtml(fit.classification)}</span></a>`;
    }).join('');
    addMessage('assistant', `<strong>Found ${added} credible mission match${added === 1 ? '' : 'es'} across ${checked} direct-employer feed${checked === 1 ? '' : 's'}.</strong><br>${duplicates} duplicate${duplicates === 1 ? ' was' : 's were'} suppressed; ${rejectedByMission} off-mission role${rejectedByMission === 1 ? ' was' : 's were'} withheld; ${rejectedByQualityFloor} role${rejectedByQualityFloor === 1 ? ' was' : 's were'} held below the 70-point application floor. Verified fit and your observed outcomes outrank the daily quota. These roles are Found—not Submitted—and still require exact direct-page, geography, travel, schedule, and gap verification.${topMatches ? `<div class="job-matches">${topMatches}</div>` : ''}<div class="quick"><button data-prompt="Show my jobs">Review all matches</button><button data-prompt="Review my current mission">Review mission</button></div>`);
  } catch (error) {
    pending.remove();
    missionState.runState = 'Paused';
    missionState.discovery = { status: 'error', checkedAt: new Date().toISOString(), message: error.message, requestId: missionState.discovery?.requestId || previousRequestId };
    saveAll(); renderMission();
    addMessage('assistant', `<strong>I saved your mission, but live public-feed discovery did not run.</strong><br>${escapeHtml(error.message)} No applications were submitted and no paid job API was used.<div class="quick"><button data-prompt="Retry job discovery">Try again</button></div>`);
  }
}

async function refreshDurableDiscovery(runId, attempt = 0) {
  if (!runId || !hasApiSession()) return;
  try {
    const response = await fetchWithTimeout(`/api/job-agent-runs?id=${encodeURIComponent(runId)}`, { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.run) return;
    durableRun = data.run;
    cacheDurableRun(durableRun);
    if (durableRun.status === 'Finished' && durableRun.result && missionState.discovery?.status === 'queued') {
      discoverMatchingJobs();
      return;
    }
    if (['Searching', 'Preparing'].includes(durableRun.status) && attempt < 5) setTimeout(() => refreshDurableDiscovery(runId, attempt + 1), 5000);
  } catch { /* the durable checkpoint remains available for a later refresh */ }
}

function startCareerStory() {
  if (localStorage.getItem(CAREER_STORY_CONSENT_KEY) !== 'approved') {
    const approved = window.confirm('Use your career story to build a resume? The story you type—including any personal details you include—will be sent to 1stStep’s configured AI provider to propose resume facts. Nothing becomes reusable until you review and confirm it, and nothing is sent to an employer.');
    if (!approved) {
      addMessage('assistant', '<strong>Career-story processing was not enabled.</strong><br>You can still upload a resume or use the local guided questions.');
      return;
    }
    localStorage.setItem(CAREER_STORY_CONSENT_KEY, 'approved');
  }
  careerStoryActive = true;
  addMessage('assistant', '<strong>Tell me who you are in your own words.</strong><br>Include the roles and employers you remember, approximate or exact dates, education, skills, and a few truthful outcomes. One message is enough. I’ll separate confirmed details from anything unclear.');
  $('messageInput').placeholder = 'I started as… then moved into… My strongest skills are…';
  $('messageInput').focus();
}

function parseCareerStoryResponse(text) {
  const clean = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(clean);
}

async function processCareerStory(input) {
  careerStoryActive = false;
  $('messageInput').placeholder = 'I need 30 remote procurement jobs, $110k+, using my saved resume';
  const pending = addMessage('assistant', '<strong>Organizing your story into reviewable resume facts…</strong>', false);
  try {
    const extracted = parseCareerStoryResponse(await callAI(
      'profileExtractor', 'fast', `<career_story>${escapeXmlData(input)}</career_story>`, 900,
    ));
    const draft = buildCareerStoryDraft(extracted);
    deskState = stageReadinessDraft(deskState, draft);
    saveAll(); renderAll(); pending.remove();
    const rows = draft.proposals.map(item => `<strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value).replaceAll('\n', ' · ')}`).join('<br>');
    const uncertainties = draft.uncertainties.length ? `<br><strong>Still unclear:</strong> ${escapeHtml(draft.uncertainties.join(' · '))}` : '';
    addMessage('assistant', `<strong>Here’s the resume profile I heard. Please confirm it before I use it.</strong><br>${rows}${uncertainties}<div class="quick"><button data-prompt="Confirm these career facts and build my resume">Confirm & create resume</button><button data-prompt="Correct my career story">Correct something</button></div>`);
  } catch (error) {
    pending.remove();
    addMessage('assistant', `<strong>I couldn’t safely turn that into confirmed resume facts yet.</strong><br>${escapeHtml(error.message)} Try describing your roles, employers, dates, education, and skills in one message.<div class="quick"><button data-prompt="Let me tell you who I am and build my resume">Try again</button><button data-prompt="Build my resume with guided questions">Use guided questions</button></div>`);
  }
}

function nextResumeInterviewField() {
  const profile = loadJson('1ststep_profile', {});
  const missing = buildVerifiedResumeDraft(deskState, profile).missingSections;
  const map = { 'name and contact': 'contact', 'work history': 'employment', education: 'education', skills: 'skills' };
  return missing.map(item => map[item]).find(Boolean) || '';
}

function startResumeInterview() {
  const next = nextResumeInterviewField();
  if (!next) return generateMasterResume();
  resumeInterviewActive = true;
  closeResumeSetup();
  addMessage('assistant', `<strong>I need ${escapeHtml(READINESS_FIELDS.find(([key]) => key === next)?.[1] || next)}.</strong><br>Answer this once. I’ll keep moving through only the missing resume essentials, then generate the draft for review.`);
  openQuestionPopup(next);
}

async function generateMasterResume() {
  const profile = loadJson('1ststep_profile', {});
  const base = buildVerifiedResumeDraft(deskState, profile);
  if (base.missingSections.length) return startResumeInterview();
  openResumeSetup();
  $('resumeEditor').value = base.text;
  const approved = window.confirm('Generate a polished master resume now? This sends only the verified resume facts shown in the editor to 1stStep’s configured AI provider. Nothing is sent to an employer.');
  if (!approved) {
    setResumeMessage('Truth-safe draft is ready. AI polishing was not started; you can edit or save this version locally.', 'warn');
    return;
  }
  setResumeMessage('Generating a polished master resume from verified facts…');
  try {
    const generated = await callAI('resumeBuilder', 'quality', `<verified_candidate_facts>\n${escapeXmlData(base.text)}\n</verified_candidate_facts>`, 2600);
    $('resumeEditor').value = sanitizeResumeText(generated);
    setResumeMessage('AI-generated master resume is ready for your review. Nothing is saved until you choose Save resume.', 'good');
  } catch (error) {
    $('resumeEditor').value = base.text;
    setResumeMessage(`${error.message} The verified local draft is still available for review.`, 'warn');
  }
}

function currentRunState() {
  if (durableApplicationSessions.some(session => (session.actions || []).some(item => item.status === 'open')
    || (session.postSubmission?.followUp?.status === 'SCHEDULED' && new Date(session.postSubmission.followUp.dueAt).getTime() <= Date.now()))) return 'Waiting for You';
  if (!missionState.mission?.role) return durableApplicationSessions.some(session => session.state === 'Paused') ? 'Paused' : durableApplicationSessions.length ? 'Preparing' : null;
  if (missionState.runState === 'Paused' || durableRun?.lifecycleState === 'Paused') return 'Paused';
  if (missionState.runState === 'Finished') return 'Finished';
  if (missionState.discovery?.status === 'error') return 'Paused';
  const today = new Date().toDateString();
  const receiptsToday = deskState.roles.filter(role => role.status === 'Submitted' && role.receipt && !role.receipt.simulated
    && new Date(role.receipt.submittedAt || role.receipt.receivedAt || 0).toDateString() === today).length;
  if (receiptsToday >= Math.min(50, Math.max(1, Number(dailyGoal.target) || 10))) return 'Finished';
  if (deskState.actionQueue.some(item => item.status === 'open') || durableApplicationSessions.some(session => (session.actions || []).some(item => item.status === 'open'))) return 'Waiting for You';
  if (missionState.discovery?.status === 'searching' || ['Queued', 'Searching', 'Verifying', 'Retrying'].includes(durableRun?.lifecycleState)) return 'Searching';
  if (durableRun?.lifecycleState === 'Waiting for You') return 'Waiting for You';
  if (['Completed', 'Partially Completed', 'Failed Safely'].includes(durableRun?.lifecycleState)) return 'Finished';
  return missionState.runState === 'Searching' ? 'Searching' : 'Preparing';
}

function detailedRunState(state) {
  return durableRun?.lifecycleState || (state === 'Finished' ? 'Completed' : state);
}

function runStateSummary(state, detailed = detailedRunState(state)) {
  const detailedSummary = {
    Queued: 'Queued · progress saved and ready for a worker',
    Verifying: 'Verifying live requisitions · progress saved',
    Retrying: 'Retrying one source · healthy work remains saved',
    'Partially Completed': 'Partially completed · verified results were retained',
    'Failed Safely': 'Failed safely · progress saved · Play again when ready',
    Completed: 'Completed · only persisted verified results are shown',
  }[detailed];
  if (detailedSummary) return detailedSummary;
  return {
    Searching: 'Checking verified direct-employer sources',
    Preparing: 'Ranking matches and preparing truthful application materials',
    'Waiting for You': 'A decision or secure browser step needs you',
    Paused: 'Your progress is saved; no new work is starting',
    Finished: 'This run reached its stop condition',
  }[state] || 'Choose your path to begin';
}

function renderRunState() {
  const state = currentRunState();
  const detailed = detailedRunState(state);
  const activeIndex = RUN_STATES.indexOf(state);
  document.querySelectorAll('[data-run-state]').forEach((node, index) => {
    node.classList.toggle('active', node.dataset.runState === state);
    node.classList.toggle('complete', activeIndex > 0 && index < activeIndex && state !== 'Paused');
  });
  $('runStateSummary').textContent = runStateSummary(state, detailed);
  const verifiedAt = durableRun?.result?.completedAt || [...(durableRun?.events || [])].reverse().find(item => ['RUN_COMPLETED', 'RUN_PARTIALLY_COMPLETED'].includes(item.type))?.at || null;
  const nextRunAt = jobAgentSchedule.schedule?.status === 'active' ? jobAgentSchedule.schedule.nextRunAt : durableRun?.nextRetryAt;
  $('runStateTiming').textContent = `${verifiedAt ? `Last verified activity ${relativeActivityTime(verifiedAt)}` : 'No completed activity inferred'} · ${nextRunAt ? `next run ${new Date(nextRunAt).toLocaleString()}` : 'no scheduled run'}`;
  $('pauseRun').hidden = !state || ['Paused', 'Finished'].includes(state);
  $('resumeRun').hidden = !['Paused', 'Failed Safely', 'Partially Completed'].includes(detailed);
}

function relativeActivityTime(value) {
  const timestamp = new Date(value || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Persisted status';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function renderCommandCenterEvidence(openActions) {
  const roles = subscriberRoles();
  const coverage = directSourceCoverage(durableRun);
  const activity = maskedActivityFeed({ run: durableRun, roles, applicationSessions: durableApplicationSessions, openActionCount: openActions });
  $('agentActivityList').innerHTML = activity.length ? activity.map(item => `<li class="activity-${escapeHtml(item.kind)}"><i aria-hidden="true"></i><div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span></div><time>${escapeHtml(relativeActivityTime(item.at))}</time></li>`).join('')
    : '<li class="command-center-empty">Activity appears after your first saved search. No activity is inferred.</li>';
  $('sourceCoverageState').textContent = coverage.state === 'searching' ? 'Checking now' : coverage.state === 'healthy' ? 'Healthy' : coverage.state === 'partial' ? 'Partial coverage' : 'Not checked yet';
  $('sourceCoverageSummary').textContent = coverage.checked
    ? `${coverage.healthy} healthy · ${coverage.partial} partial · ${coverage.unavailable} unavailable · ${coverage.verifiedMatches} verified matches`
    : 'Run a search to measure live employer-feed availability.';
  $('sourceProviderList').innerHTML = coverage.providers.length ? coverage.providers.map(provider => {
    const state = provider.unavailable ? 'Needs retry' : provider.partial ? 'Partial' : 'Healthy';
    return `<li><div><strong>${escapeHtml(provider.label)}</strong><span>${provider.checked} employer feed${provider.checked === 1 ? '' : 's'} checked</span></div><em class="source-${provider.unavailable ? 'error' : provider.partial ? 'partial' : 'healthy'}">${escapeHtml(state)}</em></li>`;
  }).join('') : '<li class="command-center-empty">Greenhouse, Lever, Ashby, and SmartRecruiters coverage is measured from the latest durable run.</li>';
  $('sourceCostSummary').textContent = coverage.checked
    ? `${coverage.requests} public feed request${coverage.requests === 1 ? '' : 's'} · ${coverage.llmTokens} retrieval tokens · no paid job API`
    : 'No feed or retrieval usage recorded for this view.';
}

function learnedValuePreview(value) {
  if (Array.isArray(value)) return value.join(', ').slice(0, 120);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value ?? '').slice(0, 120);
}

function renderLearningCenter() {
  const learning = jobAgentLearning.learning;
  const synced = jobAgentLearning.status === 'synced' && learning;
  $('learningStatus').textContent = jobAgentLearning.status === 'loading' ? 'Syncing' : jobAgentLearning.status === 'unavailable' ? 'Temporarily unavailable' : !synced ? 'Sign in to sync' : learning.status === 'active' ? 'Learning active' : 'Learning paused';
  $('toggleLearning').disabled = !synced;
  $('toggleLearning').textContent = learning?.status === 'active' ? 'Pause learning' : 'Resume learning';
  $('exportLearning').disabled = !synced;
  $('deleteLearning').disabled = !synced;
  const preferences = (learning?.preferences || []).filter(item => item.status === 'active');
  $('learningPreferenceCount').textContent = `${preferences.length} confirmed`;
  $('learningPreferences').innerHTML = preferences.length ? preferences.slice(0, 8).map(item => `<li><div><strong>${escapeHtml(item.label || item.key)}</strong><span>${escapeHtml(learnedValuePreview(item.normalizedValue))} · ${item.userConfirmed ? 'confirmed by you' : escapeHtml(item.verificationStatus)}</span></div><div class="learning-row-actions"><button type="button" data-learning-correct="${escapeHtml(item.id)}">Correct</button><button type="button" data-learning-revoke="${escapeHtml(item.id)}">Revoke</button></div></li>`).join('') : '<li class="command-center-empty">No synced preferences yet.</li>';
  const improvements = learning?.recentImprovements || [];
  $('learningPolicyVersion').textContent = learning?.activePolicyVersion ? learning.activePolicyVersion.replace(/^learning-/, 'Version ') : 'Baseline';
  $('learningImprovements').innerHTML = improvements.length ? improvements.slice(0, 6).map(item => `<li><div><strong>${item.type === 'PREFERENCE_CORRECTED' ? 'Preference corrected' : item.type === 'LEARNING_POLICY_ROLLED_BACK' ? 'Improvement rolled back' : 'Verified improvement promoted'}</strong><span>${escapeHtml(relativeActivityTime(item.at))} · persisted audit event</span></div></li>`).join('') : '<li class="command-center-empty">No promoted improvement has been recorded.</li>';
  const policies = learning?.policyVersions || [];
  const activePolicy = policies.find(item => item.version === learning?.activePolicyVersion);
  $('rollbackLearning').hidden = !synced || !activePolicy?.parentVersion;
  $('rollbackLearning').dataset.version = activePolicy?.parentVersion || '';
  const sources = learning?.sourcePerformance || [];
  $('learningSourceCount').textContent = `${sources.length} measured`;
  $('learningSources').innerHTML = sources.length ? [...sources].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 8).map(item => `<li><div><strong>${escapeHtml(item.provider)} · ${escapeHtml(item.employer)}</strong><span>Priority ${Number(item.priorityScore) || 0} · ${Number(item.verifiedRequisitions) || 0} verified · ${Number(item.consecutiveFailures) || 0} recent failures</span></div></li>`).join('') : '<li class="command-center-empty">Source performance appears after verified scans.</li>';
  const reviews = [...(learning?.humanActions || []), ...(learning?.proposals || []).filter(item => item.risk === 'high' && item.status === 'evaluated')];
  $('learningReviewCount').textContent = `${reviews.length} open`;
  $('learningReviews').innerHTML = reviews.length ? reviews.slice(0, 8).map(item => `<li><div><strong>${escapeHtml(item.summary || item.affectedBehavior || 'High-risk change')}</strong><span>${item.risk === 'high' ? 'Your approval is required' : 'Resolve in Saved Info'}</span></div>${item.risk === 'high' ? `<button type="button" data-learning-approve="${escapeHtml(item.id)}">Review & approve</button>` : ''}</li>`).join('') : '<li class="command-center-empty">No high-risk learning change needs approval.</li>';
}

function allNeedsYouActions() {
  const localActions = deskState.actionQueue.filter(item => item.status === 'open');
  const durableActions = durableApplicationSessions.flatMap(session => (session.actions || []).filter(item => item.status === 'open').map(item => ({
    ...item, sessionId: session.id, roleLabel: `${session.role.employer} · ${session.role.title}`, durable: true,
  })));
  const dueFollowUps = durableApplicationSessions.filter(session => session.postSubmission?.followUp?.status === 'SCHEDULED'
    && new Date(session.postSubmission.followUp.dueAt).getTime() <= Date.now()).map(session => ({
    id: `follow_up_${session.id}`, type: 'FOLLOW_UP_DUE', status: 'open', sessionId: session.id,
    roleLabel: `${session.role.employer} · ${session.role.title}`, durable: true,
    summary: 'Your in-app follow-up reminder is due. 1stStep has not contacted the employer.',
  }));
  const syncedActions = localActions.length || durableActions.length || dueFollowUps.length ? [] : (syncedSubscriberView.needsYou || []);
  return [...dueFollowUps, ...durableActions, ...localActions, ...syncedActions];
}

function renderNeedsYouQueue() {
  const actions = allNeedsYouActions();
  $('headerNeedsYouCount').textContent = actions.length;
  $('headerNeedsYouCount').hidden = actions.length === 0;
  $('needsYouEmpty').hidden = actions.length > 0;
  $('needsYouList').innerHTML = actions.map(item => {
    const role = deskState.roles.find(entry => entry.id === item.roleId);
    const label = item.roleLabel || (role ? `${role.employer} · ${role.title}` : 'Your job agent');
    const target = item.durable ? `data-review-session="${escapeHtml(item.sessionId)}"` : `data-review-action="${escapeHtml(item.id)}"`;
    return `<article class="needs-you-item"><div><span>${escapeHtml(needsYouKind(item.type))}</span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(item.summary || 'A secure step needs your attention.')}</small><em>Your saved application will resume after this step.</em></div><button type="button" ${target}>Review</button></article>`;
  }).join('');
}

function visibleSubscriberRoles(roles = []) {
  const mission = missionState.mission || {};
  return roles.filter(role => restoredJobCardIsRelevant({ ...role, status: subscriberUiStatus(role) }, mission));
}

function subscriberRoles() {
  const baseRoles = deskState.roles.length ? deskState.roles : (syncedSubscriberView.jobCards || []);
  const sessionOnlyRoles = durableApplicationSessions.filter(session => !baseRoles.some(role => role.packageRunId === session.packageRunId)).map(session => ({
    id: `session_role_${session.id}`, employer: session.role.employer, title: session.role.title,
    requisitionId: session.role.requisitionId, directEmployerUrl: session.role.directEmployerUrl,
    packageRunId: session.packageRunId, remoteEligibility: '', fitScore: null,
  }));
  return [...visibleSubscriberRoles(baseRoles), ...sessionOnlyRoles].sort((a, b) => Number(b.fitScore || 0) - Number(a.fitScore || 0));
}

function primaryJobAction(role, applicationSession, status) {
  if (applicationSession) return `<button class="job-primary-action" type="button" data-job-application-review="${escapeHtml(applicationSession.id)}">${status === 'Needs You' ? 'Review request' : 'View progress'}</button>`;
  if (status === 'Rejected/Closed') return '<span class="job-action-unavailable">Employer role closed</span>';
  if (role.packageDraft) return `<button class="job-primary-action" type="button" data-job-package-review="${escapeHtml(role.id)}">Review package</button>`;
  if (['Verified', 'Verified - Package Preparation'].includes(role.status)) return `<button class="job-primary-action" type="button" data-job-package-generate="${escapeHtml(role.id)}">${role.packageRunId ? 'Check package' : 'Prepare package'}</button>`;
  if (role.status === 'Package Ready') return `<button class="job-primary-action" type="button" data-job-application-start="${escapeHtml(role.id)}">Start application</button>`;
  const destination = safeEmployerDestination(role.directEmployerUrl);
  return destination ? `<a class="job-primary-action" href="${escapeHtml(destination.href)}" target="_blank" rel="noopener noreferrer">View employer role</a>` : '<span class="job-action-unavailable">No action available</span>';
}

function renderSubscriberJobs() {
  const actions = allNeedsYouActions();
  const records = subscriberRoles().map(role => {
    const applicationSession = durableApplicationSessions.find(session => session.packageRunId === role.packageRunId);
    const status = subscriberUiStatus(role, applicationSession);
    return { role, applicationSession, status, tab: statusTab(status) };
  });
  const tabCounts = Object.fromEntries(['Matches', 'Preparing', 'Needs You', 'Submitted', 'Follow-ups', 'Interviews', 'Closed'].map(tab => [tab, records.filter(item => item.tab === tab).length]));
  tabCounts['Needs You'] = Math.max(tabCounts['Needs You'], actions.length);
  document.querySelectorAll('[data-job-tab]').forEach(button => {
    button.setAttribute('aria-selected', String(button.dataset.jobTab === activeJobTab));
    button.querySelector('span').textContent = tabCounts[button.dataset.jobTab] || 0;
  });
  $('jobCardsTitle').textContent = activeJobTab;
  $('jobCardsDescription').textContent = activeJobTab === 'Submitted'
    ? 'Only applications with authoritative employer receipts are counted here.'
    : activeJobTab === 'Follow-ups' ? 'User-scheduled reminders that are due. The agent never contacts an employer automatically.'
      : activeJobTab === 'Closed' ? 'Roles closed by the direct employer source or outcomes you confirmed.'
    : activeJobTab === 'Needs You' ? 'Secure decisions and employer-site steps that only you can complete.'
      : 'Direct-employer opportunities only. Prepared is never counted as submitted.';
  if (activeJobTab === 'Needs You') {
    $('jobCards').innerHTML = actions.length ? actions.map(item => {
      const role = deskState.roles.find(entry => entry.id === item.roleId);
      const label = item.roleLabel || (role ? `${role.employer} · ${role.title}` : 'Your job agent');
      const target = item.durable ? `data-review-session="${escapeHtml(item.sessionId)}"` : `data-review-action="${escapeHtml(item.id)}"`;
      return `<article class="simple-job-card needs-card"><header><div><p>${escapeHtml(needsYouKind(item.type))}</p><h4>${escapeHtml(label)}</h4></div><span class="status-badge status-needs-you">Needs You</span></header><p>${escapeHtml(item.summary || 'A secure step needs your attention.')}</p><footer><strong>State preserved</strong><button class="job-primary-action" type="button" ${target}>Review request</button></footer></article>`;
    }).join('') : '<div class="jobs-empty">Nothing needs you right now. Other safe work can continue.</div>';
    return;
  }
  const filtered = records.filter(item => item.tab === activeJobTab);
  $('jobCards').innerHTML = filtered.length ? filtered.map(({ role, applicationSession, status }) => {
    const salary = compensationRange(role.salaryMin, role.salaryMax);
    const fit = role.fitScore == null ? 'Match strength unavailable' : `${role.fitScore}/100 match`;
    const location = role.remoteEligibility || role.geographyEligibility || 'Location eligibility unavailable';
    return `<article class="simple-job-card"><header><div><p>${escapeHtml(role.employer || 'Employer unavailable')}</p><h4>${escapeHtml(role.title || 'Job title unavailable')}</h4></div><span class="status-badge ${statusBadgeClass(status)}">${escapeHtml(status)}</span></header><div class="simple-job-meta"><span>${escapeHtml(location)}</span><span>${escapeHtml(salary)}</span></div><footer><strong>${escapeHtml(fit)}</strong>${primaryJobAction(role, applicationSession, status)}</footer></article>`;
  }).join('') : `<div class="jobs-empty">No ${escapeHtml(activeJobTab.toLowerCase())} jobs yet. Unavailable counts remain zero until persisted evidence exists.</div>`;
}

function openJobs(tab = 'Matches') { activeJobTab = tab; renderSubscriberJobs(); $('jobsOverlay').classList.add('open'); }
function closeJobs() { $('jobsOverlay').classList.remove('open'); }
function openNeedsYou() { renderNeedsYouQueue(); $('needsYouOverlay').classList.add('open'); $('closeNeedsYou').focus(); }
function closeNeedsYou() { $('needsYouOverlay').classList.remove('open'); }

function renderAgentConfiguration() {
  const mission = missionState.mission || {};
  const campaign = activeCampaign();
  $('configCriteria').textContent = mission.role || selectedOpportunityPath()?.label || 'Not configured';
  $('configSchedule').textContent = jobAgentSchedule.schedule?.status === 'active'
    ? `Daily · next ${new Date(jobAgentSchedule.schedule.nextRunAt).toLocaleString()}`
    : campaign?.schedule?.recurrence || 'Runs when you start or resume it';
  $('configSalary').textContent = mission.salaryMin ? money(mission.salaryMin) : guidedSelection.salary ? money(guidedSelection.salary) : 'No minimum saved';
  $('configLocation').textContent = [...(mission.workModes || [mission.workMode || guidedSelection.workMode]), mission.location || guidedSelection.location].filter(Boolean).join(' · ') || 'Not configured';
  $('configTarget').textContent = `${Math.min(50, Math.max(1, Number(dailyGoal.target) || 10))} qualified applications per day`;
  $('configApproval').textContent = deskState.autonomy.level === 'prepare_only' ? 'Prepare only · confirm before sharing' : 'Confirm personal-data sharing and final submission';
  $('configNotifications').textContent = jobAgentNotifications.preference?.enabled ? 'In-app + generic email Needs You alert' : 'In-app Needs You queue';
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'agent-toast';
  toast.textContent = message;
  $('toastRegion').replaceChildren(toast);
  setTimeout(() => toast.remove(), 3600);
}

function openConsequenceDialog(session, action) {
  pendingConsequence = { sessionId: session.id, action, actionId: $('resolveApplication').dataset.applicationActionId || '' };
  lastDialogTrigger = document.activeElement;
  const information = (session.proposedFields || []).map(item => item.label).filter(Boolean);
  $('confirmationEmployer').textContent = session.role.employer || 'Unavailable';
  $('confirmationRole').textContent = session.role.title || 'Unavailable';
  $('confirmationRequisition').textContent = session.role.requisitionId || 'Not provided by employer';
  $('confirmationInformation').textContent = information.length ? `${information.join(', ')} and package ${session.documentVersion}` : `Package ${session.documentVersion}`;
  $('confirmationRisk').textContent = action === 'confirm-submission'
    ? finalSubmissionExecutionEnabled
      ? 'This authorizes one final submission attempt for the exact reviewed form. It will not count as Submitted without a verified employer receipt.'
      : 'This records permission for the exact reviewed form, but submission execution is not launch-enabled. Nothing counts without a verified employer receipt.'
    : 'This shares approved personal application data with the named employer; it does not submit.';
  $('confirmationAction').textContent = action === 'confirm-submission' ? 'Authorize final application submission' : 'Authorize personal-data transmission';
  $('confirmConsequence').textContent = action === 'confirm-submission' ? 'Authorize submission' : 'Authorize sharing';
  $('confirmationSubtitle').textContent = action === 'confirm-submission'
    ? finalSubmissionExecutionEnabled ? 'Confirming queues one exact, single-attempt submission action.' : 'Confirming records permission only; execution remains disabled.'
    : 'Nothing will happen until you confirm.';
  $('confirmationSubtitle').classList.remove('visible-error');
  $('applicationOverlay').setAttribute('aria-hidden', 'true');
  $('confirmationOverlay').classList.add('open');
  $('cancelConfirmation').focus();
}

function closeConsequenceDialog() {
  $('confirmationOverlay').classList.remove('open');
  $('applicationOverlay').removeAttribute('aria-hidden');
  pendingConsequence = null;
  lastDialogTrigger?.focus?.();
}

function reviewNeedsYouTarget(target) {
  const durableSessionId = target?.dataset?.reviewSession;
  if (durableSessionId) { closeNeedsYou(); openDurableApplicationWorkspace(durableSessionId); return true; }
  const actionId = target?.dataset?.reviewAction;
  if (!actionId) return false;
  const action = deskState.actionQueue.find(item => item.id === actionId);
  const session = activeApplicationSession();
  closeJobs(); closeNeedsYou();
  if (session && (!action?.roleId || action.roleId === session.roleId)) openApplicationWorkspace();
  else {
    addMessage('assistant', `<strong>This item is saved and waiting for you.</strong><br>${escapeHtml(action?.summary || 'Complete the secure step on the employer page, then return here to continue.')} Passwords, OTPs, and CAPTCHA answers stay on the employer site.`);
    $('agentConversation').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return true;
}

function renderMission() {
  const mission = missionState.mission || {};
  const counts = pipelineCounts(deskState);
  const submitted = counts.Submitted || 0;
  const target = mission.target || 0;
  const readiness = readinessStatus(deskState);
  const missionActive = Boolean(mission.role);
  const resumeReady = hasResume();
  const openActions = allNeedsYouActions().length;
  const packageReady = (counts['Package Ready'] || 0) + (counts['Awaiting Approval'] || 0);
  const workspaceReady = missionActive || Boolean(durableRun) || deskState.roles.length > 0
    || durableApplicationSessions.length > 0 || openActions > 0;
  const submittedToday = authoritativeReceiptCount([...deskState.roles, ...durableApplicationSessions], new Date());
  const dailyTarget = Math.min(50, Math.max(1, Number(dailyGoal.target) || 10));
  const remainingToday = Math.max(0, dailyTarget - submittedToday);
  $('missionName').textContent = mission.role ? `${mission.target}-job ${mission.role} sprint` : 'No active mission';
  $('target').textContent = target;
  $('completed').textContent = submitted;
  $('progressBar').value = target ? Math.min(100, (submitted / target) * 100) : 0;
  $('stageCounts').innerHTML = Object.entries(counts).map(([status, count]) => `<span>${escapeHtml(status)} ${count}</span>`).join('');
  $('resumeStatus').textContent = resumeReady ? 'Saved resume detected' : 'Resume needed';
  $('truthStatus').textContent = `${readiness.score}% ready · ${deskState.autonomy.level.replaceAll('_', ' ')}`;
  $('roleStatus').textContent = mission.role || 'Not set';
  $('modeStatus').textContent = [...(mission.workModes || [mission.workMode]), ...(mission.employmentTypes || []), mission.location].filter(Boolean).join(' · ') || 'Not set';
  $('salaryStatus').textContent = money(mission.salaryMin);
  $('searchLinks').innerHTML = mission.role ? buildSearchLinks(mission).map(link => `<a class="search-link" target="_blank" rel="noopener" href="${link.url}">${escapeHtml(link.label)}</a>`).join('') : '';
  const subscriberStats = missionStats(deskState.roles, durableApplicationSessions, openActions);
  $('progressNew').textContent = subscriberStats.new;
  $('progressVerified').textContent = subscriberStats.verifiedMatches;
  $('progressReady').textContent = subscriberStats.packagesReady;
  $('progressApplying').textContent = subscriberStats.applying;
  $('progressApplied').textContent = subscriberStats.submitted;
  $('progressNeedsYou').textContent = subscriberStats.needsYou;
  $('progressBlocked').textContent = subscriberStats.blocked;
  $('progressInterviews').textContent = subscriberStats.interviews;
  $('progressFollowUp').textContent = subscriberStats.followUpDue;
  $('progressClosed').textContent = subscriberStats.rejectedClosed;
  $('dailyGoalCompleted').textContent = submittedToday;
  $('dailyGoalTarget').textContent = dailyTarget;
  $('dailyGoalRemaining').textContent = remainingToday;
  $('dailyGoalBar').value = Math.min(100, (submittedToday / dailyTarget) * 100);
  $('dailyGoalInput').value = dailyTarget;
  $('dailyGoalMessage').textContent = missionActive
    ? `${mission.role} · ${[...(mission.workModes || [mission.workMode]), ...(mission.employmentTypes || [])].filter(Boolean).join(' · ')} · target only; verified fit outranks volume`
    : 'This is a target, not a guarantee. Verified fit and observed outcomes outrank volume.';
  document.querySelectorAll('[data-daily-goal]').forEach(button => button.classList.toggle('selected', Number(button.dataset.dailyGoal) === dailyTarget));
  const discoveryLabels = {
    searching: 'Searching free direct-employer feeds',
    complete: `Search complete · ${missionState.discovery?.matches || 0} new matches`,
    'catalog-needed': 'Request saved · employer-feed catalog needed',
    error: 'Request saved · discovery needs attention',
  };
  $('agentRunState').textContent = missionActive
    ? (discoveryLabels[missionState.discovery?.status] || 'Request saved · ready to search')
    : 'Ready when you are';
  $('quickResumeState').textContent = resumeReady ? 'Resume ready' : 'No resume selected yet';
  $('quickResumeState').classList.toggle('ready', resumeReady);
  $('startJobSearch').textContent = missionActive ? 'Update my job agent' : 'Start my job agent';
  $('openGuidedLaunch').querySelector('span').textContent = missionActive ? 'Update my Job Agent' : 'Start my Job Agent';
  document.body.classList.toggle('mission-active', missionActive);
  document.body.classList.toggle('workspace-ready', workspaceReady);
  const launchChoiceButtons = [...document.querySelectorAll('[data-launch-choice]')];
  launchChoiceButtons.forEach(button => {
    const peers = launchChoiceButtons.filter(peer => peer.dataset.launchChoice === button.dataset.launchChoice);
    const selected = String(guidedSelection[button.dataset.launchChoice]) === button.dataset.value;
    const groupHasSelection = peers.some(peer => String(guidedSelection[peer.dataset.launchChoice]) === peer.dataset.value);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected || (!groupHasSelection && button === peers[0]) ? 0 : -1;
  });
  renderAgentConfiguration();
  renderNeedsYouQueue();
  renderOpportunityPaths();
  renderGuidedLaunch();
  renderRunState();
  renderCommandCenterEvidence(openActions);
  renderSubscriberJobs();
  renderAgentAccessState();
}

function respond(input) {
  if (careerStoryActive) {
    const safety = classifyConciergeMessage(`resume ${input}`);
    if (safety.kind === 'blocked') {
      careerStoryActive = false;
      addMessage('assistant', '<strong>I can’t process passwords, OTPs, CAPTCHA answers, malicious instructions, or protected-trait ranking.</strong> Start again with career facts only.');
      return;
    }
    processCareerStory(input);
    return;
  }
  const classification = classifyConciergeMessage(input);
  if (classification.kind === 'blocked') {
    const copy = classification.reason === 'protected-trait'
      ? '<strong>I can’t rank jobs or candidates using protected traits.</strong> I can use verified experience, role requirements, compensation, location, schedule, and skills.'
      : '<strong>I can’t accept passwords, OTPs, CAPTCHA answers, bypasses, or malicious requests.</strong> Keep authentication in your browser; I can queue the human step and continue other job work.';
    addMessage('assistant', copy); return;
  }
  if (classification.kind === 'off-topic') { addMessage('assistant', 'I only handle job-search work: readiness, discovery, truthful documents, applications, tracking, interviews, and follow-up.'); return; }
  if (classification.kind === 'empty') return;
  if (/confirm these career facts and build my resume/i.test(input) && deskState.readinessDraft?.status === 'pending') {
    safeAction(() => { deskState = confirmReadinessDraft(deskState); });
    addMessage('assistant', '<strong>Confirmed.</strong><br>I saved only the facts you reviewed. Now I’ll create the master resume draft for your approval.');
    generateMasterResume();
    return;
  }
  if (/correct my career story/i.test(input)) {
    careerStoryActive = true;
    addMessage('assistant', '<strong>Tell me the correction in one message.</strong><br>I’ll rebuild the proposal and ask you to confirm it again.');
    $('messageInput').focus();
    return;
  }
  if (/tell (?:you )?(?:who i am|about myself)|career story|start career-story resume/i.test(input)) {
    startCareerStory();
    return;
  }
  if (/build (?:my |a )?resume|create (?:my |a )?resume|write (?:my |a )?resume/i.test(input)) {
    addMessage('assistant', '<strong>I’ll build the master resume with you.</strong><br>I’ll reuse confirmed facts, ask only for missing essentials, then generate a polished draft for your review without inventing anything.');
    startResumeInterview();
    return;
  }
  if (/upload (?:my |a )?resume|resume setup/i.test(input)) {
    addMessage('assistant', '<strong>Choose your existing resume.</strong><br>I’ll extract PDF, DOCX, or TXT text locally, show it for review, and connect it to the existing Resume Tailor.');
    openResumeSetup();
    return;
  }
  if (/managed browser|application workspace|complete an application|apply demo/i.test(input)) {
    addMessage('assistant', '<strong>Opening a simulated employer application workspace.</strong> It demonstrates redacted autofill, targeted exception pauses, recovery, and receipt verification. No employer site is contacted and nothing is submitted.');
    if (activeApplicationSession()) openApplicationWorkspace(); else startSyntheticApplicationWorkspace();
    return;
  }
  if (/readiness|onboarding|autonomy|answer next|application question/i.test(input)) {
    const readiness = readinessStatus(deskState);
    addMessage('assistant', `<strong>Your application setup is ${readiness.score}% complete.</strong> I’ll ask one short question at a time and save confirmed answers for matching applications.`);
    openQuestionPopup();
    return;
  }
  if (/human action|action queue|blocker/i.test(input)) {
    openJobs();
    addMessage('assistant', guidanceHtml(currentGuidance()));
    return;
  }
  if (/approval|batch|desk|pipeline|package-ready|ready packages/i.test(input)) {
    openJobs();
    addMessage('assistant', guidanceHtml(currentGuidance()));
    return;
  }
  if (/show my jobs|open my jobs|retry job discovery/i.test(input)) {
    if (/retry job discovery/i.test(input)) discoverMatchingJobs(); else openJobs();
    return;
  }
  if (/review (?:my |the )?(?:current )?mission|what(?:’|')?s next|what should i do|status update|show progress/i.test(input)) {
    addMessage('assistant', guidanceHtml(currentGuidance()));
    return;
  }
  missionState.mission = parseMission(input, missionState.mission);
  if (/\b(?:per day|daily|each day|every day)\b/i.test(input)) dailyGoal = { target: missionState.mission.target, updatedAt: new Date().toISOString() };
  missionState.discovery = { status: 'ready' };
  saveAll(); renderMission();
  const readyToDiscover = missionGaps(missionState.mission, hasResume()).length === 0;
  if (readyToDiscover && /\b(find|search|start|discover)\b/i.test(input)) {
    discoverMatchingJobs();
    return;
  }
  askSmartConcierge(input);
}

function switchTab(name) {
  document.querySelectorAll('[data-desk-tab]').forEach(node => node.classList.toggle('active', node.dataset.deskTab === name));
  document.querySelectorAll('[data-desk-panel]').forEach(node => node.classList.toggle('active', node.dataset.deskPanel === name));
}
function openDesk(tab = 'truth') {
  if (!sessionCapabilities.adminConsole) return;
  $('deskOverlay').classList.add('open'); switchTab(tab); renderDesk();
}
function closeDesk() { $('deskOverlay').classList.remove('open'); }

function activeApplicationSession() {
  return deskState.applicationSessions.find(session => session.id === deskState.activeApplicationSessionId) || null;
}
function openApplicationWorkspace() {
  if (!activeApplicationSession()) throw new Error('Start a simulated application session first.');
  activeDurableApplicationSessionId = '';
  closeDesk();
  $('applicationOverlay').classList.add('open');
  renderApplicationWorkspace();
}
function openDurableApplicationWorkspace(sessionId) {
  if (!durableApplicationSessions.some(session => session.id === sessionId)) throw new Error('The saved application step could not be found.');
  activeDurableApplicationSessionId = sessionId;
  closeDesk(); closeJobs();
  $('applicationOverlay').classList.add('open');
  renderApplicationWorkspace();
  hydrateDurableBrowserHandoff(sessionId).catch(() => {});
}
function closeApplicationWorkspace() { $('applicationOverlay').classList.remove('open'); activeDurableApplicationSessionId = ''; }
function safeEmployerDestination(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname.endsWith('.test')) return null;
    return url;
  } catch { return null; }
}
function startSyntheticApplicationWorkspace(role = null) {
  const fixtureRole = role || {
    employer: 'Northstar Components', title: 'Procurement Analyst', requisitionId: 'DEMO-PA-104',
    directEmployerUrl: 'https://careers.example.test/jobs/DEMO-PA-104',
  };
  deskState = startManagedApplicationSession(deskState, {
    roleId: role?.id, role: fixtureRole, simulated: true, autonomyLevel: deskState.autonomy.level,
    batchAuthorizationName: 'Synthetic Batch 32',
    documentVersion: role?.packageEvidence?.documentVersion || role?.packageDraft?.documentVersion || 'synthetic-resume-v1',
  });
  const sessionId = deskState.activeApplicationSessionId;
  deskState = pauseManagedApplicationSession(deskState, sessionId, 'login-required');
  saveAll(); renderAll(); openApplicationWorkspace();
}

function durableApplicationStageLabel(stage) {
  return ({
    prepare_fields: 'Preparing verified fields', transmission_approval: 'Approval before sharing', employer_form: 'Employer form',
    final_review: 'Final review', submission_approval: 'Approval before submission', submission_execution: 'Submission permission saved', receipt_verification: 'Employer receipt verification',
  })[stage] || 'Saved application step';
}

function renderDurableBrowserHandoff(session) {
  $('applicationBrowserHandoff').hidden = false;
  const handoff = durableBrowserHandoff.applicationSessionId === session.id ? durableBrowserHandoff : { session: null, view: null, provider: null, status: 'idle', error: '' };
  const view = handoff.view;
  const providerAvailable = handoff.provider?.available === true;
  const active = Boolean(handoff.session && view && view.status === 'ready');
  const preview = safeBrowserPreview(view?.previewImageDataUrl);
  const stream = view?.interactive === true ? safeBrowserStream(view?.streamUrl, handoff.provider?.streamOrigin) : '';
  const streamFrame = browserStreamFrame();
  streamFrame.hidden = !stream;
  if (stream) streamFrame.src = stream; else streamFrame.removeAttribute('src');
  $('browserPreviewImage').hidden = !preview;
  if (preview) $('browserPreviewImage').src = preview; else $('browserPreviewImage').removeAttribute('src');
  $('browserPreviewPlaceholder').hidden = Boolean(preview || stream);
  $('browserHandoffMode').textContent = active
    ? (view.interactive ? 'Interactive secure stream' : 'Read-only local fixture')
    : handoff.status === 'loading' || handoff.status === 'starting' ? 'Connecting safely' : handoff.status === 'expired' ? 'Expired' : 'Not started';
  let status = 'A production browser stream is not configured. Your application checkpoint remains saved and no employer page is contacted.';
  if (handoff.status === 'loading') status = 'Checking for a resumable browser session…';
  else if (handoff.status === 'starting') status = 'Starting the isolated browser handoff…';
  else if (handoff.error) status = handoff.error;
  else if (active && view.interactive) status = 'This is the isolated employer page. Complete credentials and challenges only inside the verified employer stream.';
  else if (active) status = 'Synthetic local fixture only. It proves session restore and field layout without contacting an employer or accepting any personal value.';
  else if (providerAvailable) status = 'A no-cost local fixture is available to verify the resumable handoff experience.';
  $('browserHandoffStatus').textContent = status;
  $('browserHandoffFields').innerHTML = (view?.fields || []).slice(0, 12).map(field => `<div><strong>${escapeHtml(field.label)}</strong><span>${field.required ? 'Required field' : 'Optional field'} · value not included</span></div>`).join('') || '<div><strong>No extracted fields</strong><span>Field structure appears only after a secure preview starts.</span></div>';
  $('browserHandoffExpiry').textContent = active ? `Session expires ${new Date(handoff.session.expiresAt).toLocaleString()}` : 'No browser session is active.';
  $('startBrowserHandoff').hidden = active;
  $('startBrowserHandoff').disabled = !providerAvailable || ['loading', 'starting'].includes(handoff.status);
  $('refreshBrowserHandoff').hidden = !active;
  $('closeBrowserHandoff').hidden = !handoff.session;
}

function renderDurableApplicationWorkspace(session) {
  if (session.receipt) $('applicationBrowserHandoff').hidden = true;
  else renderDurableBrowserHandoff(session);
  const openAction = (session.actions || []).find(item => item.status === 'open');
  const employerDestination = safeEmployerDestination(session.role.directEmployerUrl);
  const employerSiteStep = ['LOGIN', 'DOCUMENT_UPLOAD', 'OTP', 'CAPTCHA', 'IDENTITY_VERIFICATION', 'AMBIGUOUS_FACT', 'NONSTANDARD_CERTIFICATION', 'OUTSIDE_EMPLOYMENT_CONFLICT'].includes(openAction?.type);
  const failureReconciliation = openAction?.type === 'EMPLOYER_ATS_FAILURE' && session.workerExecution?.status === 'outcome-unknown';
  const submissionOutcomeUnknown = openAction?.type === 'SUBMISSION_OUTCOME_UNKNOWN' && session.submissionExecution?.status === 'outcome-unknown';
  const checkpointFieldKeys = [...new Set(session.formCheckpoint?.stagedFieldKeys || [])].sort();
  const transmittedFieldKeys = [...new Set(session.transmissionAttempt?.transmittedFieldKeys || [])].sort();
  const finalReviewReady = session.state === 'Preparing' && ['employer_form', 'final_review'].includes(session.stage) && !openAction
    && session.formCheckpoint?.status === 'preserved'
    && session.formCheckpoint?.attachedDocumentVersion === session.documentVersion
    && session.formCheckpoint?.fieldSchemaHash === session.transmissionAttempt?.fieldSchemaHash
    && session.transmissionAttempt?.documentVersion === session.documentVersion
    && JSON.stringify(checkpointFieldKeys) === JSON.stringify(transmittedFieldKeys);
  const finalApprovalExpired = session.stage === 'submission_execution' && !session.submissionAttempt
    && session.approvals?.submission && !session.approvals.submission.consumedAt
    && Number.isFinite(new Date(session.approvals.submission.expiresAt).getTime())
    && new Date(session.approvals.submission.expiresAt).getTime() <= Date.now();
  const transmissionApproval = openAction?.type === 'TRANSMISSION_APPROVAL';
  const submissionApproval = openAction?.type === 'SUBMISSION_APPROVAL';
  $('applicationModeLabel').textContent = 'Controlled beta';
  $('resumeApplication').hidden = false;
  $('resumeApplication').textContent = openAction ? '1 item needs you' : 'Application update';
  $('applicationTitle').textContent = openAction ? 'One thing needs you' : session.state === 'Paused' ? 'Application paused safely' : 'Application saved';
  $('applicationSubtitle').textContent = `${session.role.employer} · ${session.role.title}`;
  $('applicationUrl').textContent = session.role.directEmployerUrl;
  $('applicationEmployerDomain').textContent = employerDestination?.hostname || 'Employer domain unavailable';
  $('verifiedEmployer').classList.remove('preview');
  $('verifiedEmployer').hidden = !(openAction || session.state === 'Paused');
  $('openEmployerPage').hidden = !(employerSiteStep || failureReconciliation || submissionOutcomeUnknown || session.stage === 'employer_form') || !employerDestination;
  if (employerDestination) {
    const extensionDestination = new URL(employerDestination.href);
    if (['boards.greenhouse.io', 'job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io'].includes(extensionDestination.hostname.toLowerCase())) {
      extensionDestination.hash = new URLSearchParams({ '1ststep-session': session.id, '1ststep-version': String(session.version) }).toString();
    }
    $('openEmployerPage').href = extensionDestination.href;
  }
  $('fixtureEmployer').textContent = session.role.employer;
  $('fixtureRole').textContent = session.role.title;
  $('fixtureStep').textContent = `Current step: ${durableApplicationStageLabel(session.stage)}`;
  $('documentStatus').textContent = `Package ${session.documentVersion} · exact version preserved`;
  $('applicationProgress').innerHTML = '';
  $('fixtureFields').innerHTML = (session.proposedFields || []).map(item => `<div class="fixture-field"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.maskedPreview)} · verified source</span></div>`).join('');
  $('applicationAgentStatus').innerHTML = `<strong>${escapeHtml(session.state)}</strong><br>${escapeHtml(durableApplicationStageLabel(session.stage))}. ${session.externalApplicationExecution === false ? 'No employer action has run.' : ''}`;
  $('applicationAuthorization').innerHTML = `<div class="workspace-row"><strong>${session.approvals?.transmission ? 'Sharing permission saved' : 'No sharing permission yet'}</strong><small>Permission is exact to this employer and ${escapeHtml(session.documentVersion)}. Final submission requires a separate confirmation.</small></div>`;
  $('applicationSuggestions').innerHTML = (session.proposedFields || []).map(item => `<div class="workspace-row"><strong>${escapeHtml(item.label)} → ${escapeHtml(item.maskedPreview)}</strong><small>${escapeHtml(item.provenance)} · ${Math.round(Number(item.confidence || 0) * 100)}% confidence</small></div>`).join('');
  $('applicationBlockers').innerHTML = (session.actions || []).filter(item => item.status === 'open').map(item => `<div class="workspace-row"><strong>${escapeHtml(item.type.replaceAll('_', ' '))}</strong><small>${escapeHtml(item.summary)}</small></div>`).join('') || empty('No current blocker.');
  $('applicationTimeline').innerHTML = [...(session.timeline || [])].reverse().map(item => `<div class="workspace-row"><strong>${escapeHtml(item.kind.replaceAll('_', ' '))}</strong><small>${escapeHtml(item.summary)} · ${escapeHtml(item.at)}</small></div>`).join('');
  $('applicationReceipt').innerHTML = session.receipt ? `<div class="workspace-row receipt-box"><strong>AUTHORITATIVE EMPLOYER RECEIPT · ${escapeHtml(session.receipt.confirmationId || 'verified')}</strong><small>${escapeHtml(session.documentVersion)} · ${escapeHtml(session.receipt.receivedAt || '')}</small></div>` : empty('No authoritative receipt. This application is not counted as Submitted.');

  let actionTitle = 'Application progress is preserved';
  let actionSummary = session.state === 'Paused'
    ? 'Resume when ready. No data is moving while this application is paused.'
    : 'The isolated employer-browser worker is not enabled yet. Your approved package and checkpoint remain saved; no personal data was transmitted.';
  if (transmissionApproval) {
    actionTitle = 'Share these application details?';
    actionSummary = `Approve only the masked verified fields shown and the exact package ${session.documentVersion} for ${session.role.employer}. This permission expires after 15 minutes and does not approve final submission.`;
  } else if (submissionApproval) {
    actionTitle = 'Submit this application?';
    actionSummary = `This is the final action-time confirmation for ${session.role.employer} and ${session.documentVersion}. A submission will count only after an authoritative employer receipt is verified.`;
  } else if (employerSiteStep) {
    const employerStepCopy = {
      LOGIN: ['Sign in on the employer page', 'Use your password manager or passkey only on the verified employer page. 1stStep never receives or stores it.'],
      DOCUMENT_UPLOAD: ['Upload the approved application document', `Upload the exact package ${session.documentVersion} on the verified employer page, then return here. The extension cannot select a local file for you.`],
      OTP: ['Complete verification on the employer page', 'Enter the latest code only on the verified employer page, then confirm completion here without sharing the code.'],
      CAPTCHA: ['Complete the security check', 'Solve the CAPTCHA only on the verified employer page, then confirm completion here.'],
      IDENTITY_VERIFICATION: ['Complete identity verification', 'Complete the employer-required identity step directly on its site. No identity document is stored by 1stStep.'],
      AMBIGUOUS_FACT: ['Answer this employer question', 'Answer directly on the verified employer page using facts you know are accurate. 1stStep will not infer, capture, or silently reuse this answer.'],
      NONSTANDARD_CERTIFICATION: ['Review this employer certification', 'Read the exact certification on the verified employer page and complete it only if it is accurate. 1stStep does not certify or sign for you.'],
      OUTSIDE_EMPLOYMENT_CONFLICT: ['Review this conflict question', 'Answer the exact employer question directly on its site based on your current obligations. 1stStep will not infer or retain the answer.'],
    };
    [actionTitle, actionSummary] = employerStepCopy[openAction.type];
    if (openAction.metadata?.riskCategory === 'eligibility-screening') {
      actionTitle = 'Review a potential eligibility screen';
      actionSummary = `${openAction.summary} 1stStep will not guess, change, or retain your answer.`;
    }
  } else if (failureReconciliation) {
    actionTitle = 'Check the saved employer form';
    actionSummary = 'The isolated fill started but its result could not be verified. Review the exact employer form, then tell us whether the approved fields are present. The agent will never retry automatically.';
  } else if (submissionOutcomeUnknown) {
    actionTitle = 'Check whether the employer received it';
    actionSummary = 'The final employer action started, but its result could not be verified. Do not submit again. Check the preserved employer page and wait for an authoritative receipt or status update.';
  } else if (finalReviewReady) {
    actionTitle = 'Your completed form is ready to review';
    actionSummary = `Review the exact preserved employer form and package ${session.documentVersion}. This step prepares a separate final-submission approval; it does not submit anything.`;
  } else if (finalApprovalExpired) {
    actionTitle = 'Your final approval expired safely';
    actionSummary = 'Nothing was submitted. Renew the permission, then review the separate final action-time confirmation again.';
  } else if (openAction) {
    actionTitle = 'A verified answer needs you';
    actionSummary = openAction.summary;
  }
  $('applicationActionTitle').textContent = actionTitle;
  $('applicationActionSummary').textContent = actionSummary;
  $('advanceApplication').hidden = session.state !== 'Preparing';
  $('advanceApplication').disabled = false;
  $('advanceApplication').textContent = 'Pause safely';
  $('advanceApplication').dataset.durableAction = session.state === 'Preparing' ? 'pause' : '';
  $('resolveApplication').hidden = !(transmissionApproval || submissionApproval || employerSiteStep || finalReviewReady || finalApprovalExpired);
  $('resolveApplication').textContent = transmissionApproval ? 'Approve sharing' : submissionApproval ? 'Approve final submission'
    : finalReviewReady ? 'Review final application'
    : finalApprovalExpired ? 'Renew final approval'
    : ['AMBIGUOUS_FACT', 'NONSTANDARD_CERTIFICATION', 'OUTSIDE_EMPLOYMENT_CONFLICT'].includes(openAction?.type) ? 'I answered this on the employer site' : 'I completed this on the employer site';
  $('resolveApplication').dataset.durableAction = transmissionApproval ? 'confirm-transmission' : submissionApproval ? 'confirm-submission' : finalReviewReady ? 'request-final-review' : finalApprovalExpired ? 'refresh-final-approval' : employerSiteStep ? 'confirm-external-step' : '';
  $('resolveApplication').dataset.applicationActionId = openAction?.id || '';
  $('resumeManagedApplication').hidden = session.state !== 'Paused';
  $('resumeManagedApplication').textContent = 'Resume saved application';
  $('resumeManagedApplication').dataset.durableAction = session.state === 'Paused' ? 'resume' : '';
  $('applicationRecoveryActions').hidden = !failureReconciliation;
  $('reconcileFieldsPresent').dataset.applicationActionId = failureReconciliation ? openAction.id : '';
  $('reconcileFieldsAbsent').dataset.applicationActionId = failureReconciliation ? openAction.id : '';
  const postSubmissionActions = $('postSubmissionActions');
  postSubmissionActions.hidden = !session.receipt;
  if (session.receipt) {
    const post = session.postSubmission || { status: 'SUBMITTED', followUp: { status: 'NOT_SCHEDULED' } };
    const followUp = post.followUp || { status: 'NOT_SCHEDULED' };
    const statusLabel = post.status === 'INTERVIEW' ? 'Interview confirmed' : post.status === 'REJECTED_CLOSED' ? 'Rejected / closed' : 'Receipt verified';
    $('applicationActionPill').textContent = statusLabel;
    $('applicationTitle').textContent = post.status === 'INTERVIEW' ? 'Interview recorded' : post.status === 'REJECTED_CLOSED' ? 'Application closed' : 'Application submitted';
    $('applicationActionTitle').textContent = followUp.status === 'SCHEDULED' ? `Follow-up reminder set for ${new Date(followUp.dueAt).toLocaleDateString()}` : 'What happened next?';
    $('applicationActionSummary').textContent = 'Keep your tracker current with one click. Outcomes are saved only from your confirmation and no employer message is sent.';
    $('applicationAgentStatus').innerHTML = `<strong>${escapeHtml(statusLabel)}</strong><br>Authoritative employer receipt preserved. Later outcomes are user-confirmed, never inferred.`;
    $('applicationPrivacy').innerHTML = '<strong>Submission receipt verified.</strong><span>These buttons update only your private tracker. They do not contact the employer or transmit personal data.</span>';
    $('verifiedEmployer').hidden = false;
    $('advanceApplication').hidden = true;
    $('resolveApplication').hidden = true;
    $('resumeManagedApplication').hidden = true;
    $('applicationRecoveryActions').hidden = true;
    const followUpButton = post.status === 'REJECTED_CLOSED' ? '' : followUp.status === 'SCHEDULED'
      ? '<button type="button" data-post-submission="FOLLOW_UP_COMPLETED">I handled the follow-up</button><button type="button" data-post-submission="FOLLOW_UP_SCHEDULED">Move reminder 7 days</button>'
      : '<button type="button" data-post-submission="FOLLOW_UP_SCHEDULED">Remind me in 7 days</button>';
    postSubmissionActions.innerHTML = `<button type="button" data-post-submission="INTERVIEW">I got an interview</button>${followUpButton}<button type="button" data-post-submission="REJECTED_CLOSED">Employer closed this</button>`;
  } else {
    $('applicationActionPill').textContent = openAction || finalReviewReady || finalApprovalExpired ? 'Needs You' : session.state;
    $('applicationPrivacy').innerHTML = submissionOutcomeUnknown
      ? '<strong>Submission result is unknown.</strong><span>The agent will not retry. This application remains uncounted until an authoritative employer receipt is verified.</span>'
      : '<strong>Nothing has been submitted.</strong><span>Your password, passkey, OTP, and CAPTCHA answers stay on the employer website. Your agent never stores or displays them.</span>';
  }
}

function renderApplicationWorkspace() {
  const durableSession = activeDurableApplicationSession();
  if (durableSession) { renderDurableApplicationWorkspace(durableSession); return; }
  $('applicationBrowserHandoff').hidden = true;
  $('postSubmissionActions').hidden = true;
  $('applicationActionPill').textContent = 'Needs You';
  $('applicationPrivacy').innerHTML = '<strong>Nothing has been submitted.</strong><span>Your password, passkey, OTP, and CAPTCHA answers stay on the employer website. Your agent never stores or displays them.</span>';
  const session = activeApplicationSession();
  $('resumeApplication').hidden = !session && !durableApplicationSessions.length;
  if (!session) {
    if (durableApplicationSessions.length) $('resumeApplication').textContent = durableApplicationSessions.some(item => (item.actions || []).some(action => action.status === 'open')) ? '1 item needs you' : 'Application update';
    return;
  }
  $('applicationModeLabel').textContent = 'Preview only';
  $('resumeApplication').textContent = session.status === 'paused' ? '1 item needs you' : 'Application update';
  $('applicationTitle').textContent = session.status === 'paused' ? 'One thing needs you' : 'Application update';
  $('applicationSubtitle').textContent = `${session.role.employer} · ${session.role.title}`;
  $('applicationUrl').textContent = session.role.directEmployerUrl.replace(/^https?:\/\//, 'https://');
  const employerDestination = safeEmployerDestination(session.role.directEmployerUrl);
  $('applicationEmployerDomain').textContent = employerDestination?.hostname || 'Preview employer domain';
  $('verifiedEmployer').classList.toggle('preview', !employerDestination);
  $('openEmployerPage').hidden = !employerDestination;
  if (employerDestination) $('openEmployerPage').href = employerDestination.href;
  $('fixtureEmployer').textContent = session.role.employer;
  $('fixtureRole').textContent = session.role.title;
  $('fixtureStep').textContent = `Current step: ${WORKFLOW_LABELS[session.step]}`;
  $('applicationProgress').innerHTML = APPLICATION_WORKFLOW_STEPS.map((step, index) => `<span class="${index < session.stepIndex ? 'done' : index === session.stepIndex ? 'current' : ''}">${escapeHtml(WORKFLOW_LABELS[step])}</span>`).join('');
  $('fixtureFields').innerHTML = session.suggestions.map(item => `<div class="fixture-field"><strong>${escapeHtml(item.field)}</strong><span>${escapeHtml(item.value)} · ${Math.round(item.confidence * 100)}% match</span></div>`).join('');
  $('documentStatus').textContent = session.documents.map(item => `${item.kind} ${item.version} · ${item.status}`).join(' · ');
  $('applicationAgentStatus').innerHTML = `<strong>${escapeHtml(session.checkpointStatus || session.status.replaceAll('_', ' '))}</strong><br>${escapeHtml(session.agentStatus)}`;
  const authorization = session.authorization || { batchName: 'No named authorization', covers: [], excludes: ['all external transmission'] };
  $('applicationAuthorization').innerHTML = `<div class="workspace-row"><strong>${escapeHtml(authorization.batchName)}</strong><small>Covers: ${escapeHtml(authorization.covers.join(', ') || 'none')}. Still pauses for: ${escapeHtml(authorization.excludes.join(', '))}. A blocker suspends only this application.</small></div>`;
  $('applicationSuggestions').innerHTML = session.suggestions.map(item => `<div class="workspace-row"><strong>${escapeHtml(item.field)} → ${escapeHtml(item.value)}</strong><small>${escapeHtml(item.source)} · ${Math.round(item.confidence * 100)}% semantic match</small></div>`).join('');
  $('applicationBlockers').innerHTML = session.blockers.length ? [...session.blockers].reverse().map(item => `<div class="workspace-row"><strong>${escapeHtml(item.type)} · ${escapeHtml(item.status)}</strong><small>${escapeHtml(item.summary)}</small></div>`).join('') : empty('No current blocker.');
  $('applicationTimeline').innerHTML = [...session.timeline].reverse().map(item => `<div class="workspace-row"><strong>${escapeHtml(WORKFLOW_LABELS[item.step])} · ${escapeHtml(item.kind)}</strong><small>${escapeHtml(item.summary)} · ${escapeHtml(item.at)}</small></div>`).join('');
  $('applicationReceipt').innerHTML = session.receipt ? `<div class="workspace-row receipt-box"><strong>SIMULATED RECEIPT · ${escapeHtml(session.receipt.confirmationId)}</strong><small>No employer transmission · ${escapeHtml(session.receipt.documentVersion)} · ${escapeHtml(session.receipt.receivedAt)}</small></div>` : empty('No authoritative receipt. The role cannot count as Submitted.');
  const targetedException = session.status === 'paused' && session.blockers.some(item => item.status === 'open' && item.type === 'NEW_QUESTION' && session.step === 'review_exception');
  const transmissionConfirmation = session.status === 'paused' && session.blockers.some(item => item.status === 'open' && item.type === 'TRANSMISSION_CONFIRMATION');
  const openBlocker = [...session.blockers].reverse().find(item => item.status === 'open');
  const secureEmployerStep = session.status === 'paused' && ['LOGIN', 'OTP', 'CAPTCHA', 'PASSWORD_RESET', 'PASSWORD_RESET_PENDING'].includes(openBlocker?.type);
  let actionTitle = 'Your agent is ready to continue';
  let actionSummary = 'Routine application work is handled automatically. Continue when you are ready.';
  if (secureEmployerStep) {
    const actionByType = {
      LOGIN: ['Sign in on the employer page', 'Open the verified employer page and sign in there. Automation remains paused while you use your password manager or passkey.'],
      OTP: ['Complete verification on the employer page', 'Enter the latest OTP directly on the employer page. Do not paste it into 1stStep.ai.'],
      CAPTCHA: ['Complete the employer security check', 'Solve the CAPTCHA directly on the employer page, then return here.'],
      PASSWORD_RESET: ['Reset your password on the employer page', 'Use the employer’s password-reset flow directly. Your agent will not attempt or store credentials.'],
      PASSWORD_RESET_PENDING: ['Check the employer’s reset message', 'Complete the employer’s password-reset flow directly, then return here.'],
    };
    [actionTitle, actionSummary] = actionByType[openBlocker.type] || ['Complete the secure employer step', openBlocker.summary];
  } else if (transmissionConfirmation) {
    actionTitle = 'Share your application details?';
    actionSummary = 'This step shares the staged contact details and tailored resume with this employer. Nothing is submitted yet.';
  } else if (targetedException) {
    actionTitle = 'One employer question needs your answer';
    actionSummary = openBlocker?.summary || 'Answer this once so your agent can continue this application.';
  } else if (session.status === 'paused') {
    actionTitle = 'This application is paused';
    actionSummary = openBlocker?.summary || 'Resume the saved step when you are ready.';
  } else if (session.status === 'complete') {
    actionTitle = 'Application finished';
    actionSummary = session.receipt ? 'A simulated receipt was recorded for this preview.' : 'The workflow is complete.';
  }
  $('applicationActionTitle').textContent = actionTitle;
  $('applicationActionSummary').textContent = actionSummary;
  $('advanceApplication').hidden = session.status !== 'active';
  $('advanceApplication').disabled = session.status !== 'active';
  $('advanceApplication').textContent = 'Continue';
  $('resolveApplication').hidden = !targetedException && !transmissionConfirmation;
  $('resolveApplication').textContent = transmissionConfirmation ? 'Confirm & continue' : 'Answer & continue';
  $('verifiedEmployer').hidden = !secureEmployerStep;
  $('openEmployerPage').hidden = !secureEmployerStep || !employerDestination;
  $('resumeManagedApplication').hidden = session.status !== 'paused' || targetedException || transmissionConfirmation;
  $('resumeManagedApplication').textContent = openBlocker?.type === 'LOGIN' ? 'I’m signed in — continue' : 'I completed this step — continue';
}

function openQuestionPopup(fieldKey = '') {
  const readiness = readinessStatus(deskState);
  const field = READINESS_FIELDS.find(([key]) => key === fieldKey);
  const next = readiness.unresolved.find(item => item.key === fieldKey) || (field ? { key: field[0], label: field[1] } : readiness.unresolved[0]);
  if (!next) {
    closeQuestionPopup();
    addMessage('assistant', '<strong>Application setup complete.</strong> I’ll reuse verified answers when wording and scope match, and pause only for targeted exceptions.');
    return;
  }
  activeQuestionKey = next.key;
  const corePosition = ONBOARDING_REQUIRED_FIELDS.findIndex(([key]) => key === next.key);
  const resumeRemaining = ['contact', 'employment', 'education', 'skills'].filter(key => readiness.unresolved.some(item => item.key === key)).length;
  $('questionProgress').textContent = resumeInterviewActive
    ? `Resume setup · ${resumeRemaining} essential answer${resumeRemaining === 1 ? '' : 's'} remaining`
    : corePosition >= 0 ? `Core setup ${corePosition + 1} of ${ONBOARDING_REQUIRED_FIELDS.length} · ${readiness.score}% ready` : 'Asked only when needed · not part of core setup';
  $('questionTitle').textContent = next.label;
  $('questionHelp').textContent = resumeInterviewActive
    ? 'Give only verified facts. For work history, include employer, title, dates, and truthful outcomes; use semicolons to separate entries.'
    : CONSEQUENTIAL_QUESTION_KEYS.has(next.key)
      ? 'Confirm only what you know. This answer is kept for review and is never silently reused or inferred.'
      : 'Choose a common answer or enter a short correction. This becomes reusable only after you save it.';
  $('questionValue').value = deskState.reusableFacts.find(item => item.fieldKey === next.key)?.value || '';
  const choices = QUICK_ANSWERS[next.key] || [];
  $('questionChoices').innerHTML = choices.map(value => `<button class="question-choice" type="button" data-question-answer="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join('');
  $('questionOverlay').classList.add('open');
  if (!choices.length) setTimeout(() => $('questionValue').focus(), 0);
}
function closeQuestionPopup() { $('questionOverlay').classList.remove('open'); activeQuestionKey = ''; }

function renderTruthForm() {
  const profile = deskState.truthProfile;
  const mapping = {
    truthWork: profile.workHistory.join('\n'), truthEducation: profile.education.join('\n'), truthSkills: profile.skills.join('\n'),
    truthAuthorization: profile.authorization, truthSponsorship: profile.sponsorship, truthGeography: profile.geography.join(', '),
    truthTravel: profile.travelTolerance, truthSalaryMin: profile.salaryMin || '', truthSalaryMax: profile.salaryMax || '',
    truthSchedule: profile.schedulePreferences.join(', '), truthTimezones: profile.timeZones.join(', '),
    truthPriorityRoles: profile.prioritizedRoleFamilies.join(', '), truthExcludedRoles: profile.excludedRoleFamilies.join(', '),
    truthExcludedEmployers: profile.excludedEmployers.join(', '), truthConflicts: profile.outsideEmploymentConstraints.join(', '),
    truthDisclosures: profile.disclosureChoices.join('\n'), truthUnknowns: profile.explicitUnknowns.join('\n'),
  };
  Object.entries(mapping).forEach(([id, value]) => { $(id).value = value; });
}

function renderReadiness() {
  const readiness = readinessStatus(deskState);
  $('readinessScore').textContent = `${readiness.score}%`;
  $('readinessSummary').textContent = readiness.complete
    ? `Core setup complete. ${readiness.targeted.length} employer-specific answer${readiness.targeted.length === 1 ? '' : 's'} will be requested only if a matching application needs them.`
    : `${readiness.unresolved.length} short core answer${readiness.unresolved.length === 1 ? '' : 's'} remaining. ${readiness.targeted.length} employer-specific item${readiness.targeted.length === 1 ? '' : 's'} are deferred until needed.`;
  $('unresolvedCount').textContent = `(${readiness.unresolved.length})`;
  $('autonomyLevel').value = deskState.autonomy.level;
  $('factField').innerHTML = READINESS_FIELDS.map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join('');
  $('unresolvedList').innerHTML = readiness.unresolved.length
    ? readiness.unresolved.map(item => `<div class="desk-row"><div><strong>${escapeHtml(item.label)}</strong><small>Needs an explicit confirmed value or policy.</small></div></div>`).join('')
    : empty('Core setup is complete. Employer-specific questions stay deferred until a matching application needs them.');
  $('factList').innerHTML = deskState.reusableFacts.length
    ? deskState.reusableFacts.map(fact => `<div class="desk-row"><div><strong>${escapeHtml(fact.label)}</strong><small>${escapeHtml(fact.value)} · ${escapeHtml(fact.verificationState)} · ${escapeHtml(fact.source)} · ${escapeHtml(fact.sensitivity)} · ${fact.autoReuse ? 'auto-reuse allowed in scope' : 'manual reuse only'}</small></div><div class="desk-actions"><button data-delete-fact="${fact.id}">Delete</button></div></div>`).join('')
    : empty('No confirmed reusable answers yet.');
  $('policyList').innerHTML = deskState.standingPolicies.length
    ? deskState.standingPolicies.map(policy => `<div class="desk-row"><div><strong>${escapeHtml(policy.policyKey)}</strong><small>${escapeHtml(policy.decision)} · confirmed ${escapeHtml(policy.updatedAt)}</small></div></div>`).join('')
    : empty('No standing authorizations confirmed.');
  const draft = deskState.readinessDraft;
  const pending = draft?.status === 'pending' && draft.proposals?.length;
  $('readinessDraftPanel').hidden = !pending;
  $('readinessDraftList').innerHTML = pending ? draft.proposals.map(proposal => `<div class="desk-row"><div><strong>${escapeHtml(proposal.label)}</strong><small>${escapeHtml(proposal.value)} · ${escapeHtml(proposal.source)} · proposed confidence ${Math.round(proposal.confidence * 100)}%</small></div></div>`).join('') : '';
}

function renderRoles() {
  const counts = pipelineCounts(deskState);
  $('deskCounts').innerHTML = Object.entries(counts).map(([status, count]) => `<span>${escapeHtml(status)} ${count}</span>`).join('');
  $('roleList').innerHTML = deskState.roles.length ? deskState.roles.map(role => {
    const verification = verificationGaps(role);
    const controls = [];
    if (role.status === 'Found') controls.push(`<button data-role-action="verify" data-role-id="${role.id}" ${verification.length ? 'disabled' : ''}>Verify</button>`);
    if (['Verified', 'Verified - Package Preparation'].includes(role.status) && !role.packageDraft) controls.push(`<button data-role-action="generate" data-role-id="${role.id}" ${!role.jobDescription || !hasResume() ? 'disabled' : ''}>${!role.jobDescription ? 'Job description needed' : !hasResume() ? 'Resume needed' : role.packageRunId ? 'Check durable package' : 'Prepare durable package'}</button>`);
    if (role.status === 'Verified - Package Preparation' && role.packageDraft) controls.push(`<button data-role-action="review-package" data-role-id="${role.id}">Review private package</button>`);
    if (role.status === 'Verified - Package Preparation' && role.packageDraft?.artifacts?.length && sessionCapabilities.adminConsole) controls.push(`<button data-role-action="render-package" data-role-id="${role.id}">Run isolated render QA</button>`);
    if (role.status === 'Package Ready') controls.push(`<button data-role-action="workspace" data-role-id="${role.id}">Preview application workspace</button>`);
    if (role.status !== 'Submitted' && role.status !== 'Blocked') controls.push(`<button data-role-action="block" data-role-id="${role.id}">Add blocker</button>`);
    if (role.status === 'Awaiting Approval') controls.push('<button disabled>Submission disabled</button>');
    const fit = role.fitScore == null ? 'Fit not scored' : `${role.fitScore}/100 ${role.fitClassification}${role.credibleInterviewPath ? ' · credible interview path' : ' · do not apply'}`;
    return `<div class="desk-row"><div><strong>${escapeHtml(role.employer)} · ${escapeHtml(role.title)}</strong><small>${escapeHtml(fit)}${role.fitRationale ? ` · ${escapeHtml(role.fitRationale)}` : ''}<br>${escapeHtml(role.status)} · ${escapeHtml(role.employmentType || 'Employment type unknown')} · Req ${escapeHtml(role.requisitionId || 'unknown')} · ${escapeHtml(role.directEmployerUrl)}${role.packageDraft ? ` · Draft ${escapeHtml(role.packageDraft.documentVersion)} · ${escapeHtml(role.packageDraft.source)}` : role.packageRunId ? ` · Package run ${escapeHtml(role.packageRunStatus || 'queued')}` : ''}${verification.length ? ` · Needs ${escapeHtml(verification.join(', '))}` : ''}${role.requiredGaps?.length ? ` · Required gaps: ${escapeHtml(role.requiredGaps.join(', '))}` : ' · Required gaps: none recorded'}${role.preferredGaps?.length ? ` · Preferred gaps: ${escapeHtml(role.preferredGaps.join(', '))}` : ''}${role.materialGaps?.length ? ` · Legacy gaps: ${escapeHtml(role.materialGaps.join(', '))}` : ''}</small></div><div class="desk-actions">${controls.join('')}</div></div>`;
  }).join('') : empty('No roles captured. Import the tracker or add verified direct-employer evidence.');
  if ($('sourceMemory')) $('sourceMemory').innerHTML = deskState.hiringEcosystem.length ? deskState.hiringEcosystem.map(source => `<div class="desk-row"><div><strong>${escapeHtml(source.employer)} · ${escapeHtml(source.ats)}</strong><small>${escapeHtml(source.structuredDiscoveryMethod)} · checked ${escapeHtml(source.lastChecked)} · requisitions ${escapeHtml((source.matchingOpenRequisitions || []).join(', ') || 'none')}</small></div></div>`).join('') : empty('No employer infrastructure learned yet.');
  if ($('funnelMetrics')) {
    const funnel = acquisitionFunnel(mergeAuthoritativeOutcomeEvidence(deskState.acquisitionOutcomes, durableApplicationSessions));
    $('funnelMetrics').textContent = funnel.verifiedSampleSize
      ? `Primary KPI: qualified application → recruiter screen. Receipt-verified sample ${funnel.verifiedSampleSize} · interview yield ${funnel.interviewYield}% · offer yield ${funnel.offerYield}%.`
      : 'Primary KPI: qualified application → recruiter screen. No receipt-verified outcome sample yet; yield is not calculated.';
  }
}

function renderApprovals() {
  $('batchList').innerHTML = deskState.approvalBatches.length ? deskState.approvalBatches.map(batch => `<div class="desk-row"><div><strong>${escapeHtml(batch.name)}</strong><small>${batch.roleSnapshots.map(role => `${escapeHtml(role.employer)} — ${escapeHtml(role.title)}`).join(' · ')} · ${escapeHtml(batch.status)}</small></div><div class="desk-actions">${batch.status === 'draft' ? `<button data-approve-batch="${batch.id}">Approve named batch</button>` : ''}</div></div>`).join('') : empty('No named batches. Standing authorization reduces routine prompts; batches remain available for exceptions or review mode.');
  $('actionList').innerHTML = deskState.actionQueue.length ? deskState.actionQueue.map(item => {
    const role = deskState.roles.find(entry => entry.id === item.roleId);
    return `<div class="desk-row"><div><strong>${escapeHtml(item.type)} · ${escapeHtml(role ? `${role.employer} — ${role.title}` : 'Unknown role')}</strong><small>${escapeHtml(item.summary || 'Human action required')} · ${escapeHtml(item.status)}</small></div><div class="desk-actions">${item.status === 'open' ? `<button data-resolve-action="${item.id}">Mark resolved</button>` : ''}</div></div>`;
  }).join('') : empty('No human actions queued. CAPTCHA, OTP, login, uploads, signatures, and new material questions appear here.');
}

function renderDemo() {
  const demo = deskState.demo;
  $('workflowReplay').innerHTML = REDACTED_WORKFLOW_REPLAY.map(event => `<div class="desk-row"><div><strong>${escapeHtml(event.employer)} · ${escapeHtml(event.requisitionId)}<span class="trace-kind">${escapeHtml(event.status)}</span></strong><small>${escapeHtml(event.evidence)} Candidate data is redacted; this is an acceptance fixture, not a live orchestration claim.</small></div></div>`).join('');
  $('advanceDemo').disabled = !demo || demo.stageIndex >= DEMO_STAGES.length - 1;
  if (!demo) {
    $('demoStage').textContent = 'Demo not started';
    $('demoSummary').textContent = 'Run a fixture-based walkthrough from readiness to interview follow-up.';
    $('demoTrace').innerHTML = empty('Choose an autonomy level and start the synthetic demo.');
    return;
  }
  $('demoAutonomy').value = demo.autonomyLevel;
  $('demoStage').textContent = `${demo.stageIndex + 1}/${DEMO_STAGES.length} · ${DEMO_STAGES[demo.stageIndex]}`;
  $('demoSummary').textContent = `${demo.candidate.name} is synthetic. ${demo.fixtures.length} fixture records; one duplicate. Transmission: none.${demo.simulatedReceipt ? ` Simulated receipt ${demo.simulatedReceipt.confirmationId}.` : ''}`;
  $('demoTrace').innerHTML = [...demo.trace].reverse().map(event => `<div class="desk-row"><div><strong>${escapeHtml(event.stage)}<span class="trace-kind">${escapeHtml(event.kind)}</span></strong><small>${escapeHtml(event.explanation)}</small></div></div>`).join('');
}

function renderAudit() {
  const worker = operationalMetrics?.backgroundWorker;
  const launch = operationalMetrics?.launchManifest;
  const launchEvidence = launch
    ? `<div class="desk-row"><div><strong>Launch mode · ${escapeHtml(String(launch.currentMode || 'unknown').replaceAll('-', ' '))}</strong><small>Signed beta: ${launch.capabilities?.signedBeta?.eligible === true ? 'eligible' : 'blocked'} · Package Ready: ${launch.capabilities?.packageReady?.eligible === true ? 'eligible' : 'blocked'} · Assisted application: ${launch.capabilities?.assistedApplication?.eligible === true ? 'eligible' : 'disabled'} · Final submission: ${launch.capabilities?.finalSubmission?.eligible === true ? 'eligible' : 'disabled'}${launch.capabilities?.signedBeta?.blockers?.length ? ` · signed beta blockers: ${launch.capabilities.signedBeta.blockers.map(value => escapeHtml(String(value).replaceAll('_', ' ').toLowerCase())).join(', ')}` : ''}${launch.capabilities?.assistedApplication?.blockers?.length ? ` · assisted blockers: ${launch.capabilities.assistedApplication.blockers.map(value => escapeHtml(String(value).replaceAll('_', ' ').toLowerCase())).join(', ')}` : ''}${launch.capabilities?.finalSubmission?.blockers?.length ? ` · submission blockers: ${launch.capabilities.finalSubmission.blockers.map(value => escapeHtml(String(value).replaceAll('_', ' ').toLowerCase())).join(', ')}` : ''}</small></div></div>`
    : '';
  const runtime = operationalMetrics?.runtimeConfiguration;
  const runtimeStages = runtime?.summary?.stages;
  const runtimeEvidence = runtime?.contentFree === true && runtime?.containsSecretValues === false && runtimeStages
    ? `<div class="desk-row"><div><strong>Runtime configuration · ${runtime.authoritativeProductionRuntimeEvidence === true ? 'deployed production evidence' : 'candidate-process evidence only'}</strong><small>Signed beta: ${Math.max(0, Number(runtimeStages.signedBeta?.blockerCount) || 0)} blockers · Package Ready: ${Math.max(0, Number(runtimeStages.packageReady?.blockerCount) || 0)} blockers · Assisted application: ${Math.max(0, Number(runtimeStages.assistedApplication?.blockerCount) || 0)} blockers · Final submission: ${Math.max(0, Number(runtimeStages.finalSubmission?.blockerCount) || 0)} blockers · ${Math.max(0, Number(runtime.summary.readyControls) || 0)} of ${Math.max(0, Number(runtime.summary.totalControls) || 0)} control groups ready.${runtime.summary.nextAction?.summary ? ` Next: ${escapeHtml(runtime.summary.nextAction.summary)}` : ''} No environment names, values, secrets, tenant identifiers, or candidate data are shown.</small></div></div>`
    : runtime ? `<div class="desk-row"><div><strong>Runtime configuration unavailable</strong><small>The response did not satisfy the content-free evidence contract. Treat every launch stage as blocked.</small></div></div>` : '';
  const ownership = launch?.supportAndIncidentOwnership;
  const ownershipEvidence = ownership
    ? `<div class="desk-row"><div><strong>Support and incident ownership · ${ownership.ready === true ? 'ready' : 'blocked'}</strong><small>Support owner: ${ownership.supportOwnerAssigned === true ? 'assigned' : 'missing'} · Incident owner: ${ownership.incidentOwnerAssigned === true ? 'assigned' : 'missing'} · Contract: ${escapeHtml(ownership.contractVersion || 'not approved')} · Coverage: ${escapeHtml(ownership.coveragePolicyVersion || 'not approved')} · Escalation: ${escapeHtml(ownership.escalationPolicyVersion || 'not approved')} · Runbook: ${escapeHtml(ownership.runbookVersion || 'not approved')} · reviewed fingerprint: ${ownership.runbookFingerprintMatches === true ? 'matched' : 'not matched'}. Owner identifiers are not exposed.</small></div></div>`
    : '';
  const workerMetrics = worker
    ? `<div class="desk-row"><div><strong>Background worker · ${escapeHtml(worker.status || 'unknown')}</strong><small>${worker.lastSeenAt ? `Last content-free heartbeat ${escapeHtml(worker.lastSeenAt)} · outcome ${escapeHtml(worker.outcome || 'unknown')} · age ${Math.max(0, Number(worker.ageSeconds) || 0)} seconds.` : 'No authoritative heartbeat is available; scheduler health is unknown.'}</small></div></div>`
    : '';
  const metrics = operationalMetrics?.totals
    ? `<div class="desk-row"><div><strong>Operational health · content-free · last 2 UTC days</strong><small>${Object.entries(operationalMetrics.totals).map(([event, count]) => `${escapeHtml(event.replaceAll('_', ' '))}: ${Number(count) || 0}`).join(' · ')}</small></div></div>`
    : operationalMetrics?.unavailable ? `<div class="desk-row"><div><strong>Operational health unavailable</strong><small>Current aggregate failure counts are unknown. Candidate content was not inspected.</small></div></div>` : '';
  const queueHealth = operationalMetrics?.queueHealth;
  const queueEvidence = queueHealth?.contentFree === true
    ? `<div class="desk-row"><div><strong>Operational queues · aggregate only</strong><small>Submission: ${escapeHtml(queueHealth.submission?.status || 'unknown')} · ${Math.max(0, Number(queueHealth.submission?.pending) || 0)} pending · ${Math.max(0, Number(queueHealth.submission?.overdue) || 0)} overdue · ${Math.max(0, Number(queueHealth.submission?.reconciliationPending) || 0)} reconciliation pending · ${Math.max(0, Number(queueHealth.submission?.reconciliationDue) || 0)} reconciliation due. Receipt: ${escapeHtml(queueHealth.receipt?.status || 'unknown')} · ${Math.max(0, Number(queueHealth.receipt?.pending) || 0)} pending · ${Math.max(0, Number(queueHealth.receipt?.overdue) || 0)} overdue. Account export: ${escapeHtml(queueHealth.accountExport?.status || 'unknown')} · ${Math.max(0, Number(queueHealth.accountExport?.pending) || 0)} pending · ${Math.max(0, Number(queueHealth.accountExport?.overdue) || 0)} overdue. No tenant, employer, application, or account identifiers are included.</small></div></div>`
    : '';
  const usage = operationalMetrics?.providerUsageEvidence;
  const costEvidence = usage
    ? `<div class="desk-row"><div><strong>Provider usage evidence</strong><small>${Number(usage.requests) || 0} completed requests · ${Number(usage.inputTokens) || 0} input tokens · ${Number(usage.outputTokens) || 0} output tokens · dollar cost unknown until provider invoice reconciliation</small></div></div>`
    : '';
  const caps = operationalMetrics?.costControls?.caps;
  const costCaps = caps
    ? `<div class="desk-row"><div><strong>Configured hard ceilings · weighted units, not dollars</strong><small>${Object.entries(caps).map(([name, value]) => `${escapeHtml(name.replaceAll(/([A-Z])/g, ' $1').toLowerCase())}: ${value == null ? 'not configured' : Number(value)}`).join(' · ')}</small></div></div>`
    : '';
  const localAudit = deskState.auditEvents.length ? [...deskState.auditEvents].reverse().map(event => `<div class="desk-row"><div><strong>${escapeHtml(event.type)}</strong><small>${escapeHtml(event.at)} · ${escapeHtml(event.entityId)} · ${escapeHtml(JSON.stringify(event.details))}</small></div></div>`).join('') : empty('No local audit events yet.');
  $('auditList').innerHTML = `${launchEvidence}${runtimeEvidence}${ownershipEvidence}${workerMetrics}${queueEvidence}${costEvidence}${costCaps}${metrics}${localAudit}`;
}
function renderDesk() { renderTruthForm(); renderReadiness(); renderRoles(); renderApprovals(); renderDemo(); renderAudit(); }
function campaignListHtml(values) {
  return values?.length ? values.map(value => `<li>${escapeHtml(value)}</li>`).join('') : '<li class="contract-empty">Not configured</li>';
}

function activeCampaign() {
  return campaignStore.campaigns.find(campaign => campaign.id === campaignStore.activeCampaignId) || campaignStore.campaigns[0] || null;
}

function renderCampaignConsole() {
  renderCampaignSyncStatus();
  const campaign = activeCampaign();
  const metrics = campaign ? campaignMetrics(campaignStore, campaign.id) : { queue: 0, discovered: 0, verified: 0, ready: 0, humanAction: 0, completed: 0 };
  $('metricQueue').textContent = metrics.queue;
  $('metricDiscovered').textContent = metrics.discovered;
  $('metricVerified').textContent = metrics.verified;
  $('metricReady').textContent = metrics.ready;
  $('metricHuman').textContent = metrics.humanAction;
  $('metricComplete').textContent = metrics.completed;
  if (!campaign) return;
  $('campaignName').textContent = campaign.name;
  $('campaignObjective').textContent = campaign.objective;
  $('campaignStatus').textContent = campaign.status === 'paused' ? 'PAUSED' : 'DESIGN MODE';
  if (campaign.status === 'completed') $('campaignStatus').textContent = 'COMPLETED';
  $('campaignSchedule').textContent = `${campaign.cadence.recurrence} · ${campaign.cadence.timezone} · scheduler not connected`;
  const targets = Object.entries(campaign.targets).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' · ');
  $('contractCadence').textContent = [campaign.cadence.recurrence, campaign.cadence.allowedRunWindow, targets].filter(Boolean).join(' · ') || 'Not configured';
  $('contractCadence').classList.toggle('contract-empty', !$('contractCadence').textContent || $('contractCadence').textContent === 'Not configured');
  $('contractRules').innerHTML = campaignListHtml(campaign.hardRules);
  $('contractAuthorization').innerHTML = campaignListHtml(campaign.standingAuthorization);
  $('contractHuman').innerHTML = campaignListHtml(campaign.humanActionTriggers);
  $('contractEvidence').innerHTML = campaignListHtml(campaign.evidenceRules);
  $('contractStop').innerHTML = campaignListHtml(campaign.stopConditions);
  $('editCampaign').hidden = false;
  $('exportCampaign').hidden = false;
  $('pauseCampaign').hidden = campaign.status !== 'design';
  $('resumeCampaign').hidden = campaign.status !== 'paused';
  $('stopCampaign').hidden = campaign.status === 'completed';
  const actions = campaignStore.humanActions.filter(action => action.campaignId === campaign.id && action.status === 'open');
  $('humanActionCount').textContent = `${actions.length} open`;
  $('campaignHumanActions').className = actions.length ? 'desk-list' : 'panel-empty';
  $('campaignHumanActions').innerHTML = actions.length ? actions.map(action => `<div class="desk-row"><div><strong>${escapeHtml(action.blockerType)}</strong><small>${escapeHtml(action.reason)} · ${escapeHtml(action.requiredUserAction)}</small></div><span class="status design">${escapeHtml(action.priority)}</span></div>`).join('') : 'Nothing is waiting on you. Blocked items will appear here without stopping unrelated work.';
  const runs = campaignStore.runs.filter(run => run.campaignId === campaign.id);
  $('campaignRuns').className = runs.length ? '' : 'panel-empty';
  $('campaignRuns').innerHTML = runs.length ? `<table class="ledger-table"><thead><tr><th>Started</th><th>Status</th><th>Complete</th><th>Errors</th></tr></thead><tbody>${runs.map(run => `<tr><td>${escapeHtml(run.startedAt)}</td><td>${escapeHtml(run.status)}</td><td>${run.counts.completed}</td><td>${run.counts.errors}</td></tr>`).join('')}</tbody></table>` : 'No runs. Scheduling and external execution are not connected in this preview.';
  const transitions = campaignStore.transitions.filter(event => event.campaignId === campaign.id);
  $('campaignEvidence').className = transitions.length ? 'desk-list' : 'panel-empty';
  $('campaignEvidence').innerHTML = transitions.length ? transitions.map(event => `<div class="desk-row"><div><strong>${escapeHtml(event.previousStatus)} → ${escapeHtml(event.newStatus)}</strong><small>${escapeHtml(event.timestamp)}${event.evidenceId ? ` · evidence ${escapeHtml(event.evidenceId)}` : ''}</small></div></div>`).join('') : 'No evidence events. “Verified Complete” requires a timestamp, source, reference, and verification method.';
}

function renderCampaignWizard() {
  document.querySelectorAll('.wizard-step').forEach((step, index) => step.classList.toggle('active', index === campaignWizardStep));
  $('wizardProgress').innerHTML = Array.from({ length: 8 }, (_, index) => `<i class="${index < campaignWizardStep ? 'done' : index === campaignWizardStep ? 'current' : ''}"></i>`).join('');
  $('wizardStepLabel').textContent = `Step ${campaignWizardStep + 1} of 8`;
  $('campaignBack').disabled = campaignWizardStep === 0;
  $('campaignNext').hidden = campaignWizardStep === 7;
  $('campaignSave').hidden = campaignWizardStep !== 7;
}

function seedCampaignTemplate(templateId) {
  const template = CAMPAIGN_TEMPLATES.find(item => item.id === templateId);
  if (!template) {
    ['campaignDraftName', 'campaignDraftObjective', 'campaignRules', 'campaignAuthorization', 'campaignTriggers', 'campaignEvidenceRules', 'campaignStop'].forEach(id => { $(id).value = ''; });
    return;
  }
  $('campaignDraftName').value = template.name;
  $('campaignDraftObjective').value = template.objective;
  $('campaignRules').value = template.hardRules.join('\n');
  $('campaignAuthorization').value = template.standingAuthorization.join('\n');
  $('campaignTriggers').value = template.humanActionTriggers.join('\n');
  $('campaignEvidenceRules').value = template.evidenceRules.join('\n');
  $('campaignStop').value = template.stopConditions.join('\n');
}

function openCampaignWizard(campaign = null) {
  campaignWizardStep = 0;
  editingCampaignId = campaign?.id || null;
  $('campaignForm').reset();
  $('campaignTimezone').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (campaign) {
    $('campaignType').value = CAMPAIGN_TEMPLATES.find(template => template.campaignType === campaign.campaignType)?.id || 'custom';
    $('campaignDraftName').value = campaign.name;
    $('campaignDraftObjective').value = campaign.objective;
    $('campaignTimezone').value = campaign.cadence.timezone;
    $('campaignRecurrence').value = campaign.cadence.recurrence;
    $('campaignWindow').value = campaign.cadence.allowedRunWindow;
    $('campaignReportTime').value = campaign.cadence.reportingTime;
    $('campaignDailyTarget').value = campaign.targets.dailyTarget || '';
    $('campaignRunTarget').value = campaign.targets.runTarget || '';
    $('campaignPriorities').value = campaign.priorities.join('\n');
    $('campaignRules').value = campaign.hardRules.join('\n');
    $('campaignExclusions').value = campaign.exclusions.join('\n');
    $('campaignAuthorization').value = campaign.standingAuthorization.join('\n');
    $('campaignTriggers').value = campaign.humanActionTriggers.join('\n');
    $('campaignEvidenceRules').value = campaign.evidenceRules.join('\n');
    $('campaignReporting').value = campaign.reportingRequirements.join('\n');
    $('campaignStop').value = campaign.stopConditions.join('\n');
    $('campaignAdvanced').value = campaign.description;
  } else seedCampaignTemplate($('campaignType').value);
  renderCampaignWizard();
  $('campaignOverlay').classList.add('open');
}

function currentWizardStepValid() {
  const required = [...document.querySelector(`.wizard-step[data-step="${campaignWizardStep}"]`).querySelectorAll('[required]')];
  const invalid = required.find(field => !field.checkValidity());
  if (invalid) invalid.reportValidity();
  return !invalid;
}

function renderAll() { renderMission(); renderDesk(); renderApplicationWorkspace(); renderCampaignConsole(); renderVaultStatus(); renderLearningCenter(); }

function setDailyGoal(value, announce = true) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return;
  const target = Math.min(50, parsed);
  dailyGoal = { target, updatedAt: new Date().toISOString() };
  saveAll();
  renderMission();
  if (announce) addMessage('assistant', `<strong>Daily goal set to ${target} applications.</strong><br>I’ll show prepared packages separately and count progress only after an authoritative employer receipt.`);
}

$('openGuidedLaunch').addEventListener('click', () => openGuidedLaunch({ step: missionState.mission?.role ? 2 : guidedLaunchStep }));
$('guidedLaunchClose').addEventListener('click', closeGuidedLaunch);
$('guidedLaunchBack').addEventListener('click', () => {
  guidedLaunchStep = Math.max(0, guidedLaunchStep - 1);
  saveGuidedLaunchDraft(); renderMission();
});
$('guidedLaunchNext').addEventListener('click', advanceGuidedLaunch);
$('guidedLaunchOverlay').addEventListener('click', event => { if (event.target === $('guidedLaunchOverlay')) closeGuidedLaunch(); });
function chooseGuidedGoal(button, advance = false) {
  guidedSelection.goal = button.dataset.guidedGoal;
  saveGuidedLaunchDraft(); renderMission();
  if (advance) setTimeout(advanceGuidedLaunch, 160);
}

function chooseGuidedLaunchChoice(button, advance = false) {
  const key = button.dataset.launchChoice;
  guidedSelection[key] = key === 'salary' ? Number(button.dataset.value) : button.dataset.value;
  if (key === 'workMode' && guidedSelection.workMode === 'Remote') guidedSelection.location = 'United States';
  if (key === 'workMode' && guidedSelection.workMode !== 'Remote' && guidedSelection.location === 'United States') {
    guidedSelection.location = '';
    $('launchLocation').value = '';
  }
  missionState.pathScan = null;
  saveGuidedLaunchDraft(); renderMission();
  if (!advance) return;
  if (key === 'workMode' && guidedSelection.workMode !== 'Remote' && !$('launchLocation').value) $('launchLocation').focus();
  const stageForKey = { workMode: 'work', employmentType: 'employment', salary: 'salary' }[key];
  const canAdvance = stageForKey === GUIDED_LAUNCH_STAGES[guidedLaunchStep] && (key !== 'workMode' || guidedSelection.workMode === 'Remote');
  if (canAdvance) setTimeout(advanceGuidedLaunch, 160);
}

function handleGuidedRadioKeydown(event) {
  const supportedKeys = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'];
  if (!supportedKeys.includes(event.key)) return;
  const group = event.currentTarget.closest('[role="radiogroup"]');
  const radios = group ? [...group.querySelectorAll('[role="radio"]')] : [];
  if (!radios.length) return;
  const currentIndex = Math.max(0, radios.indexOf(event.currentTarget));
  const nextIndex = event.key === 'Home' ? 0
    : event.key === 'End' ? radios.length - 1
      : (currentIndex + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + radios.length) % radios.length;
  const target = radios[nextIndex];
  event.preventDefault();
  if (target.hasAttribute('data-guided-goal')) chooseGuidedGoal(target);
  else chooseGuidedLaunchChoice(target);
  setTimeout(() => target.focus(), 0);
}

document.querySelectorAll('[data-guided-goal]').forEach(button => {
  button.addEventListener('click', () => chooseGuidedGoal(button, true));
  button.addEventListener('keydown', handleGuidedRadioKeydown);
});
$('quickUploadResume').addEventListener('click', openResumeSetup);
$('quickBuildResume').addEventListener('click', () => {
  guidedLaunchOpen = false;
  renderGuidedLaunch();
  startCareerStory();
  $('agentConversation').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('scanOpportunityPaths').addEventListener('click', scanOpportunityPaths);
$('jobSectorFilter').addEventListener('change', event => {
  opportunitySector = event.target.value;
  const current = selectedOpportunityPath();
  if (opportunitySector !== 'recommended' && opportunitySector !== 'all' && current?.sector !== opportunitySector) {
    guidedSelection.pathId = OPPORTUNITY_PATHS.find(path => path.sector === opportunitySector)?.id || guidedSelection.pathId;
  }
  renderOpportunityPaths();
});
$('opportunityPaths').addEventListener('click', event => {
  const button = event.target.closest('[data-opportunity-path]');
  if (!button) return;
  guidedSelection.pathId = button.dataset.opportunityPath;
  saveGuidedLaunchDraft(); renderOpportunityPaths(); renderGuidedLaunch();
  if (GUIDED_LAUNCH_STAGES[guidedLaunchStep] === 'path') setTimeout(advanceGuidedLaunch, 160);
});
document.querySelectorAll('[data-launch-choice]').forEach(button => {
  button.addEventListener('click', () => chooseGuidedLaunchChoice(button, true));
  button.addEventListener('keydown', handleGuidedRadioKeydown);
});
$('launchLocation').addEventListener('input', event => { guidedSelection.location = event.target.value.trim(); saveGuidedLaunchDraft(); renderOpportunityPaths(); renderGuidedLaunch(); });
$('jobLaunchForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!hasJobAgentAccess()) { openAgentAccess(); return; }
  const path = selectedOpportunityPath();
  if (!hasResume()) { openResumeSetup(); return; }
  if (!path) { $('pathStepTitle').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const location = guidedSelection.workMode === 'Remote' ? 'United States' : $('launchLocation').value.trim();
  if (!location) {
    $('launchLocation').setCustomValidity('Add a city or commuting area for hybrid or on-site roles.');
    $('launchLocation').reportValidity(); $('launchLocation').focus(); return;
  }
  $('launchLocation').setCustomValidity('');
  const continueLaunch = async () => {
    const baseMission = {
      ...(missionState.mission || {}), target: Math.min(50, Math.max(1, Number(dailyGoal.target) || 10)), searchGoal: guidedSelection.goal,
      role: path.searchRole, roleFamily: path.id, roleFamilies: path.terms,
      workMode: guidedSelection.workMode, workModes: [guidedSelection.workMode],
      employmentTypes: [guidedSelection.employmentType], salaryMin: guidedSelection.salary || null, location,
    };
    const detail = $('jobRequest').value.trim();
    missionState.mission = detail ? parseMission(`job search preferences: ${detail}`, baseMission) : baseMission;
    try { await saveConfirmedLaunchPreferences(); }
    catch (error) { addMessage('assistant', `<strong>Your search criteria are saved, but the Learning Center did not sync.</strong><br>${escapeHtml(error.message)} The agent will keep the current mission and ask before replacing a confirmed rule.`); }
    missionState.discovery = { status: 'ready' };
    missionState.onboardingDraft = null;
    guidedLaunchOpen = false;
    saveAll(); renderMission();
    const summary = `${path.label} · ${guidedSelection.workMode} · ${guidedSelection.employmentType}${guidedSelection.salary ? ` · $${Math.round(guidedSelection.salary / 1000)}K+` : ''}`;
    addMessage('user', escapeHtml(`Start my agent: ${summary}`));
    syncJobAgentSchedule(missionState.mission, $('dailyBackgroundSearch').checked).then(() => {
      if ($('dailyBackgroundSearch').checked) showToast('Daily search scheduled');
    }).catch(error => addMessage('assistant', `<strong>Your search can run now, but daily background search is not active.</strong><br>${escapeHtml(error.message)} You can retry from Saved Info; no application was submitted.`));
    if ($('emailNeedsYouAlerts').checked) syncNeedsYouNotifications(true).then(() => showToast('Private Needs You emails enabled')).catch(error => {
      $('emailNeedsYouAlerts').checked = false;
      addMessage('assistant', `<strong>Your search can run, but email alerts are off.</strong><br>${escapeHtml(error.message)} The in-app Needs You queue still works.`);
    });
    discoverMatchingJobs();
    $('agentConversation').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  if (await ensureJobAgentConsent(continueLaunch)) await continueLaunch();
});
$('dailyGoalForm').addEventListener('submit', event => { event.preventDefault(); setDailyGoal($('dailyGoalInput').value); });
document.querySelectorAll('[data-daily-goal]').forEach(button => button.addEventListener('click', () => setDailyGoal(button.dataset.dailyGoal)));
$('activity').querySelector('summary').addEventListener('click', () => {
  if (!$('activity').open) setTimeout(() => $('activity').scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
});
$('openLearningVault').addEventListener('click', () => { $('vaultOverlay').classList.add('open'); renderVaultStatus(); });
$('toggleLearning').addEventListener('click', async event => {
  event.target.disabled = true;
  try { await learningAction(jobAgentLearning.learning?.status === 'active' ? 'pause' : 'resume'); showToast(jobAgentLearning.learning?.status === 'active' ? 'Learning resumed' : 'Learning paused'); }
  catch (error) { showToast(error.message); }
  finally { event.target.disabled = false; }
});
$('exportLearning').addEventListener('click', () => {
  if (!jobAgentLearning.learning) return;
  const blob = new Blob([JSON.stringify({ learning: jobAgentLearning.learning, facts: jobAgentLearning.facts }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `1ststep-learned-profile-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
});
$('rollbackLearning').addEventListener('click', async event => {
  const version = event.target.dataset.version;
  if (!version || !window.confirm('Restore the prior verified learning policy? Your confirmed facts and applications will not change.')) return;
  event.target.disabled = true;
  try { await learningAction('rollback', { version }); showToast('Previous learning policy restored'); }
  catch (error) { showToast(error.message); }
  finally { event.target.disabled = false; }
});
$('deleteLearning').addEventListener('click', async event => {
  if (!window.confirm('Delete your learned preferences, source history, proposals, and learning audit? Your applicant vault and applications remain separate.')) return;
  event.target.disabled = true;
  try {
    const response = await fetchWithTimeout('/api/job-agent-learning', { method: 'DELETE', headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    if (!response.ok) throw new Error('The learned profile could not be deleted.');
    jobAgentLearning = { version: 0, learning: null, facts: [], status: 'synced' }; renderLearningCenter(); showToast('Learned profile deleted');
  } catch (error) { showToast(error.message); }
  finally { event.target.disabled = false; }
});
$('learningCenter').addEventListener('click', async event => {
  const correctId = event.target?.dataset?.learningCorrect;
  const revokeId = event.target?.dataset?.learningRevoke;
  const approveId = event.target?.dataset?.learningApprove;
  if (correctId) {
    const preference = jobAgentLearning.learning?.preferences?.find(item => item.id === correctId);
    const value = window.prompt(`Correct ${preference?.label || 'this preference'}. This confirmed value will apply to future matching.`, learnedValuePreview(preference?.normalizedValue));
    if (value == null || !value.trim()) return;
    event.target.disabled = true;
    try { await learningAction('correct-preference', { id: correctId, value, originalSource: 'Learning Center user correction' }); applyCorrectedPreferenceLocally(preference, value); showToast('Preference corrected'); } catch (error) { showToast(error.message); } finally { event.target.disabled = false; }
  }
  if (revokeId && window.confirm('Stop using this preference in future job searches?')) {
    event.target.disabled = true;
    try { await learningAction('revoke-preference', { id: revokeId }); showToast('Preference revoked'); } catch (error) { showToast(error.message); } finally { event.target.disabled = false; }
  }
  if (approveId && window.confirm('Approve this evaluated high-risk change? This does not authorize data transmission or application submission.')) {
    event.target.disabled = true;
    try { await learningAction('approve-proposal', { id: approveId }); showToast('Learning change approved'); } catch (error) { showToast(error.message); } finally { event.target.disabled = false; }
  }
});
$('composer').addEventListener('submit', event => { event.preventDefault(); const input = $('messageInput'); const value = input.value.trim(); if (!value) return; addMessage('user', escapeHtml(value)); input.value = ''; respond(value); });
$('messages').addEventListener('click', event => { const value = event.target?.dataset?.prompt; if (!value) return; addMessage('user', escapeHtml(value)); respond(value); });
$('openJobs').addEventListener('click', () => openJobs('Matches'));
$('openNeedsYou').addEventListener('click', openNeedsYou);
$('openAgentStatus').addEventListener('click', () => { $('agentProgress').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('agentProgress').focus?.(); });
$('editAgentConfiguration').addEventListener('click', () => openGuidedLaunch({ step: 2 }));
$('openAgentAccess').addEventListener('click', openAgentAccess);
$('closeAgentAccess').addEventListener('click', closeAgentAccess);
$('agentAccessOverlay').addEventListener('click', event => { if (event.target === $('agentAccessOverlay')) closeAgentAccess(); });
$('agentAccessForm').addEventListener('submit', submitAgentAccess);
$('jobAgentConsentForm').addEventListener('submit', submitJobAgentConsent);
$('cancelJobAgentConsent').addEventListener('click', () => closeJobAgentConsent());
$('jobAgentConsentOverlay').addEventListener('click', event => { if (event.target === $('jobAgentConsentOverlay')) closeJobAgentConsent(); });
$('signOutAgent').addEventListener('click', () => signOutAgent(false).catch(error => showDeskMessage(error.message, true)));
$('signOutAgentEverywhere').addEventListener('click', () => signOutAgent(true).catch(error => showDeskMessage(error.message, true)));
$('downloadAccountData').addEventListener('click', () => downloadAccountData().catch(error => { $('agentAccessMessage').textContent = error.message; $('agentAccessMessage').className = 'warn'; }).finally(() => { $('downloadAccountData').disabled = false; $('downloadAccountData').textContent = 'Download my cloud data'; }));
$('deleteAccountData').addEventListener('click', () => deleteAccountData().catch(error => { $('agentAccessMessage').textContent = error.message; $('agentAccessMessage').className = 'warn'; }));
$('closeJobs').addEventListener('click', closeJobs);
$('jobsOverlay').addEventListener('click', event => { if (event.target === $('jobsOverlay')) closeJobs(); });
$('jobTabs').addEventListener('click', event => {
  const button = event.target.closest('[data-job-tab]');
  if (!button) return;
  activeJobTab = button.dataset.jobTab;
  renderSubscriberJobs();
});
$('jobCards').addEventListener('click', async event => {
  if (reviewNeedsYouTarget(event.target)) return;
  const generateId = event.target?.dataset?.jobPackageGenerate;
  const reviewId = event.target?.dataset?.jobPackageReview;
  const startApplicationId = event.target?.dataset?.jobApplicationStart;
  const reviewApplicationId = event.target?.dataset?.jobApplicationReview;
  if (reviewApplicationId) { openDurableApplicationWorkspace(reviewApplicationId); return; }
  if (startApplicationId) {
    event.target.disabled = true;
    try { await startDurableApplication(startApplicationId); }
    catch (error) { addMessage('assistant', `<strong>The application step was not started.</strong><br>${escapeHtml(error.message)} No personal data was transmitted.`); }
    finally { event.target.disabled = false; renderSubscriberJobs(); }
    return;
  }
  if (reviewId) { openPackageReview(deskState.roles.find(item => item.id === reviewId)); return; }
  if (!generateId) return;
  event.target.disabled = true;
  try { await generateDurablePackage(generateId); renderSubscriberJobs(); showToast('Resume prepared'); }
  catch (error) { addMessage('assistant', `<strong>The package was not created.</strong><br>${escapeHtml(error.message)} Your role and resume remain saved.`); }
  finally { event.target.disabled = false; }
});
$('postSubmissionActions').addEventListener('click', async event => {
  const button = event.target.closest('[data-post-submission]');
  if (!button) return;
  const outcome = button.dataset.postSubmission;
  if (outcome === 'REJECTED_CLOSED' && !window.confirm('Confirm that the employer rejected or closed this application. This updates only your private tracker.')) return;
  const details = { outcome };
  if (outcome === 'FOLLOW_UP_SCHEDULED') details.dueAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
  button.disabled = true;
  try {
    await updateDurableApplicationSession('record-post-submission', true, details);
    showToast(outcome === 'INTERVIEW' ? 'Interview recorded' : outcome === 'REJECTED_CLOSED' ? 'Application marked closed' : outcome === 'FOLLOW_UP_COMPLETED' ? 'Follow-up completed' : 'Reminder scheduled');
  } catch (error) {
    showToast(error.message || 'The private tracker could not be updated.');
  } finally {
    button.disabled = false;
  }
});
$('needsYouList').addEventListener('click', event => reviewNeedsYouTarget(event.target));
$('closeNeedsYou').addEventListener('click', closeNeedsYou);
$('needsYouOverlay').addEventListener('click', event => { if (event.target === $('needsYouOverlay')) closeNeedsYou(); });
$('pauseRun').addEventListener('click', async () => {
  missionState.runState = 'Paused';
  if (durableRun && !['Finished', 'Failed'].includes(durableRun.status)) durableRun = { ...durableRun, status: 'Paused', lifecycleState: 'Paused' };
  saveAll(); renderMission();
  if (durableRun?.id && hasApiSession() && !['Finished', 'Failed'].includes(durableRun.status)) {
    try {
      const response = await fetchWithTimeout(`/api/job-agent-runs?id=${encodeURIComponent(durableRun.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() }, body: JSON.stringify({ action: 'pause' }),
      }, REQUEST_TIMEOUTS.persistence);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.run) { durableRun = data.run; cacheDurableRun(durableRun); }
    } catch { /* local pause remains available until secure sync recovers */ }
  }
  addMessage('assistant', '<strong>Your agent is paused.</strong><br>Your mission, job cards, and queue are saved. No new search will start until you resume.');
  showToast('Agent paused');
});
$('resumeRun').addEventListener('click', async () => {
  missionState.runState = missionState.discovery?.status === 'error' ? 'Searching' : 'Preparing';
  if (durableRun && ['Paused', 'Failed'].includes(durableRun.status)) durableRun = { ...durableRun, status: 'Searching', lifecycleState: 'Queued', nextRetryAt: new Date().toISOString() };
  saveAll(); renderMission();
  if (durableRun?.id && hasApiSession() && ['Paused', 'Failed'].includes(durableRun.status)) {
    try {
      const response = await fetchWithTimeout(`/api/job-agent-runs?id=${encodeURIComponent(durableRun.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...apiAuthorizationHeaders() }, body: JSON.stringify({ action: 'resume' }),
      }, REQUEST_TIMEOUTS.persistence);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.run) { durableRun = data.run; cacheDurableRun(durableRun); }
    } catch { /* retry guidance remains visible */ }
  }
  if (missionState.discovery?.status === 'error') discoverMatchingJobs();
  else addMessage('assistant', '<strong>Your agent is active again.</strong><br>I’ll continue preparing current matches and keep consequential steps in Needs You.');
  showToast('Application resumed');
});
$('openDesk').addEventListener('click', () => openDesk('pipeline'));
$('openVault').addEventListener('click', () => { $('vaultOverlay').classList.add('open'); renderVaultStatus(); });
$('closeVault').addEventListener('click', () => $('vaultOverlay').classList.remove('open'));
$('vaultOverlay').addEventListener('click', event => { if (event.target === $('vaultOverlay')) $('vaultOverlay').classList.remove('open'); });
$('enableVault').addEventListener('click', async () => { try { await enableApplicantVault({ ask: true }); renderVaultStatus(); } catch (error) { $('vaultStatus').textContent = error.message; } });
$('exportVault').addEventListener('click', () => {
  if (!vaultEnabled()) return;
  const blob = new Blob([JSON.stringify(applicantVault.vault, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `1ststep-private-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
});
$('revokeVault').addEventListener('click', async () => {
  if (!vaultEnabled() || !window.confirm('Stop secure backup and revoke all cloud-backed answers and documents? Your device copy stays available.')) return;
  try { await vaultAction('revoke-consent'); localStorage.setItem(VAULT_PREFERENCE_KEY, 'device-only'); renderVaultStatus(); } catch (error) { $('vaultStatus').textContent = error.message; }
});
$('revokeJobAgentConsent').addEventListener('click', () => revokeJobAgentAuthorization().catch(error => { $('jobAgentAuthorizationStatus').textContent = error.message; }));
$('savedNeedsYouEmailAlerts').addEventListener('change', async event => {
  const enabled = event.target.checked;
  event.target.disabled = true;
  try { await syncNeedsYouNotifications(enabled); showToast(enabled ? 'Private Needs You emails enabled' : 'Needs You emails turned off'); }
  catch (error) { event.target.checked = !enabled; $('needsYouNotificationStatus').textContent = error.message; }
  finally { renderNeedsYouNotificationPreference(); }
});
$('deleteVault').addEventListener('click', async () => {
  if (!vaultEnabled() || !window.confirm('Permanently delete the encrypted cloud copy? Your device copy is not deleted.')) return;
  try {
    const response = await fetchWithTimeout('/api/applicant-vault', { method: 'DELETE', headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    if (!response.ok) throw new Error('The cloud copy could not be deleted.');
    applicantVault = { version: 0, vault: null, status: 'local', inFlight: false }; localStorage.setItem(VAULT_PREFERENCE_KEY, 'device-only'); renderVaultStatus();
  } catch (error) { $('vaultStatus').textContent = error.message; }
});
$('vaultList').addEventListener('click', async event => {
  const scheduleAction = event.target?.dataset?.scheduleAction;
  if (scheduleAction) {
    event.target.disabled = true;
    try {
      await syncJobAgentSchedule(missionState.mission, scheduleAction === 'resume');
      if ($('dailyBackgroundSearch')) $('dailyBackgroundSearch').checked = scheduleAction === 'resume';
      showToast(scheduleAction === 'resume' ? 'Daily search resumed' : 'Daily search paused');
    } catch (error) { $('vaultStatus').textContent = error.message; }
    finally { event.target.disabled = false; }
    return;
  }
  const editKey = event.target?.dataset?.vaultEditFact;
  if (editKey) { $('vaultOverlay').classList.remove('open'); openQuestionPopup(editKey); return; }
  const factId = event.target?.dataset?.vaultRevokeFact;
  const documentId = event.target?.dataset?.vaultRevokeDocument;
  if (!factId && !documentId) return;
  if (!window.confirm('Revoke this saved item from secure backup?')) return;
  try {
    if (factId) {
      const cloudFact = applicantVault.vault.facts.find(item => item.id === factId);
      await vaultAction('revoke-fact', { id: factId });
      const localFact = deskState.reusableFacts.find(item => item.fieldKey === cloudFact?.fieldKey);
      if (localFact) { deskState = deleteReusableFact(deskState, localFact.id); saveAll(); renderAll(); }
    } else await vaultAction('revoke-document', { id: documentId });
  } catch (error) { $('vaultStatus').textContent = error.message; }
});
$('closePackageReview').addEventListener('click', closePackageReview);
$('packageReviewOverlay').addEventListener('click', event => { if (event.target === $('packageReviewOverlay')) closePackageReview(); });
$('packageArtifactActions').addEventListener('click', async event => {
  const artifactKey = event.target?.dataset?.packageArtifact;
  if (!artifactKey) return;
  const role = deskState.roles.find(item => item.id === activePackageRoleId);
  try { await downloadPrivatePackageArtifact(role, artifactKey, event.target); }
  catch (error) { $('packageReviewStatus').textContent = error.message; }
});
$('savePackageReview').addEventListener('click', async () => {
  const role = deskState.roles.find(item => item.id === activePackageRoleId);
  if (!role?.packageDraft) return;
  try {
    $('savePackageReview').disabled = true;
    $('packageReviewStatus').textContent = 'Saving an encrypted revision and re-running truth, ATS, and artifact checks…';
    const resumeText = sanitizeResumeText($('packageResumeText').value);
    const coverLetterText = sanitizeResumeText($('packageCoverText').value);
    if (resumeText.length < 500) throw new Error('Keep at least 500 characters of role-specific resume content.');
    const run = await reviseDurablePackage(role, resumeText, coverLetterText);
    openPackageReview(deskState.roles.find(item => item.id === role.id));
    if (vaultEnabled()) {
      backupPackageDocument('tailored-resume', `${role.employer} — ${role.title} resume`, resumeText, `${run.result?.documentVersion || 'candidate-revision'}.txt`).catch(() => {});
      if (coverLetterText) backupPackageDocument('cover-letter', `${role.employer} — ${role.title} cover letter`, coverLetterText, `${run.result?.documentVersion || 'candidate-revision'}-cover.txt`).catch(() => {});
    }
  } catch (error) { $('packageReviewStatus').textContent = error.message; }
  finally { $('savePackageReview').disabled = false; }
});
$('downloadPackageDraft').addEventListener('click', () => {
  const role = deskState.roles.find(item => item.id === activePackageRoleId);
  if (!role?.packageDraft) return;
  const content = `${$('packageResumeText').value.trim()}${$('packageCoverText').value.trim() ? `\n\n${'-'.repeat(50)}\nCOVER LETTER\n${'-'.repeat(50)}\n\n${$('packageCoverText').value.trim()}` : ''}`;
  const blob = new Blob([content], { type: 'text/plain' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `${role.employer}-${role.title}-${role.packageDraft.documentVersion}.txt`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  link.click(); URL.revokeObjectURL(link.href);
});
$('openResumeSetup').addEventListener('click', openResumeSetup);
$('closeResumeSetup').addEventListener('click', closeResumeSetup);
$('resumeOverlay').addEventListener('click', event => { if (event.target === $('resumeOverlay')) closeResumeSetup(); });
$('resumeFile').addEventListener('change', async event => {
  try {
    setResumeMessage('Reading the resume locally...');
    const file = event.target.files[0];
    const text = await extractResumeFile(file);
    if (text.length < 100) throw new Error('The file did not contain enough readable resume text.');
    $('resumeEditor').value = text;
    setResumeMessage(`${file.name} is ready to review · ${text.length.toLocaleString()} characters extracted locally.`, 'good');
  } catch (error) { setResumeMessage(error.message, 'warn'); }
});
$('buildResumeDraft').addEventListener('click', () => startResumeInterview());
$('careerStoryResume').addEventListener('click', () => { closeResumeSetup(); startCareerStory(); });
$('saveResume').addEventListener('click', async () => {
  try {
    const text = saveResumeText($('resumeEditor').value, 'concierge-reviewed', $('resumeFile').files[0]?.name || '');
    setResumeMessage(`Resume available in this tab · ${text.length.toLocaleString()} characters.`, 'good');
    showToast('Resume saved');
    renderMission();
    addMessage('assistant', '<strong>Your resume is saved.</strong> I can use it as the master version, build readiness answers from it after your confirmation, and send role-specific tailoring through the existing Resume Tailor.');
    try {
      const cloudBackupAllowed = localStorage.getItem(VAULT_PREFERENCE_KEY) !== 'device-only';
      if (cloudBackupAllowed && await backupResume(text, $('resumeFile').files[0]?.name || '', true)) setResumeMessage(`Resume encrypted across your account · ${text.length.toLocaleString()} characters.`, 'good');
    } catch (error) { setResumeMessage(`Resume saved in this tab, but not backed up to your account: ${error.message}`, 'warn'); }
  } catch (error) { setResumeMessage(error.message, 'warn'); }
});
$('resumeApplication').addEventListener('click', () => {
  const durable = durableApplicationSessions.find(session => (session.actions || []).some(item => item.status === 'open')) || durableApplicationSessions[0];
  if (durable) { openDurableApplicationWorkspace(durable.id); return; }
  safeAction(openApplicationWorkspace);
});
$('closeDesk').addEventListener('click', closeDesk);
$('closeApplication').addEventListener('click', closeApplicationWorkspace);
$('startBrowserHandoff').addEventListener('click', event => {
  const button = event.currentTarget;
  button.disabled = true;
  startDurableBrowserHandoff().then(() => showToast('Secure preview ready')).catch(error => showToast(error.message)).finally(() => { button.disabled = false; });
});
$('refreshBrowserHandoff').addEventListener('click', event => {
  const session = activeDurableApplicationSession();
  if (!session) return;
  const button = event.currentTarget;
  button.disabled = true;
  hydrateDurableBrowserHandoff(session.id).catch(() => {}).finally(() => { button.disabled = false; });
});
$('closeBrowserHandoff').addEventListener('click', event => {
  const button = event.currentTarget;
  button.disabled = true;
  closeDurableBrowserHandoff().then(() => showToast('Browser session ended')).catch(error => showToast(error.message)).finally(() => { button.disabled = false; });
});
$('deskOverlay').addEventListener('click', event => { if (event.target === $('deskOverlay')) closeDesk(); });
$('cancelConfirmation').addEventListener('click', closeConsequenceDialog);
$('confirmationOverlay').addEventListener('click', event => { if (event.target === $('confirmationOverlay')) closeConsequenceDialog(); });
$('confirmConsequence').addEventListener('click', async event => {
  if (!pendingConsequence) return;
  const consequence = { ...pendingConsequence };
  const session = durableApplicationSessions.find(item => item.id === consequence.sessionId);
  if (!session) { closeConsequenceDialog(); return; }
  const button = event.currentTarget;
  button.disabled = true;
  try {
    activeDurableApplicationSessionId = session.id;
    await updateDurableApplicationSession(consequence.action, true, { actionId: consequence.actionId });
    closeConsequenceDialog();
    showToast(consequence.action === 'confirm-submission'
      ? finalSubmissionExecutionEnabled ? 'Submission authorized and queued' : 'Submission permission saved; execution remains disabled'
      : 'Sharing authorized');
  } catch (error) {
    $('confirmationSubtitle').textContent = error.message;
    $('confirmationSubtitle').classList.add('visible-error');
  } finally { button.disabled = false; }
});
document.addEventListener('keydown', event => {
  const openDialog = $('confirmationOverlay').classList.contains('open') ? $('confirmationOverlay')
    : $('needsYouOverlay').classList.contains('open') ? $('needsYouOverlay')
      : $('jobAgentConsentOverlay').classList.contains('open') ? $('jobAgentConsentOverlay') : null;
  if (event.key === 'Escape') {
    if (openDialog === $('confirmationOverlay')) closeConsequenceDialog();
    else if (openDialog === $('jobAgentConsentOverlay')) closeJobAgentConsent();
    else if (openDialog) closeNeedsYou();
    return;
  }
  if (event.key !== 'Tab' || !openDialog) return;
  const focusable = [...openDialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(node => !node.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
document.querySelectorAll('[data-desk-tab]').forEach(node => node.addEventListener('click', () => switchTab(node.dataset.deskTab)));
$('questionChoices').addEventListener('click', event => {
  const value = event.target?.dataset?.questionAnswer;
  if (!value) return;
  $('questionValue').value = value;
  document.querySelectorAll('[data-question-answer]').forEach(node => node.classList.toggle('selected', node === event.target));
});
$('questionForm').addEventListener('submit', event => {
  event.preventDefault();
  const value = $('questionValue').value.trim();
  if (!value || !activeQuestionKey) return;
  const saved = safeAction(() => {
    deskState = confirmReusableFact(deskState, {
      fieldKey: activeQuestionKey, value, confirmed: true, verificationState: 'user-confirmed',
      source: 'guided-popup', sensitivity: SENSITIVE_QUESTION_KEYS.has(activeQuestionKey) ? 'sensitive' : 'standard', autoReuse: !CONSEQUENTIAL_QUESTION_KEYS.has(activeQuestionKey),
    });
  });
  if (!saved) {
    $('questionVaultStatus').textContent = 'This answer was not saved. Correct it or choose Ask later.';
    return;
  }
  const savedFact = deskState.reusableFacts.find(item => item.fieldKey === activeQuestionKey);
  showToast('Answer saved');
  if (savedFact && localStorage.getItem(VAULT_PREFERENCE_KEY) !== 'device-only') backupConfirmedFact(savedFact, true).catch(error => { if ($('questionVaultStatus')) $('questionVaultStatus').textContent = `Saved on this device. Secure backup needs attention: ${error.message}`; });
  if (resumeInterviewActive) {
    setTimeout(() => {
      const next = nextResumeInterviewField();
      if (next) openQuestionPopup(next);
      else {
        resumeInterviewActive = false;
        closeQuestionPopup();
        generateMasterResume();
      }
    }, 80);
  } else setTimeout(() => openQuestionPopup(), 80);
});
$('questionLater').addEventListener('click', () => { resumeInterviewActive = false; closeQuestionPopup(); });
$('questionOverlay').addEventListener('click', event => { if (event.target === $('questionOverlay')) closeQuestionPopup(); });
$('advanceApplication').addEventListener('click', async () => {
  if (activeDurableApplicationSession()) {
    try { await updateDurableApplicationSession('pause'); }
    catch (error) { $('applicationActionSummary').textContent = error.message; }
    return;
  }
  safeAction(() => {
    const session = activeApplicationSession();
    if (!session) throw new Error('No application session is active.');
    deskState = advanceManagedApplicationSession(deskState, session.id);
  });
});
$('resolveApplication').addEventListener('click', async event => {
  if (activeDurableApplicationSession()) {
    const action = event.currentTarget.dataset.durableAction;
    if (action === 'refresh-final-approval') {
      const button = event.currentTarget;
      button.disabled = true;
      try { await updateDurableApplicationSession(action); showToast('Fresh final approval required; nothing submitted'); }
      catch (error) { $('applicationActionSummary').textContent = error.message; }
      finally { button.disabled = false; }
      return;
    }
    if (action === 'request-final-review') {
      const confirmed = window.confirm('Confirm that you reviewed the exact preserved employer form and package. This only prepares the separate final approval; it does not submit the application.');
      if (!confirmed) return;
      const button = event.currentTarget;
      button.disabled = true;
      try { await updateDurableApplicationSession(action, true); showToast('Final review saved; submission still requires approval'); }
      catch (error) { $('applicationActionSummary').textContent = error.message; }
      finally { button.disabled = false; }
      return;
    }
    if (['confirm-transmission', 'confirm-submission'].includes(action)) {
      openConsequenceDialog(activeDurableApplicationSession(), action);
      return;
    }
    const button = event.currentTarget;
    const actionId = button.dataset.applicationActionId || '';
    button.disabled = true;
    try { await updateDurableApplicationSession(action, true, { actionId }); }
    catch (error) { $('applicationActionSummary').textContent = error.message; }
    finally { button.disabled = false; }
    return;
  }
  safeAction(() => {
    const session = activeApplicationSession();
    if (!session) throw new Error('No application session is active.');
    deskState = resolveManagedApplicationException(deskState, session.id);
  });
});
async function reconcileEmployerFill(outcome, button) {
  const session = activeDurableApplicationSession();
  if (!session) return;
  const fieldsPresent = outcome === 'FIELDS_PRESENT';
  const confirmed = window.confirm(fieldsPresent
    ? 'Confirm that you reviewed the preserved employer form and the exact approved fields are present. This does not submit the application.'
    : 'Confirm that you reviewed the preserved employer form and none of the approved fields are present. The old attempt will not be retried; you will receive a fresh sharing approval.');
  if (!confirmed) return;
  button.disabled = true;
  try {
    await updateDurableApplicationSession('reconcile-employer-failure', true, {
      actionId: button.dataset.applicationActionId || '', outcome,
    });
    showToast(fieldsPresent ? 'Saved form reconciled' : 'Fresh sharing approval required');
  } catch (error) {
    $('applicationActionSummary').textContent = error.message || 'The saved employer form could not be reconciled.';
  } finally { button.disabled = false; }
}
$('reconcileFieldsPresent').addEventListener('click', event => reconcileEmployerFill('FIELDS_PRESENT', event.currentTarget));
$('reconcileFieldsAbsent').addEventListener('click', event => reconcileEmployerFill('FIELDS_NOT_FILLED', event.currentTarget));
$('simulateTimeout').addEventListener('click', () => safeAction(() => {
  const session = activeApplicationSession();
  if (!session) throw new Error('No application session is active.');
  deskState = pauseManagedApplicationSession(deskState, session.id, 'browser-timeout');
}));
$('resumeManagedApplication').addEventListener('click', async () => {
  if (activeDurableApplicationSession()) {
    try { await updateDurableApplicationSession('resume'); }
    catch (error) { $('applicationActionSummary').textContent = error.message; }
    return;
  }
  safeAction(() => {
    const session = activeApplicationSession();
    if (!session) throw new Error('No application session is active.');
    deskState = resumeManagedApplicationSession(deskState, session.id);
  });
});

$('truthForm').addEventListener('submit', event => {
  event.preventDefault();
  safeAction(() => {
    deskState = updateTruthProfile(deskState, {
      workHistory: list($('truthWork').value), education: list($('truthEducation').value), skills: list($('truthSkills').value),
      authorization: $('truthAuthorization').value, sponsorship: $('truthSponsorship').value, geography: list($('truthGeography').value),
      travelTolerance: $('truthTravel').value, salaryMin: $('truthSalaryMin').value, salaryMax: $('truthSalaryMax').value,
      schedulePreferences: list($('truthSchedule').value), timeZones: list($('truthTimezones').value),
      prioritizedRoleFamilies: list($('truthPriorityRoles').value), excludedRoleFamilies: list($('truthExcludedRoles').value),
      excludedEmployers: list($('truthExcludedEmployers').value), outsideEmploymentConstraints: list($('truthConflicts').value),
      disclosureChoices: list($('truthDisclosures').value), explicitUnknowns: list($('truthUnknowns').value),
    });
    const gaps = truthProfileGaps(deskState.truthProfile);
    showDeskMessage(gaps.length ? `Saved with unresolved truth-profile fields: ${gaps.join(', ')}.` : 'Truth profile confirmed.');
  });
});

$('buildReadinessDraft').addEventListener('click', () => safeAction(() => {
  const resumeText = savedResumeText();
  const profile = loadJson('1ststep_profile', {});
  const draft = buildReadinessDraftFromSources({ profile, resumeText, truthProfile: deskState.truthProfile });
  deskState = stageReadinessDraft(deskState, draft);
  showDeskMessage(`Prepared ${draft.proposals.length} proposed answers. Review once, then confirm them together.`);
}));
$('confirmReadinessDraft').addEventListener('click', () => safeAction(() => {
  deskState = confirmReadinessDraft(deskState);
  showDeskMessage('Readiness draft confirmed. Matching routine questions can now reuse these answers without asking again.');
}));
$('discardReadinessDraft').addEventListener('click', () => safeAction(() => {
  deskState = discardReadinessDraft(deskState);
  showDeskMessage('Proposed answers discarded. No reusable facts were added.');
}));

$('factForm').addEventListener('submit', event => {
  event.preventDefault();
  safeAction(() => {
    const fieldKey = $('factField').value;
    deskState = confirmReusableFact(deskState, {
      fieldKey, value: $('factValue').value, source: $('factSource').value,
      verificationState: $('factSource').value === 'document-verified' ? 'document-verified' : 'user-confirmed',
      sensitivity: $('factSensitivity').value, autoReuse: CONSEQUENTIAL_QUESTION_KEYS.has(fieldKey) ? false : $('factAutoReuse').checked, confirmed: $('factConfirmed').checked,
    });
    const fact = deskState.reusableFacts.find(item => item.fieldKey === fieldKey);
    event.target.reset(); showDeskMessage('Confirmed reusable answer saved locally.');
    if (fact && localStorage.getItem(VAULT_PREFERENCE_KEY) !== 'device-only') backupConfirmedFact(fact, true).catch(() => {});
  });
});
$('factList').addEventListener('click', event => { const id = event.target?.dataset?.deleteFact; if (id) safeAction(() => { deskState = deleteReusableFact(deskState, id); showDeskMessage('Reusable answer deleted; deletion recorded in the audit trail.'); }); });
$('policyForm').addEventListener('submit', event => { event.preventDefault(); safeAction(() => { deskState = setStandingPolicy(deskState, { policyKey: $('policyKey').value, decision: $('policyDecision').value, confirmed: $('policyConfirmed').checked }); event.target.reset(); showDeskMessage('Standing authorization saved locally.'); }); });
$('applySafeDefaults').addEventListener('click', () => safeAction(() => {
  const mission = missionState.mission || {};
  const scope = {
    roleFamilies: mission.role ? [mission.role] : [], geography: mission.location ? [mission.location] : [],
    salaryMin: mission.salaryMin || null,
  };
  const defaults = [
    ['transmit-profile', 'Transmit approved resume and verified profile facts only to roles matching the saved mission filters.'],
    ['create-account', 'Create employer accounts through the approved credential flow without centrally storing plaintext passwords.'],
    ['ordinary-privacy', 'Accept ordinary application privacy terms only when they add no materially new consent or restriction.'],
    ['routine-screening', 'Reuse verified answers only when wording and meaning match confidently.'],
    ['optional-demographics', 'Leave optional demographic questions unanswered.'],
  ];
  defaults.forEach(([policyKey, decision]) => { deskState = setStandingPolicy(deskState, { policyKey, decision, scope, confirmed: true }); });
  showDeskMessage('Recommended safe defaults confirmed for the current mission scope. Material exceptions still pause.');
}));
$('autonomyLevel').addEventListener('change', event => safeAction(() => { deskState = setAutonomyLevel(deskState, event.target.value); showDeskMessage('Autonomy level updated. Final submission always requires a separate action-time confirmation.'); }));
$('exportReadiness').addEventListener('click', () => { const blob = new Blob([exportReadinessData(deskState)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `1ststep-readiness-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); });

$('roleForm').addEventListener('submit', event => { event.preventDefault(); safeAction(() => {
  const result = addRole(deskState, {
    employer: $('roleEmployer').value, title: $('roleTitle').value, requisitionId: $('roleReq').value,
    jobDescription: $('roleDescription').value,
    directEmployerUrl: $('roleUrl').value, sourceType: $('roleSource').value, applyPathActive: $('roleApplyActive').checked,
    remoteEligibility: $('roleRemote').value, geographyEligibility: $('roleGeo').value,
    salaryMin: $('roleSalaryMin').value, salaryMax: $('roleSalaryMax').value, salaryDisclosure: $('roleSalaryDisclosure').value,
    postedDate: $('rolePosted').value, travel: $('roleTravel').value, schedule: $('roleSchedule').value,
    requiredGaps: list($('roleRequiredGaps').value), preferredGaps: list($('rolePreferredGaps').value),
    recruiterContact: $('roleRecruiter').value, attestations: list($('roleAttestations').value),
  });
  deskState = result.state; event.target.reset();
  showDeskMessage(result.duplicate ? 'Duplicate suppressed; durable reason added to the existing role.' : 'Role captured as Found.');
}); });

$('importTracker').addEventListener('click', () => safeAction(() => {
  const applications = loadJson('1ststep_applications', []); const tailored = loadJson('1ststep_tailor_history', []);
  const result = importLegacyEntries(deskState, applications, tailored); deskState = result.state;
  showDeskMessage(`Imported ${result.imported}; suppressed ${result.duplicates} duplicates; skipped ${result.skipped}. Imported “applied” labels are not treated as receipts.`);
}));

$('roleList').addEventListener('click', event => {
  const roleId = event.target?.dataset?.roleId; const action = event.target?.dataset?.roleAction;
  if (!roleId || !action) return;
  if (action === 'generate') {
    event.target.disabled = true;
    generateDurablePackage(roleId).catch(error => showDeskMessage(error.message, true)).finally(() => { event.target.disabled = false; renderAll(); });
    return;
  }
  if (action === 'render-package') {
    event.target.disabled = true;
    renderDurablePackage(roleId).then(() => showDeskMessage('Isolated DOCX/PDF render evidence was saved.')).catch(error => showDeskMessage(error.message, true)).finally(() => { event.target.disabled = false; renderAll(); });
    return;
  }
  safeAction(() => {
    if (action === 'verify') deskState = transitionRole(deskState, roleId, 'Verified');
    if (action === 'workspace') {
      const role = deskState.roles.find(item => item.id === roleId);
      startSyntheticApplicationWorkspace(role);
      return;
    }
    if (action === 'review-package') {
      const role = deskState.roles.find(item => item.id === roleId);
      if (!role?.packageDraft) throw new Error('Generate a role-specific package draft first.');
      openPackageReview(role);
      return;
    }
    if (action === 'block') {
      const type = window.prompt(`Action type: ${ACTION_TYPES.join(', ')}`, 'NEW_QUESTION')?.toUpperCase();
      if (!ACTION_TYPES.includes(type)) throw new Error('Choose a supported human-action type.');
      const summary = window.prompt('Concise human action required:') || 'Human action required';
      deskState = transitionRole(deskState, roleId, 'Blocked', { reason: summary });
      deskState = addActionItem(deskState, { roleId, type, summary }).state;
    }
  });
});

$('batchForm').addEventListener('submit', event => { event.preventDefault(); safeAction(() => {
  const roleIds = deskState.roles.filter(role => role.status === 'Package Ready').map(role => role.id);
  const result = createApprovalBatch(deskState, { name: $('batchName').value, disclosures: list($('batchDisclosures').value), roleIds });
  deskState = result.state; event.target.reset(); showDeskMessage('Named batch created from current Package Ready roles.');
}); });
$('batchList').addEventListener('click', event => { const batchId = event.target?.dataset?.approveBatch; if (!batchId) return; safeAction(() => {
  deskState = approveBatch(deskState, batchId);
  const batch = deskState.approvalBatches.find(item => item.id === batchId);
  batch.roleIds.forEach(roleId => { deskState = transitionRole(deskState, roleId, 'Awaiting Approval', { approvalBatchId: batchId }); });
  showDeskMessage('Named batch approved. External submission remains disabled in this environment.');
}); });
$('actionList').addEventListener('click', event => { const actionId = event.target?.dataset?.resolveAction; if (actionId) safeAction(() => { deskState = resolveActionItem(deskState, actionId); }); });

$('startDemo').addEventListener('click', () => safeAction(() => { deskState = createSalesDemo(deskState, $('demoAutonomy').value); showDeskMessage('Synthetic demo started. No external service was contacted.'); }));
$('openManagedDemo').addEventListener('click', () => startSyntheticApplicationWorkspace());
$('advanceDemo').addEventListener('click', () => safeAction(() => { deskState = advanceSalesDemo(deskState); }));
$('resetDemo').addEventListener('click', () => safeAction(() => { deskState = resetSalesDemo(deskState); showDeskMessage('Synthetic demo reset.'); }));

$('createCampaign').addEventListener('click', () => openCampaignWizard());
$('closeCampaign').addEventListener('click', () => $('campaignOverlay').classList.remove('open'));
$('campaignType').addEventListener('change', event => seedCampaignTemplate(event.target.value));
$('campaignBack').addEventListener('click', () => { campaignWizardStep = Math.max(0, campaignWizardStep - 1); renderCampaignWizard(); });
$('campaignNext').addEventListener('click', () => {
  if (!currentWizardStepValid()) return;
  campaignWizardStep = Math.min(7, campaignWizardStep + 1);
  renderCampaignWizard();
});
$('campaignForm').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const selectedTemplate = CAMPAIGN_TEMPLATES.find(template => template.id === $('campaignType').value);
    const campaignInput = {
      campaignType: selectedTemplate?.campaignType || 'custom_operations',
      name: $('campaignDraftName').value,
      objective: $('campaignDraftObjective').value,
      description: $('campaignAdvanced').value,
      cadence: { timezone: $('campaignTimezone').value, recurrence: $('campaignRecurrence').value, allowedRunWindow: $('campaignWindow').value, reportingTime: $('campaignReportTime').value },
      targets: { dailyTarget: $('campaignDailyTarget').value, runTarget: $('campaignRunTarget').value },
      priorities: list($('campaignPriorities').value), hardRules: list($('campaignRules').value), exclusions: list($('campaignExclusions').value),
      standingAuthorization: list($('campaignAuthorization').value), humanActionTriggers: list($('campaignTriggers').value),
      evidenceRules: list($('campaignEvidenceRules').value), reportingRequirements: list($('campaignReporting').value), stopConditions: list($('campaignStop').value),
    };
    campaignStore = editingCampaignId ? updatePersistentCampaign(campaignStore, editingCampaignId, campaignInput) : addCampaign(campaignStore, campaignInput);
    saveAll();
    renderCampaignConsole();
    $('campaignOverlay').classList.remove('open');
  } catch (error) {
    window.alert(error.message || 'Campaign configuration could not be saved.');
  }
});
$('editCampaign').addEventListener('click', () => openCampaignWizard(activeCampaign()));
$('exportCampaign').addEventListener('click', () => {
  const campaign = activeCampaign();
  if (!campaign) return;
  const blob = new Blob([operatingContractText(campaign)], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign'}-operating-contract.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
});
$('pauseCampaign').addEventListener('click', () => {
  const campaign = activeCampaign();
  if (!campaign) return;
  campaignStore = updateCampaignStatus(campaignStore, campaign.id, 'paused');
  saveAll(); renderCampaignConsole();
});
$('resumeCampaign').addEventListener('click', () => {
  const campaign = activeCampaign();
  if (!campaign) return;
  campaignStore = updateCampaignStatus(campaignStore, campaign.id, 'design');
  saveAll(); renderCampaignConsole();
});
$('stopCampaign').addEventListener('click', () => {
  const campaign = activeCampaign();
  if (!campaign || !window.confirm('Stop this campaign? Its operating contract and audit metadata will remain available.')) return;
  campaignStore = updateCampaignStatus(campaignStore, campaign.id, 'completed');
  saveAll(); renderCampaignConsole();
});

$('resetMission').addEventListener('click', () => { missionState = { mission: {}, messages: [], discovery: { status: 'idle' }, runState: null }; saveAll(); $('messages').innerHTML = ''; start(); });
function start() {
  consumeGeneratedPackage();
  if (missionState.messages.length) canonicalConversation(missionState.messages, 2).forEach(message => addMessage(message.role, message.html, false));
  else addMessage('assistant', guidanceHtml(currentGuidance(), 'I’ll guide the search one useful step at a time and keep routine setup short.'));
  renderAll();
  if (new URLSearchParams(window.location.search).get('managedDemo') === '1' && !activeApplicationSession()) startSyntheticApplicationWorkspace();
}
async function hydrateDurableRun() {
  if (!hasApiSession() || !hasJobAgentAccess()) return;
  try {
    const response = await fetchWithTimeout('/api/job-agent-runs?latest=discovery', { headers: apiAuthorizationHeaders() }, REQUEST_TIMEOUTS.persistence);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    if (!data.run) {
      durableRun = null;
      cacheDurableRun(null);
      delete missionState.durableRunId;
      saveAll(); renderMission();
      return;
    }
    durableRun = data.run;
    cacheDurableRun(durableRun);
    missionState.durableRunId = durableRun.id;
    if ((!missionState.mission?.role && !(missionState.mission?.roleFamilies || []).length) && durableRun.mission) {
      missionState.mission = durableRun.mission;
      guidedSelection = {
        pathId: durableRun.mission.roleFamily || '',
        workMode: durableRun.mission.workModes?.[0] || 'Remote',
        employmentType: durableRun.mission.employmentTypes?.[0] || 'Full-time',
        salary: Number(durableRun.mission.salaryMin) || 0,
        location: durableRun.mission.location || '',
      };
    }
    restoreDurableDiscoveryRoles(durableRun);
    if (['Searching', 'Preparing', 'Paused', 'Waiting for You', 'Finished', 'Failed'].includes(durableRun.status)) {
      missionState.runState = durableRun.status === 'Failed' ? 'Paused' : durableRun.status;
      saveAll(); renderMission();
    }
  } catch { /* device state remains available */ }
}

function restoreDurableDiscoveryRoles(run) {
  if (run?.taskType !== 'direct_employer_discovery' || run?.status !== 'Finished' || !Array.isArray(run.result?.jobs)) return;
  const normalized = value => String(value || '').trim().toLowerCase();
  const cards = syncedSubscriberView.jobCards || [];
  for (const job of run.result.jobs) {
    if (job?.applyPathVerified !== true || !jobTitleMatchesMission(job, run.mission || missionState.mission)) continue;
    const card = cards.find(item => (item.discoveryRunId === run.id && item.requisitionId === job.requisitionId)
      || (normalized(item.employer) === normalized(job.employer) && normalized(item.title) === normalized(job.title)
        && normalized(item.directEmployerUrl) === normalized(job.applyUrl)));
    const requirements = extractStructuredRequirements(job);
    const calculatedFit = card ? null : evaluateCandidateFit({ ...job, requirements }, {
      ...deskState.truthProfile,
      workHistory: deskState.truthProfile.workHistory?.length ? deskState.truthProfile.workHistory : [savedResumeText()],
    }, run.mission || missionState.mission);
    if (!card && !calculatedFit?.credibleInterviewPath) continue;
    const result = addRole(deskState, {
      id: card?.id || '', employer: job.employer, title: job.title, requisitionId: job.requisitionId,
      jobDescription: job.description, directEmployerUrl: job.applyUrl, sourceUrl: card?.sourceUrl || job.jobUrl,
      sourceType: 'direct-employer', applyPathActive: true,
      remoteEligibility: card?.remoteEligibility || (job.remote ? 'Remote listed by employer feed' : `As listed: ${job.workplaceType || job.location || 'Unknown'}`),
      geographyEligibility: card?.geographyEligibility || (job.location ? `Employer listing: ${job.location}` : 'Not stated in current employer requisition'),
      salaryMin: card?.salaryMin || job.salaryMin, salaryMax: card?.salaryMax || job.salaryMax,
      salaryDisclosure: card?.salaryDisclosure || job.salaryDisclosure || 'Not disclosed in current employer requisition',
      employmentType: card?.employmentType || job.employmentType || 'Unknown', postedDate: card?.postedDate || job.postedDate || 'Not stated in current employer requisition',
      travel: card?.travel || requirements.travel || 'Not stated in current employer requisition',
      schedule: card?.schedule || 'Not stated in current employer requisition', requirements,
      fitScore: card?.fitScore ?? calculatedFit?.score ?? null,
      fitClassification: calculatedFit?.classification || '', credibleInterviewPath: card ? Number(card.fitScore) >= 70 : calculatedFit?.credibleInterviewPath === true,
      fitRationale: calculatedFit?.rationale || '', fitComponents: calculatedFit?.components || null, hardDisqualifiers: calculatedFit?.hardDisqualifiers || [],
      sourceProvider: card?.sourceProvider || job.provider, sourceEvidence: `${job.sourceEvidence || 'Published employer feed'} · ${job.applyPathVerification || 'exact requisition verified'}`,
      discoveryRunId: run.id, relevancePolicyVersion: JOB_RELEVANCE_POLICY_VERSION,
      missionRole: run.mission?.role || (run.mission?.roleFamilies || []).join(', '),
    });
    deskState = result.state;
    const restored = result.role;
    const shouldRestoreVerified = card && (card.status === 'Verified' || card.status === 'Package Ready' || Boolean(card.packageRunId));
    if (shouldRestoreVerified && restored.status === 'Found') deskState = transitionRole(deskState, restored.id, 'Verified', { reason: 'Restored exact verified discovery evidence' });
    if (card?.packageRunId) deskState = recordPackageRunCheckpoint(deskState, restored.id, {
      runId: card.packageRunId,
      status: ['Searching', 'Preparing', 'Waiting for You', 'Paused', 'Finished', 'Failed'].includes(card.packageRunStatus) ? card.packageRunStatus : 'Preparing',
    });
  }
  renderAll();
}

async function hydrateDurablePackages() {
  if (!hasApiSession() || !hasJobAgentAccess()) return;
  const pending = deskState.roles.filter(role => role.packageRunId && !role.packageDraft).slice(0, 10);
  for (const role of pending) await refreshDurablePackage(role.packageRunId, false);
}
async function hydrateAccountWorkflow() {
  initializeAccountWorkflowAuthority();
  await hydrateCampaignStore();
  await hydrateApplicantVault();
  await hydrateJobAgentSchedule();
  await hydrateNeedsYouNotifications();
  await hydrateDurableRun();
  await hydrateDurablePackages();
  await hydrateDurableApplicationSessions();
  await hydrateJobAgentLearning();
}
start();
loadPublicAppConfig();
loadSessionCapabilities().then(async () => {
  await hydrateAccountWorkflow();
});

// ── Interview practice ───────────────────────────────────────────────────────
// Preparation only. This surface never joins, listens to, records, or transcribes a real
// interview, and never hands the candidate a scripted answer. The authoritative safety
// filters (protected traits, ungrounded suggestions) run server-side in api/ai.js.
const interviewPractice = { role: null, questions: [], index: 0, turns: [], busy: false };

function interviewPracticeRoles() {
  const source = deskState.roles.length ? deskState.roles : (syncedSubscriberView.jobCards || []);
  const seen = new Set();
  const roles = [];
  for (const role of source) {
    const key = `${role.employer || ''}|${role.title || ''}`;
    if (!role?.title || seen.has(key)) continue;
    seen.add(key);
    roles.push({
      id: role.id || key,
      title: role.title,
      employer: role.employer || '',
      status: role.status || '',
      jobDescription: role.jobDescription || role.mission?.jobDescription || '',
    });
  }
  // A role that already reached an interview is the most useful thing to rehearse.
  return roles.sort((a, b) => (b.status === 'Interview') - (a.status === 'Interview'));
}

function setInterviewStatus(message, tone = '') {
  const node = $('interviewPracticeStatus');
  if (!node) return;
  node.textContent = message;
  node.className = `interview-status${tone ? ` ${tone}` : ''}`;
}

function renderInterviewRoles() {
  const select = $('interviewRoleSelect');
  if (!select) return;
  const roles = interviewPracticeRoles();
  select.innerHTML = '';
  if (!roles.length) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'No saved roles yet';
    select.appendChild(empty);
    select.disabled = true;
    if ($('startInterviewPractice')) $('startInterviewPractice').disabled = true;
    setInterviewStatus('Save or discover a role first, then come back to rehearse for it.', 'warn');
    return;
  }
  select.disabled = false;
  if ($('startInterviewPractice')) $('startInterviewPractice').disabled = false;
  for (const role of roles) {
    const option = document.createElement('option');
    option.value = role.id;
    option.textContent = `${role.title}${role.employer ? ` · ${role.employer}` : ''}${role.status === 'Interview' ? ' (interview scheduled)' : ''}`;
    select.appendChild(option);
  }
  setInterviewStatus('Practice questions are built from this role and the facts you confirmed.');
}

function openInterviewPractice() {
  if (!hasJobAgentAccess()) { showToast('Job Agent access is required for interview practice.'); return; }
  Object.assign(interviewPractice, { role: null, questions: [], index: 0, turns: [], busy: false });
  if ($('interviewSession')) $('interviewSession').hidden = true;
  if ($('interviewSummary')) $('interviewSummary').hidden = true;
  if ($('interviewRolePicker')) $('interviewRolePicker').hidden = false;
  renderInterviewRoles();
  $('interviewOverlay')?.classList.add('open');
  $('interviewRoleSelect')?.focus();
}

function closeInterviewPractice() { $('interviewOverlay')?.classList.remove('open'); }

async function startInterviewPractice() {
  const roles = interviewPracticeRoles();
  const role = roles.find(item => item.id === $('interviewRoleSelect')?.value) || roles[0];
  if (!role) return;
  interviewPractice.role = role;
  interviewPractice.busy = true;
  setInterviewStatus('Preparing practice questions…');
  try {
    const content = [
      '<target_role>', `${role.title} at ${role.employer}`, '</target_role>',
      '<job_description>', redactChatForModel(String(role.jobDescription || '').slice(0, 2200)), '</job_description>',
    ].join('\n');
    const parsed = JSON.parse(await callAI('interviewQuestions', 'quality', content, 2200));
    interviewPractice.questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    if (!interviewPractice.questions.length) throw new Error('No practice questions were returned.');
    interviewPractice.index = 0;
    interviewPractice.turns = [];
    if ($('interviewRolePicker')) $('interviewRolePicker').hidden = true;
    if ($('interviewSession')) $('interviewSession').hidden = false;
    renderInterviewQuestion();
  } catch (error) {
    setInterviewStatus(error.message || 'Practice questions could not be prepared. Try again.', 'warn');
  } finally { interviewPractice.busy = false; }
}

function renderInterviewQuestion() {
  const question = interviewPractice.questions[interviewPractice.index];
  if (!question) return finishInterviewPractice();
  setInterviewStatus(`${interviewPractice.role.title}${interviewPractice.role.employer ? ` · ${interviewPractice.role.employer}` : ''}`);
  if ($('interviewProgress')) $('interviewProgress').textContent = `Question ${interviewPractice.index + 1} of ${interviewPractice.questions.length}`;
  if ($('interviewQuestionType')) $('interviewQuestionType').textContent = question.type || 'Behavioral';
  if ($('interviewQuestionPrompt')) $('interviewQuestionPrompt').textContent = question.prompt;
  if ($('interviewQuestionRationale')) $('interviewQuestionRationale').textContent = question.rationale || '';
  if ($('interviewAnswer')) { $('interviewAnswer').value = ''; $('interviewAnswer').focus(); }
  if ($('interviewCoaching')) $('interviewCoaching').hidden = true;
}

function renderInterviewCoaching(coaching) {
  const star = $('interviewStar');
  if (star) {
    star.innerHTML = ['situation', 'task', 'action', 'result'].map(dimension => {
      const met = (coaching.starCovered || []).includes(dimension);
      return `<span class="${met ? 'met' : 'gap'}">${escapeHtml(dimension)} ${met ? 'covered' : 'add detail'}</span>`;
    }).join('');
  }
  const list = items => `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  const parts = [];
  if (coaching.strengths?.length) parts.push(`<h4>What worked</h4>${list(coaching.strengths)}`);
  if (coaching.improvements?.length) parts.push(`<h4>Tighten this</h4>${list(coaching.improvements)}`);
  if (coaching.suggestedDetails?.length) parts.push(`<h4>Details you already have, use them</h4>${list(coaching.suggestedDetails)}`);
  if ($('interviewFeedback')) $('interviewFeedback').innerHTML = parts.join('') || '<p>No specific notes on this one.</p>';
  const followUp = $('interviewFollowUp');
  if (followUp) {
    followUp.hidden = !coaching.followUp;
    followUp.textContent = coaching.followUp ? `A real interviewer would follow up: ${coaching.followUp}` : '';
  }
  if ($('interviewCoaching')) $('interviewCoaching').hidden = false;
}

async function submitInterviewAnswer() {
  if (interviewPractice.busy) return;
  const answer = $('interviewAnswer')?.value.trim() || '';
  const question = interviewPractice.questions[interviewPractice.index];
  if (!answer || !question) { setInterviewStatus('Type the answer you would actually give, then ask for coaching.', 'warn'); return; }
  interviewPractice.busy = true;
  if ($('submitInterviewAnswer')) $('submitInterviewAnswer').disabled = true;
  setInterviewStatus('Reviewing your answer…');
  try {
    const confirmedFacts = (applicantVault.vault?.facts || [])
      .filter(fact => fact.status === 'active')
      .map(fact => {
        const version = fact.versions?.[fact.versions.length - 1] || {};
        return { label: fact.label, value: version.value, verificationState: 'user-confirmed' };
      });
    // Throws locally on a credential, before anything is sent.
    const request = buildAnswerCoachingRequest({ question, answer, role: interviewPractice.role, confirmedFacts });
    const coaching = JSON.parse(await callAI(request.callType, request.quality, request.content, 1200));
    interviewPractice.turns.push({ question, coaching });
    renderInterviewCoaching(coaching);
    setInterviewStatus('Coaching is based only on what you said and the facts you confirmed.', 'good');
  } catch (error) {
    const message = String(error.message || '');
    setInterviewStatus(message === 'INTERVIEW_ANSWER_CONTAINS_CREDENTIAL'
      ? 'That answer looks like it contains a password or one-time code. Remove it. Those are never sent or stored.'
      : message || 'Coaching is unavailable right now.', 'warn');
  } finally {
    interviewPractice.busy = false;
    if ($('submitInterviewAnswer')) $('submitInterviewAnswer').disabled = false;
  }
}

function nextInterviewQuestion() {
  interviewPractice.index += 1;
  if (interviewPractice.index >= interviewPractice.questions.length) return finishInterviewPractice();
  renderInterviewQuestion();
}

function finishInterviewPractice() {
  const summary = summarizePracticeSession(interviewPractice.turns);
  if ($('interviewSession')) $('interviewSession').hidden = true;
  if ($('interviewSummary')) $('interviewSummary').hidden = false;
  const rows = [];
  rows.push(`<div class="row"><strong>${summary.answered} answer(s) practised</strong> · average structure score ${summary.averageScore} of 5</div>`);
  if (summary.strongTypes.length) rows.push(`<div class="row">Strongest so far: ${escapeHtml(summary.strongTypes.join(', '))}</div>`);
  if (summary.weakSpots.length) {
    rows.push(`<div class="row">Worth another pass: ${summary.weakSpots.map(spot => `${escapeHtml(spot.type)} (${spot.average}/5)`).join(', ')}</div>`);
  }
  if (summary.mostMissedDimension) rows.push(`<div class="row">Most often missing: <strong>${escapeHtml(summary.mostMissedDimension)}</strong>. Name the outcome and what changed because of you.</div>`);
  rows.push(`<div class="row">${summary.readyForRole ? 'Your answers are consistently well structured. That is a practice-quality signal, not a prediction about the interview.' : 'Keep going. A few more reps will tighten the weak spots above.'}</div>`);
  if ($('interviewSummaryBody')) $('interviewSummaryBody').innerHTML = rows.join('');
  setInterviewStatus('Practice complete.', 'good');
}

$('openInterviewPractice')?.addEventListener('click', openInterviewPractice);
$('closeInterviewPractice')?.addEventListener('click', closeInterviewPractice);
$('startInterviewPractice')?.addEventListener('click', startInterviewPractice);
$('submitInterviewAnswer')?.addEventListener('click', submitInterviewAnswer);
$('nextInterviewQuestion')?.addEventListener('click', nextInterviewQuestion);
$('skipInterviewQuestion')?.addEventListener('click', nextInterviewQuestion);
$('finishInterviewPractice')?.addEventListener('click', finishInterviewPractice);
$('restartInterviewPractice')?.addEventListener('click', openInterviewPractice);
$('interviewOverlay')?.addEventListener('click', event => { if (event.target === $('interviewOverlay')) closeInterviewPractice(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('interviewOverlay')?.classList.contains('open')) closeInterviewPractice();
});
