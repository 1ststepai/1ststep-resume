import { buildSearchLinks, classifyConciergeMessage, missionGaps, parseMission } from './lib/concierge-router.js';

const STORAGE_KEY = '1ststep_concierge_mission_v1';
const RESUME_KEYS = ['1ststep_resume', '1ststep_resume_text'];
const $ = id => document.getElementById(id);
let state = loadState();

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || { mission: {}, completed: 0, messages: [] }; }
  catch { return { mission: {}, completed: 0, messages: [] }; }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function hasResume() { return RESUME_KEYS.some(key => String(localStorage.getItem(key) || '').trim().length > 100); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function addMessage(role, html, persist = true) {
  const node = document.createElement('div'); node.className = `bubble ${role}`; node.innerHTML = html; $('messages').appendChild(node); $('messages').scrollTop = $('messages').scrollHeight;
  if (persist) { state.messages.push({ role, html }); state.messages = state.messages.slice(-30); saveState(); }
}
function money(value) { return value ? `$${Math.round(value / 1000)}k+` : 'Not set'; }
function renderMission() {
  const m = state.mission || {}; const target = m.target || 0; const complete = Math.min(state.completed || 0, target);
  $('missionName').textContent = m.role ? `${m.target}-job ${m.role} sprint` : 'No active mission'; $('target').textContent = target; $('completed').textContent = complete; $('progressBar').style.width = target ? `${(complete / target) * 100}%` : '0%';
  $('resumeStatus').textContent = hasResume() ? 'Saved resume detected' : 'Resume needed'; $('roleStatus').textContent = m.role || 'Not set'; $('modeStatus').textContent = [m.workMode, m.location].filter(Boolean).join(' · ') || 'Not set'; $('salaryStatus').textContent = money(m.salaryMin);
  $('searchLinks').innerHTML = m.role ? buildSearchLinks(m).map(link => `<a class="search-link" target="_blank" rel="noopener" href="${link.url}">${escapeHtml(link.label)}</a>`).join('') : '';
}
function respond(input) {
  const classification = classifyConciergeMessage(input);
  if (classification.kind === 'blocked') return addMessage('assistant', classification.reason === 'protected-trait' ? '<strong>I can’t rank candidates or jobs using protected traits.</strong> I can filter by role requirements, location, compensation, schedule, skills, and verified experience.' : '<strong>I can’t handle passwords, OTPs, CAPTCHA answers, bypasses, or malicious requests.</strong> Keep authentication in your own browser. I can continue with the job-search work around that gate.');
  if (classification.kind === 'off-topic') return addMessage('assistant', 'I’m the 1stStep Application Concierge, so I only handle job-search tasks: finding roles, truthful resumes, applications, tracking, interview prep, and follow-up.');
  if (classification.kind === 'empty') return;
  state.mission = parseMission(input, state.mission); saveState(); renderMission();
  const gaps = missionGaps(state.mission, hasResume());
  if (gaps.length) return addMessage('assistant', `<strong>I started the mission.</strong> Before I can build a trustworthy approval batch, I still need ${escapeHtml(gaps.join(', '))}. Tell me those details here${!hasResume() ? ' or open Resume Tailor and save your resume first' : ''}.<div class="quick"><button data-prompt="Remote only, $100k minimum">Remote · $100k+</button><button data-prompt="Use my saved resume">Use saved resume</button></div>`);
  addMessage('assistant', `<strong>Mission created: ${state.mission.target} ${escapeHtml(state.mission.workMode.toLowerCase())} ${escapeHtml(state.mission.role)} jobs at ${money(state.mission.salaryMin)}.</strong><br>I’ll keep the work truthful and receipt-based. Use the verified-source launchers in Mission Control to capture live employer roles. The next milestone is an approval batch—not automatic submission.<div class="quick"><button data-prompt="Show me the approval workflow">Show approval workflow</button><button data-prompt="Help me prepare for interviews">Interview prep</button></div>`);
}

$('composer').addEventListener('submit', event => { event.preventDefault(); const input = $('messageInput'); const value = input.value.trim(); if (!value) return; addMessage('user', escapeHtml(value)); input.value = ''; respond(value); });
$('messages').addEventListener('click', event => { const value = event.target?.dataset?.prompt; if (!value) return; addMessage('user', escapeHtml(value)); respond(value); });
$('resetMission').addEventListener('click', () => { state = { mission: {}, completed: 0, messages: [] }; saveState(); $('messages').innerHTML = ''; start(); });
function start() { if (state.messages.length) state.messages.forEach(m => addMessage(m.role, m.html, false)); else addMessage('assistant', `<strong>What job outcome do you want?</strong><br>Tell me the number of applications, titles, remote/location preference, minimum salary, and whether your resume is already saved.<div class="quick"><button data-prompt="I need 30 remote jobs, $100k minimum, using my saved resume">Start a 30-job sprint</button></div>`); renderMission(); }
start();
