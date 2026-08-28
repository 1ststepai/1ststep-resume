import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSearchLinks, classifyConciergeMessage, conciergeStateGuidance, missionGaps, parseMission } from '../lib/concierge-router.js';

assert.equal(classifyConciergeMessage('Find me 30 remote procurement jobs').kind, 'job');
assert.equal(classifyConciergeMessage('Write malware to steal passwords').kind, 'blocked');
assert.equal(classifyConciergeMessage('Rank jobs by the recruiter gender').kind, 'blocked');
assert.equal(classifyConciergeMessage('Tell me a joke').kind, 'off-topic');
assert.equal(classifyConciergeMessage('Build my CV').kind, 'job');

const mission = parseMission('I need 30 remote procurement jobs at $110k minimum');
assert.equal(mission.target, 30);
assert.equal(mission.workMode, 'Remote');
assert.equal(mission.role, 'procurement');
assert.equal(mission.salaryMin, 110000);
assert.deepEqual(missionGaps(mission, true), []);
assert.equal(buildSearchLinks(mission).length, 6);
assert.ok(buildSearchLinks(mission).every(item => item.url.startsWith('https://')));

const refined = parseMission('Skip category roles, prepare the strongest 10 and continue overnight by 8 a.m.', mission);
assert.deepEqual(refined.excludedRoleFamilies, ['category']);
assert.equal(refined.prepareCount, 10);
assert.equal(refined.runMode, 'overnight-requested');
assert.equal(refined.deadline, '8 a.m.');

const recurring = parseMission('Set 20 applications per day for remote buyer roles at $100k', mission);
assert.equal(recurring.recurringDailyTarget, 20);

assert.equal(conciergeStateGuidance({ hasResume: false }).priority, 'resume');
assert.equal(conciergeStateGuidance({ hasResume: true, mission: {} }).priority, 'mission');
assert.equal(conciergeStateGuidance({ hasResume: true, mission, unresolved: [{ key: 'contact', label: 'Contact information' }] }).priority, 'readiness');
assert.equal(conciergeStateGuidance({ hasResume: true, mission, openActions: 2 }).priority, 'human-action');
assert.equal(conciergeStateGuidance({ hasResume: true, mission, counts: { Verified: 2 } }).priority, 'packages');
assert.equal(conciergeStateGuidance({ hasResume: true, mission, counts: { 'Package Ready': 1 } }).priority, 'approval');

const conciergeHtml = await readFile(new URL('../concierge.html', import.meta.url), 'utf8');
const conciergeJs = await readFile(new URL('../concierge.js', import.meta.url), 'utf8');
const claudeApi = await readFile(new URL('../api/claude.js', import.meta.url), 'utf8');
assert.match(conciergeHtml, /id="questionOverlay"/);
assert.match(conciergeHtml, /id="resumeOverlay"/);
assert.match(conciergeHtml, /Upload yours or build it here/);
assert.match(conciergeHtml, /id="resumeFile"/);
assert.match(conciergeHtml, /id="buildResumeDraft"/);
assert.match(conciergeHtml, /id="careerStoryResume"/);
assert.match(conciergeHtml, /id="applicationOverlay"/);
assert.match(conciergeHtml, /Simulated workspace/);
assert.match(conciergeHtml, /id="workflowReplay"/);
assert.match(conciergeHtml, /Save & reuse/);
assert.match(conciergeHtml, />Job records</);
assert.match(conciergeHtml, /id="campaignOverlay"/);
assert.match(conciergeHtml, /Persistent AI Campaigns/);
assert.match(conciergeHtml, /Integration Required/);
assert.match(conciergeHtml, /Private execution context: session-only/);
assert.match(conciergeJs, /source: 'guided-popup'/);
assert.match(conciergeJs, /extractResumeFile/);
assert.match(conciergeJs, /buildVerifiedResumeDraft/);
assert.match(conciergeJs, /askSmartConcierge/);
assert.match(conciergeJs, /resumeInterviewActive/);
assert.match(conciergeJs, /AI_CONSENT_KEY/);
assert.match(conciergeJs, /redactChatForModel/);
assert.match(conciergeJs, /processCareerStory/);
assert.match(conciergeJs, /buildCareerStoryDraft/);
assert.match(conciergeJs, /startManagedApplicationSession/);
assert.match(conciergeJs, /pauseManagedApplicationSession/);
assert.match(conciergeJs, /openQuestionPopup/);
assert.match(conciergeJs, /createCampaignStore/);
assert.match(conciergeJs, /renderCampaignConsole/);
assert.match(claudeApi, /concierge:\s*`You are the job-only/);
assert.match(claudeApi, /resumeBuilder:\s*`You are an expert master-resume writer/);
assert.match(claudeApi, /profileExtractor:\s*`Extract only explicitly stated resume facts/);

console.log('Concierge routing tests passed.');
