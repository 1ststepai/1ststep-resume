import { buildSearchLinks, classifyConciergeMessage, missionGaps, parseMission } from './lib/concierge-router.js';
import {
  ACTION_TYPES, DEMO_STAGES, READINESS_FIELDS, addActionItem, addRole, advanceSalesDemo, approveBatch,
  buildReadinessDraftFromSources, confirmReadinessDraft, confirmReusableFact, createApprovalBatch, createDeskState, createSalesDemo, deleteReusableFact, discardReadinessDraft,
  exportReadinessData, importLegacyEntries, packageGaps, pipelineCounts, readinessStatus, resetSalesDemo,
  recordGeneratedPackage, resolveActionItem, setAutonomyLevel, setStandingPolicy, stageReadinessDraft, transitionRole, truthProfileGaps, updateTruthProfile,
  verificationGaps,
} from './lib/concierge-domain.js';

const MISSION_KEY = '1ststep_concierge_mission_v1';
const DESK_KEY = '1ststep_concierge_desk_v2';
const TAILOR_REQUEST_KEY = '1ststep_concierge_tailor_request_v1';
const PACKAGE_RESULT_KEY = '1ststep_concierge_package_result_v1';
const RESUME_KEYS = ['1ststep_resume', '1ststep_resume_text'];
const $ = id => document.getElementById(id);
const list = value => String(value || '').split(/[\n,]/).map(item => item.trim()).filter(Boolean);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
let missionState = loadJson(MISSION_KEY, { mission: {}, messages: [] });
let deskState = createDeskState(loadJson(DESK_KEY, {}));
let activeQuestionKey = '';
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
function saveAll() {
  localStorage.setItem(MISSION_KEY, JSON.stringify(missionState));
  localStorage.setItem(DESK_KEY, JSON.stringify(deskState));
}
function hasResume() {
  return RESUME_KEYS.some(key => [sessionStorage, localStorage].some(storage => String(storage.getItem(key) || '').trim().length > 100));
}
function savedResumeText() {
  for (const storage of [sessionStorage, localStorage]) {
    for (const key of RESUME_KEYS) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const text = typeof parsed === 'string' ? parsed : parsed?.text;
        if (String(text || '').trim()) return String(text).trim();
      } catch { if (raw.trim()) return raw.trim(); }
    }
  }
  return '';
}
function money(value) { return value ? `$${Math.round(value / 1000)}k+` : 'Not set'; }
function empty(text) { return `<div class="desk-empty">${escapeHtml(text)}</div>`; }
function showDeskMessage(message = '', error = false) {
  const box = $('deskError');
  box.textContent = message;
  box.classList.toggle('show', Boolean(message));
  box.style.color = error ? '#fca5a5' : '#9ff0cc';
  box.style.borderColor = error ? 'rgba(248,113,113,.35)' : 'rgba(64,213,155,.35)';
}
function safeAction(action) {
  try { showDeskMessage(); action(); saveAll(); renderAll(); }
  catch (error) { showDeskMessage(error.message, true); }
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
}

function renderMission() {
  const mission = missionState.mission || {};
  const counts = pipelineCounts(deskState);
  const submitted = counts.Submitted || 0;
  const target = mission.target || 0;
  const readiness = readinessStatus(deskState);
  $('missionName').textContent = mission.role ? `${mission.target}-job ${mission.role} sprint` : 'No active mission';
  $('target').textContent = target;
  $('completed').textContent = submitted;
  $('progressBar').style.width = target ? `${Math.min(100, (submitted / target) * 100)}%` : '0%';
  $('stageCounts').innerHTML = Object.entries(counts).map(([status, count]) => `<span>${escapeHtml(status)} ${count}</span>`).join('');
  $('resumeStatus').textContent = hasResume() ? 'Saved resume detected' : 'Resume needed';
  $('truthStatus').textContent = `${readiness.score}% ready · ${deskState.autonomy.level.replaceAll('_', ' ')}`;
  $('roleStatus').textContent = mission.role || 'Not set';
  $('modeStatus').textContent = [mission.workMode, mission.location].filter(Boolean).join(' · ') || 'Not set';
  $('salaryStatus').textContent = money(mission.salaryMin);
  $('searchLinks').innerHTML = mission.role ? buildSearchLinks(mission).map(link => `<a class="search-link" target="_blank" rel="noopener" href="${link.url}">${escapeHtml(link.label)}</a>`).join('') : '';
}

