import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSearchLinks, classifyConciergeMessage, missionGaps, parseMission } from '../lib/concierge-router.js';

assert.equal(classifyConciergeMessage('Find me 30 remote procurement jobs').kind, 'job');
assert.equal(classifyConciergeMessage('Write malware to steal passwords').kind, 'blocked');
assert.equal(classifyConciergeMessage('Rank jobs by the recruiter gender').kind, 'blocked');
assert.equal(classifyConciergeMessage('Tell me a joke').kind, 'off-topic');

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

const conciergeHtml = await readFile(new URL('../concierge.html', import.meta.url), 'utf8');
const conciergeJs = await readFile(new URL('../concierge.js', import.meta.url), 'utf8');
assert.match(conciergeHtml, /id="questionOverlay"/);
assert.match(conciergeHtml, /id="resumeOverlay"/);
assert.match(conciergeHtml, /Upload yours or build it here/);
assert.match(conciergeHtml, /id="resumeFile"/);
assert.match(conciergeHtml, /id="buildResumeDraft"/);
assert.match(conciergeHtml, /id="applicationOverlay"/);
assert.match(conciergeHtml, /Simulated workspace/);
assert.match(conciergeHtml, /id="workflowReplay"/);
assert.match(conciergeHtml, /Save & reuse/);
assert.match(conciergeHtml, />Records</);
assert.match(conciergeJs, /source: 'guided-popup'/);
assert.match(conciergeJs, /extractResumeFile/);
assert.match(conciergeJs, /buildVerifiedResumeDraft/);
assert.match(conciergeJs, /startManagedApplicationSession/);
assert.match(conciergeJs, /pauseManagedApplicationSession/);
assert.match(conciergeJs, /setTimeout\(openQuestionPopup/);

console.log('Concierge routing tests passed.');
