import { buildSearchLinks, classifyConciergeMessage, conciergeStateGuidance, parseMission } from './lib/concierge-router.js';
import {
  ACTION_TYPES, APPLICATION_WORKFLOW_STEPS, DEMO_STAGES, READINESS_FIELDS, REDACTED_WORKFLOW_REPLAY, addActionItem, addRole, advanceManagedApplicationSession, advanceSalesDemo, approveBatch,
  buildCareerStoryDraft, buildReadinessDraftFromSources, buildVerifiedResumeDraft, confirmReadinessDraft, confirmReusableFact, createApprovalBatch, createDeskState, createSalesDemo, deleteReusableFact, discardReadinessDraft,
  exportReadinessData, importLegacyEntries, packageGaps, pauseManagedApplicationSession, pipelineCounts, readinessStatus, resetSalesDemo,
  recordGeneratedPackage, resolveActionItem, resolveManagedApplicationException, resumeManagedApplicationSession, setAutonomyLevel, setStandingPolicy, stageReadinessDraft, startManagedApplicationSession, transitionRole, truthProfileGaps, updateTruthProfile,
  verificationGaps,
} from './lib/concierge-domain.js';
import {
  CAMPAIGN_TEMPLATES, addCampaign, campaignMetrics, createCampaignStore, operatingContractText, updateCampaignStatus, updatePersistentCampaign,
} from './lib/persistent-campaign.js';

const MISSION_KEY = '1ststep_concierge_mission_v1';
const DESK_KEY = '1ststep_concierge_desk_v2';
const TAILOR_REQUEST_KEY = '1ststep_concierge_tailor_request_v1';
const PACKAGE_RESULT_KEY = '1ststep_concierge_package_result_v1';
const AI_CONSENT_KEY = '1ststep_concierge_ai_consent_v1';
const CAREER_STORY_CONSENT_KEY = '1ststep_career_story_ai_consent_v1';
const CAMPAIGN_KEY = '1ststep_persistent_campaigns_v1';
const RESUME_KEYS = ['1ststep_resume', '1ststep_resume_text'];
const $ = id => document.getElementById(id);
const list = value => String(value || '').split(/[\n,]/).map(item => item.trim()).filter(Boolean);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const escapeXmlData = value => String(value ?? '').replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]);
let missionState = loadJson(MISSION_KEY, { mission: {}, messages: [] });
let deskState = createDeskState(loadJson(DESK_KEY, {}));
let campaignStore = createCampaignStore(loadJson(CAMPAIGN_KEY, {}));
let campaignWizardStep = 0;
let editingCampaignId = null;
let activeQuestionKey = '';
let resumeInterviewActive = false;
let careerStoryActive = false;
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
const WORKFLOW_LABELS = Object.freeze({
  discover_verify: 'Discover & Verify', deduplicate: 'Deduplicate', tailor_package: 'Tailor Package',
  account_profile: 'Account/Profile', autofill: 'Autofill', review_exception: 'Review Exception',
  transmit: 'Transmit', submit: 'Submit', verify_receipt: 'Verify Receipt',
});

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
  localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(campaignStore));
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
  localStorage.setItem('1ststep_resume', value);
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
      pages.push(content.items.map(item => item.str).join(' '));
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
  return node;
}