function respond(input) {
  const classification = classifyConciergeMessage(input);
  if (classification.kind === 'blocked') {
    const copy = classification.reason === 'protected-trait'
      ? '<strong>I can’t rank jobs or candidates using protected traits.</strong> I can use verified experience, role requirements, compensation, location, schedule, and skills.'
      : '<strong>I can’t accept passwords, OTPs, CAPTCHA answers, bypasses, or malicious requests.</strong> Keep authentication in your browser; I can queue the human step and continue other job work.';
    addMessage('assistant', copy); return;
  }
  if (classification.kind === 'off-topic') { addMessage('assistant', 'I only handle job-search work: readiness, discovery, truthful documents, applications, tracking, interviews, and follow-up.'); return; }
  if (classification.kind === 'empty') return;
  missionState.mission = parseMission(input, missionState.mission);
  saveAll(); renderMission();
  if (/readiness|onboarding|autonomy|answer next|application question/i.test(input)) {
    const readiness = readinessStatus(deskState);
    addMessage('assistant', `<strong>Your application setup is ${readiness.score}% complete.</strong> I’ll ask one short question at a time and save confirmed answers for matching applications.`);
    openQuestionPopup();
    return;
  }
  if (/approval|batch|desk|pipeline/i.test(input)) openDesk(/approval|batch/i.test(input) ? 'approvals' : 'pipeline');
  const gaps = missionGaps(missionState.mission, hasResume());
  const readiness = readinessStatus(deskState);
  if (gaps.length) {
    addMessage('assistant', `<strong>I saved the mission request.</strong> I still need ${escapeHtml(gaps.join(', '))}. Application setup is ${readiness.score}% complete; I’ll ask only short missing questions.<div class="quick"><button data-prompt="Answer next application question">Answer next question</button><button data-prompt="Remote only, $100k minimum">Remote · $100k+</button></div>`);
    return;
  }
  const extras = [
    missionState.mission.excludedRoleFamilies?.length ? `Excluded: ${missionState.mission.excludedRoleFamilies.join(', ')}` : '',
    missionState.mission.prepareCount ? `Prepare strongest ${missionState.mission.prepareCount}` : '',
    missionState.mission.recurringDailyTarget ? `${missionState.mission.recurringDailyTarget}/day recurring target` : '',
    missionState.mission.deadline ? `Deadline ${missionState.mission.deadline}` : '',
  ].filter(Boolean).join(' · ');
  addMessage('assistant', `<strong>Mission created: ${missionState.mission.target} ${escapeHtml(missionState.mission.workMode.toLowerCase())} ${escapeHtml(missionState.mission.role)} jobs at ${money(missionState.mission.salaryMin)}.</strong>${extras ? `<br>${escapeHtml(extras)}` : ''}<br>Application setup is ${readiness.score}%. I can prepare and stage locally now. Overnight discovery still needs a durable provider and worker; this browser cannot claim background work after it closes.<div class="quick"><button data-prompt="Open the application pipeline">Open pipeline</button><button data-prompt="Answer next application question">Answer next question</button></div>`);
  if (!readiness.complete) setTimeout(openQuestionPopup, 0);
}

function switchTab(name) {
  document.querySelectorAll('[data-desk-tab]').forEach(node => node.classList.toggle('active', node.dataset.deskTab === name));
  document.querySelectorAll('[data-desk-panel]').forEach(node => node.classList.toggle('active', node.dataset.deskPanel === name));
}
function openDesk(tab = 'truth') { $('deskOverlay').classList.add('open'); switchTab(tab); renderDesk(); }
function closeDesk() { $('deskOverlay').classList.remove('open'); }

function openQuestionPopup(fieldKey = '') {
  const readiness = readinessStatus(deskState);
  const next = readiness.unresolved.find(item => item.key === fieldKey) || readiness.unresolved[0];
  if (!next) {
    closeQuestionPopup();
    addMessage('assistant', '<strong>Application setup complete.</strong> I’ll reuse verified answers when wording and scope match, and pause only for targeted exceptions.');
    return;
  }
  activeQuestionKey = next.key;
  const position = READINESS_FIELDS.findIndex(([key]) => key === next.key) + 1;
  $('questionProgress').textContent = `Question ${position} of ${READINESS_FIELDS.length} · ${readiness.score}% ready`;
  $('questionTitle').textContent = next.label;
  $('questionHelp').textContent = 'Choose a common answer or enter a short correction. This becomes reusable only after you save it.';
  $('questionValue').value = '';
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
    ? 'Interview complete. Automation still respects scope, confidence, targeted exceptions, and human-controlled security gates.'
    : `${readiness.unresolved.length} confirmed answer${readiness.unresolved.length === 1 ? '' : 's'} remaining. New users default to Auto-fill then review.`;
  $('unresolvedCount').textContent = `(${readiness.unresolved.length})`;
  $('autonomyLevel').value = deskState.autonomy.level;
  $('factField').innerHTML = READINESS_FIELDS.map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join('');
  $('unresolvedList').innerHTML = readiness.unresolved.length
    ? readiness.unresolved.map(item => `<div class="desk-row"><div><strong>${escapeHtml(item.label)}</strong><small>Needs an explicit confirmed value or policy.</small></div></div>`).join('')
    : empty('No unresolved readiness questions.');
  $('factList').innerHTML = deskState.reusableFacts.length
    ? deskState.reusableFacts.map(fact => `<div class="desk-row"><div><strong>${escapeHtml(fact.label)}</strong><small>${escapeHtml(fact.value)} · ${escapeHtml(fact.verificationState)} · ${escapeHtml(fact.source)} · ${escapeHtml(fact.sensitivity)} · ${fact.autoReuse ? 'auto-reuse allowed in scope' : 'manual reuse only'}</small></div><div class="desk-actions"><button data-delete-fact="${fact.id}">Delete</button></div></div>`).join('')
    : empty('No confirmed reusable answers yet.');
  $('policyList').innerHTML = deskState.standingPolicies.length
    ? deskState.standingPolicies.map(policy => `<div class="desk-row"><div><strong>${escapeHtml(policy.policyKey)}</strong><small>${escapeHtml(policy.decision)} · confirmed ${escapeHtml(policy.updatedAt)}</small></div></div>`).join('')
    : empty('No standing authorizations confirmed.');
  const draft = deskState.readinessDraft;
  const pending = draft?.status === 'pending' && draft.proposals?.length;
  $('readinessDraftPanel').style.display = pending ? 'block' : 'none';
  $('readinessDraftList').innerHTML = pending ? draft.proposals.map(proposal => `<div class="desk-row"><div><strong>${escapeHtml(proposal.label)}</strong><small>${escapeHtml(proposal.value)} · ${escapeHtml(proposal.source)} · proposed confidence ${Math.round(proposal.confidence * 100)}%</small></div></div>`).join('') : '';
}