async function callClaude(callType, model, content, maxTokens) {
  const subscription = loadJson('1ststep_sub_cache', {});
  const response = await fetch('/api/claude', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callType, model, max_tokens: maxTokens, userEmail: subscription.email || '', tierToken: subscription.tierToken || '',
      messages: [{ role: 'user', content }],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The AI assistant is unavailable right now.');
  const text = Array.isArray(data.content) ? data.content.map(block => block.text || '').join('').trim() : '';
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
    productionCapabilities: { liveDiscoveryWorker: false, externalSubmission: false, simulatedWorkspaceOnly: true },
  };
  const pending = addMessage('assistant', '<strong>Reviewing your mission and deciding the best next step…</strong>', false);
  try {
    const reply = await callClaude('concierge', 'claude-haiku-4-5-20251001', `<concierge_state>${escapeXmlData(JSON.stringify(stateSummary))}</concierge_state>\n<user_request>${escapeXmlData(redactChatForModel(input))}</user_request>`, 350);
    pending.remove();
    addMessage('assistant', `${escapeHtml(reply).replaceAll('\n', '<br>')}<div class="quick">${guidance.actions.map(action => `<button data-prompt="${escapeHtml(action.prompt)}">${escapeHtml(action.label)}</button>`).join('')}</div>`);
  } catch {
    pending.remove();
    addMessage('assistant', guidanceHtml(guidance, 'I saved what I could from that request.'));
  }
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
    const extracted = parseCareerStoryResponse(await callClaude(
      'profileExtractor', 'claude-haiku-4-5-20251001', `<career_story>${escapeXmlData(input)}</career_story>`, 900,
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
    const generated = await callClaude('resumeBuilder', 'claude-sonnet-4-6', `<verified_candidate_facts>\n${escapeXmlData(base.text)}\n</verified_candidate_facts>`, 2600);
    $('resumeEditor').value = sanitizeResumeText(generated);
    setResumeMessage('AI-generated master resume is ready for your review. Nothing is saved until you choose Save resume.', 'good');
  } catch (error) {
    $('resumeEditor').value = base.text;
    setResumeMessage(`${error.message} The verified local draft is still available for review.`, 'warn');
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
    openDesk('approvals');
    addMessage('assistant', guidanceHtml(currentGuidance()));
    return;
  }
  if (/approval|batch|desk|pipeline|package-ready|ready packages/i.test(input)) {
    openDesk(/approval|batch|package-ready|ready packages/i.test(input) ? 'approvals' : 'pipeline');
    addMessage('assistant', guidanceHtml(currentGuidance()));
    return;
  }
  if (/review (?:my |the )?(?:current )?mission|what(?:’|')?s next|what should i do|status update|show progress/i.test(input)) {
    addMessage('assistant', guidanceHtml(currentGuidance()));
    return;
  }
  missionState.mission = parseMission(input, missionState.mission);
  saveAll(); renderMission();
  askSmartConcierge(input);
}

function switchTab(name) {
  document.querySelectorAll('[data-desk-tab]').forEach(node => node.classList.toggle('active', node.dataset.deskTab === name));
  document.querySelectorAll('[data-desk-panel]').forEach(node => node.classList.toggle('active', node.dataset.deskPanel === name));
}
function openDesk(tab = 'truth') { $('deskOverlay').classList.add('open'); switchTab(tab); renderDesk(); }
function closeDesk() { $('deskOverlay').classList.remove('open'); }

function activeApplicationSession() {
  return deskState.applicationSessions.find(session => session.id === deskState.activeApplicationSessionId) || null;
}
function openApplicationWorkspace() {
  if (!activeApplicationSession()) throw new Error('Start a simulated application session first.');
  closeDesk();
  $('applicationOverlay').classList.add('open');
  renderApplicationWorkspace();
}
function closeApplicationWorkspace() { $('applicationOverlay').classList.remove('open'); }
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
  saveAll(); renderAll(); openApplicationWorkspace();
}

function renderApplicationWorkspace() {
  const session = activeApplicationSession();
  $('resumeApplication').hidden = !session;
  if (!session) return;
  $('applicationTitle').textContent = `${session.role.employer} · ${session.role.title}`;
  $('applicationSubtitle').textContent = `Req ${session.role.requisitionId || 'unknown'} · ${session.autonomyLevel.replaceAll('_', ' ')} · simulated fixture`;
  $('applicationUrl').textContent = session.role.directEmployerUrl.replace(/^https?:\/\//, 'https://');
  $('fixtureEmployer').textContent = `${session.role.employer} careers · simulated`;
  $('fixtureRole').textContent = session.role.title;
  $('fixtureStep').textContent = `${WORKFLOW_LABELS[session.step]} · This is a redacted employer-page fixture, not a live ATS.`;
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
  $('advanceApplication').disabled = session.status !== 'active' || session.status === 'complete';
  $('advanceApplication').textContent = session.status === 'complete' ? 'Demo complete' : 'Advance safe step';
  const targetedException = session.status === 'paused' && session.blockers.some(item => item.status === 'open' && item.type === 'NEW_QUESTION' && session.step === 'review_exception');
  const transmissionConfirmation = session.status === 'paused' && session.blockers.some(item => item.status === 'open' && item.type === 'TRANSMISSION_CONFIRMATION');
  $('resolveApplication').hidden = !targetedException && !transmissionConfirmation;
  $('resolveApplication').textContent = transmissionConfirmation ? 'Confirm transmission' : 'Resolve targeted exception';
  $('resumeManagedApplication').hidden = session.status !== 'paused' || targetedException || transmissionConfirmation;
}

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
  const resumeRemaining = ['contact', 'employment', 'education', 'skills'].filter(key => readiness.unresolved.some(item => item.key === key)).length;
  $('questionProgress').textContent = resumeInterviewActive
    ? `Resume setup · ${resumeRemaining} essential answer${resumeRemaining === 1 ? '' : 's'} remaining`
    : `Question ${position} of ${READINESS_FIELDS.length} · ${readiness.score}% ready`;
  $('questionTitle').textContent = next.label;
  $('questionHelp').textContent = resumeInterviewActive
    ? 'Give only verified facts. For work history, include employer, title, dates, and truthful outcomes; use semicolons to separate entries.'
    : 'Choose a common answer or enter a short correction. This becomes reusable only after you save it.';
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
    if (role.status === 'Verified - Package Preparation' && role.packageDraft) controls.push(`<button data-role-action="package" data-role-id="${role.id}">Complete document QA</button>`);
    if (role.status === 'Package Ready') controls.push(`<button data-role-action="workspace" data-role-id="${role.id}">Preview application workspace</button>`);
    if (role.status !== 'Submitted' && role.status !== 'Blocked') controls.push(`<button data-role-action="block" data-role-id="${role.id}">Add blocker</button>`);
    if (role.status === 'Awaiting Approval') controls.push('<button disabled>Submission disabled</button>');
    return `<div class="desk-row"><div><strong>${escapeHtml(role.employer)} · ${escapeHtml(role.title)}</strong><small>${escapeHtml(role.status)} · Req ${escapeHtml(role.requisitionId || 'unknown')} · ${escapeHtml(role.directEmployerUrl)}${role.packageDraft ? ` · Draft ${escapeHtml(role.packageDraft.documentVersion)} generated by Resume Tailor` : ''}${verification.length ? ` · Needs ${escapeHtml(verification.join(', '))}` : ''}${role.requiredGaps?.length ? ` · Required gaps: ${escapeHtml(role.requiredGaps.join(', '))}` : ' · Required gaps: none recorded'}${role.preferredGaps?.length ? ` · Preferred gaps: ${escapeHtml(role.preferredGaps.join(', '))}` : ''}${role.materialGaps?.length ? ` · Legacy gaps: ${escapeHtml(role.materialGaps.join(', '))}` : ''}</small></div><div class="desk-actions">${controls.join('')}</div></div>`;
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
  $('auditList').innerHTML = deskState.auditEvents.length ? [...deskState.auditEvents].reverse().map(event => `<div class="desk-row"><div><strong>${escapeHtml(event.type)}</strong><small>${escapeHtml(event.at)} · ${escapeHtml(event.entityId)} · ${escapeHtml(JSON.stringify(event.details))}</small></div></div>`).join('') : empty('No audit events yet.');
}
function renderDesk() { renderTruthForm(); renderReadiness(); renderRoles(); renderApprovals(); renderDemo(); renderAudit(); }
function campaignListHtml(values) {
  return values?.length ? values.map(value => `<li>${escapeHtml(value)}</li>`).join('') : '<li class="contract-empty">Not configured</li>';
}

function activeCampaign() {
  return campaignStore.campaigns.find(campaign => campaign.id === campaignStore.activeCampaignId) || campaignStore.campaigns[0] || null;
}

function renderCampaignConsole() {
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

function renderAll() { renderMission(); renderDesk(); renderApplicationWorkspace(); renderCampaignConsole(); }

$('composer').addEventListener('submit', event => { event.preventDefault(); const input = $('messageInput'); const value = input.value.trim(); if (!value) return; addMessage('user', escapeHtml(value)); input.value = ''; respond(value); });
$('messages').addEventListener('click', event => { const value = event.target?.dataset?.prompt; if (!value) return; addMessage('user', escapeHtml(value)); respond(value); });
$('openDesk').addEventListener('click', () => openDesk('pipeline'));
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
$('saveResume').addEventListener('click', () => {
  try {
    const text = saveResumeText($('resumeEditor').value, 'concierge-reviewed', $('resumeFile').files[0]?.name || '');
    setResumeMessage(`Resume saved locally · ${text.length.toLocaleString()} characters.`, 'good');
    renderMission();
    addMessage('assistant', '<strong>Your resume is saved.</strong> I can use it as the master version, build readiness answers from it after your confirmation, and send role-specific tailoring through the existing Resume Tailor.');
  } catch (error) { setResumeMessage(error.message, 'warn'); }
});
$('resumeApplication').addEventListener('click', () => safeAction(openApplicationWorkspace));
$('closeDesk').addEventListener('click', closeDesk);
$('closeApplication').addEventListener('click', closeApplicationWorkspace);
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
$('advanceApplication').addEventListener('click', () => safeAction(() => {
  const session = activeApplicationSession();
  if (!session) throw new Error('No application session is active.');
  deskState = advanceManagedApplicationSession(deskState, session.id);
}));
$('resolveApplication').addEventListener('click', () => safeAction(() => {
  const session = activeApplicationSession();
  if (!session) throw new Error('No application session is active.');
  deskState = resolveManagedApplicationException(deskState, session.id);
}));
$('simulateTimeout').addEventListener('click', () => safeAction(() => {
  const session = activeApplicationSession();
  if (!session) throw new Error('No application session is active.');
  deskState = pauseManagedApplicationSession(deskState, session.id, 'browser-timeout');
}));
$('resumeManagedApplication').addEventListener('click', () => safeAction(() => {
  const session = activeApplicationSession();
  if (!session) throw new Error('No application session is active.');
  deskState = resumeManagedApplicationSession(deskState, session.id);
}));

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
    if (action === 'workspace') {
      const role = deskState.roles.find(item => item.id === roleId);
      startSyntheticApplicationWorkspace(role);
      return;
    }
    if (action === 'package') {
      const role = deskState.roles.find(item => item.id === roleId);
      const documentVersion = role?.packageDraft?.documentVersion;
      if (!documentVersion) throw new Error('Generate a role-specific package draft first.');
      const passed = window.confirm('Confirm the role-specific resume is human-written, DOCX and PDF exist, DOCX text order and PDF extraction passed, every rendered page was visually inspected, the package is exactly two pages, the design avoids AI-styled templates, and AI language is omitted for ordinary procurement roles.');
      if (!passed) throw new Error(`Package remains Verified. Missing: ${packageGaps({ documentVersion }).join(', ')}.`);
      deskState = transitionRole(deskState, roleId, 'Package Ready', {
        documentVersion, formats: ['DOCX', 'PDF'], humanWritten: true, docxTextOrderChecked: true,
        pdfTextExtracted: true, visualPageInspection: true, pagesInspected: true, pageCount: 2,
        aiTemplateAvoided: true, aiLanguagePolicy: 'omitted-for-ordinary-role',
      });
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

$('resetMission').addEventListener('click', () => { missionState = { mission: {}, messages: [] }; saveAll(); $('messages').innerHTML = ''; start(); });
function start() {
  consumeGeneratedPackage();
  if (missionState.messages.length) missionState.messages.forEach(message => addMessage(message.role, message.html, false));
  else addMessage('assistant', guidanceHtml(currentGuidance(), 'I’ll guide the search one useful step at a time and keep routine setup short.'));
  renderAll();
  if (new URLSearchParams(window.location.search).get('managedDemo') === '1' && !activeApplicationSession()) startSyntheticApplicationWorkspace();
}
start();