function renderRoles() {
  const counts = pipelineCounts(deskState);
  $('deskCounts').innerHTML = Object.entries(counts).map(([status, count]) => `<span>${escapeHtml(status)} ${count}</span>`).join('');
  $('roleList').innerHTML = deskState.roles.length ? deskState.roles.map(role => {
    const verification = verificationGaps(role);
    const controls = [];
    if (role.status === 'Found') controls.push(`<button data-role-action="verify" data-role-id="${role.id}" ${verification.length ? 'disabled' : ''}>Verify</button>`);
    if (role.status === 'Verified' && !role.packageDraft) controls.push(`<button data-role-action="generate" data-role-id="${role.id}" ${!role.jobDescription || !hasResume() ? 'disabled' : ''}>${!role.jobDescription ? 'Job description needed' : !hasResume() ? 'Resume needed' : 'Generate tailored resume'}</button>`);
    if (role.status === 'Verified' && role.packageDraft) controls.push(`<button data-role-action="package" data-role-id="${role.id}">Complete document QA</button>`);
    if (role.status !== 'Submitted' && role.status !== 'Blocked') controls.push(`<button data-role-action="block" data-role-id="${role.id}">Add blocker</button>`);
    if (role.status === 'Awaiting Approval') controls.push('<button disabled>Submission disabled</button>');
    return `<div class="desk-row"><div><strong>${escapeHtml(role.employer)} · ${escapeHtml(role.title)}</strong><small>${escapeHtml(role.status)} · Req ${escapeHtml(role.requisitionId || 'unknown')} · ${escapeHtml(role.directEmployerUrl)}${role.packageDraft ? ` · Draft ${escapeHtml(role.packageDraft.documentVersion)} generated by Resume Tailor` : ''}${verification.length ? ` · Needs ${escapeHtml(verification.join(', '))}` : ''}${role.materialGaps?.length ? ` · Gaps: ${escapeHtml(role.materialGaps.join(', '))}` : ''}</small></div><div class="desk-actions">${controls.join('')}</div></div>`;
  }).join('') : empty('No roles captured. Import the tracker or add verified direct-employer evidence.');
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
  $('auditList').innerHTML = deskState.auditEvents.length ? [...deskState.auditEvents].reverse().map(event => `<div class="desk-row"><div><strong>${escapeHtml(event.type)}</strong><small>${escapeHtml(event.at)} · ${escapeHtml(event.entityId)} · ${escapeHtml(JSON.stringify(event.details))}</small></div></div>`).join('') : empty('No audit events yet.');
}
function renderDesk() { renderTruthForm(); renderReadiness(); renderRoles(); renderApprovals(); renderDemo(); renderAudit(); }
function renderAll() { renderMission(); renderDesk(); }

$('composer').addEventListener('submit', event => { event.preventDefault(); const input = $('messageInput'); const value = input.value.trim(); if (!value) return; addMessage('user', escapeHtml(value)); input.value = ''; respond(value); });
$('messages').addEventListener('click', event => { const value = event.target?.dataset?.prompt; if (!value) return; addMessage('user', escapeHtml(value)); respond(value); });
$('openDesk').addEventListener('click', () => openDesk('pipeline'));
$('closeDesk').addEventListener('click', closeDesk);
$('deskOverlay').addEventListener('click', event => { if (event.target === $('deskOverlay')) closeDesk(); });
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
  safeAction(() => {
    deskState = confirmReusableFact(deskState, {
      fieldKey: activeQuestionKey, value, confirmed: true, verificationState: 'user-confirmed',
      source: 'guided-popup', sensitivity: SENSITIVE_QUESTION_KEYS.has(activeQuestionKey) ? 'sensitive' : 'standard', autoReuse: true,
    });
  });
  setTimeout(() => openQuestionPopup(), 80);
});
$('questionLater').addEventListener('click', closeQuestionPopup);
$('questionOverlay').addEventListener('click', event => { if (event.target === $('questionOverlay')) closeQuestionPopup(); });

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
    deskState = confirmReusableFact(deskState, {
      fieldKey: $('factField').value, value: $('factValue').value, source: $('factSource').value,
      verificationState: $('factSource').value === 'document-verified' ? 'document-verified' : 'user-confirmed',
      sensitivity: $('factSensitivity').value, autoReuse: $('factAutoReuse').checked, confirmed: $('factConfirmed').checked,
    });
    event.target.reset(); showDeskMessage('Confirmed reusable answer saved locally.');
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
$('autonomyLevel').addEventListener('change', event => safeAction(() => { deskState = setAutonomyLevel(deskState, event.target.value); showDeskMessage(event.target.value === 'auto_submit' ? 'Auto-submit selected, but remains blocked until readiness is complete, an audited baseline exists, every field maps confidently, and production submission is separately enabled.' : 'Autonomy level updated.'); }));
$('exportReadiness').addEventListener('click', () => { const blob = new Blob([exportReadinessData(deskState)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `1ststep-readiness-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); });

$('roleForm').addEventListener('submit', event => { event.preventDefault(); safeAction(() => {
  const result = addRole(deskState, {
    employer: $('roleEmployer').value, title: $('roleTitle').value, requisitionId: $('roleReq').value,
    jobDescription: $('roleDescription').value,
    directEmployerUrl: $('roleUrl').value, sourceType: $('roleSource').value, applyPathActive: $('roleApplyActive').checked,
    remoteEligibility: $('roleRemote').value, geographyEligibility: $('roleGeo').value,
    salaryMin: $('roleSalaryMin').value, salaryMax: $('roleSalaryMax').value, salaryDisclosure: $('roleSalaryDisclosure').value,
    postedDate: $('rolePosted').value, travel: $('roleTravel').value, schedule: $('roleSchedule').value,
    materialGaps: list($('roleGaps').value), recruiterContact: $('roleRecruiter').value, attestations: list($('roleAttestations').value),
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
  safeAction(() => {
    if (action === 'verify') deskState = transitionRole(deskState, roleId, 'Verified');
    if (action === 'generate') {
      const role = deskState.roles.find(item => item.id === roleId);
      if (!role?.jobDescription) throw new Error('A verified full job description is required for truthful tailoring.');
      if (!hasResume()) throw new Error('Save a master resume in Resume Tailor first.');
      sessionStorage.setItem(TAILOR_REQUEST_KEY, JSON.stringify({
        roleId: role.id, employer: role.employer, title: role.title, requisitionId: role.requisitionId,
        directEmployerUrl: role.directEmployerUrl, jobDescription: role.jobDescription,
        requestedAt: new Date().toISOString(), autoStart: true,
      }));
      window.location.assign('/?mode=resume&conciergeTailor=1');
      return;
    }
    if (action === 'package') {
      const role = deskState.roles.find(item => item.id === roleId);
      const documentVersion = role?.packageDraft?.documentVersion;
      if (!documentVersion) throw new Error('Generate a role-specific package draft first.');
      const passed = window.confirm('Confirm DOCX and PDF exist, ATS text order was extracted, every rendered page was inspected, and the package is exactly two pages.');
      if (!passed) throw new Error(`Package remains Verified. Missing: ${packageGaps({ documentVersion }).join(', ')}.`);
      deskState = transitionRole(deskState, roleId, 'Package Ready', { documentVersion, formats: ['DOCX', 'PDF'], atsTextExtracted: true, pagesInspected: true, pageCount: 2 });
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
$('advanceDemo').addEventListener('click', () => safeAction(() => { deskState = advanceSalesDemo(deskState); }));
$('resetDemo').addEventListener('click', () => safeAction(() => { deskState = resetSalesDemo(deskState); showDeskMessage('Synthetic demo reset.'); }));

$('resetMission').addEventListener('click', () => { missionState = { mission: {}, messages: [] }; saveAll(); $('messages').innerHTML = ''; start(); });
function start() {
  consumeGeneratedPackage();
  if (missionState.messages.length) missionState.messages.forEach(message => addMessage(message.role, message.html, false));
  else addMessage('assistant', '<strong>What job outcome do you want?</strong><br>Tell me the count, titles, work mode/location, salary range, and exclusions. I’ll ask any missing application questions one at a time and remember confirmed answers.<div class="quick"><button data-prompt="I need 30 remote procurement jobs, $100k minimum, using my saved resume">Start a 30-job sprint</button><button data-prompt="Answer next application question">Answer next question</button></div>');
  renderAll();
}
start();
