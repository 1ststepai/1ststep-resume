import assert from 'node:assert/strict';
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

console.log('Concierge routing tests passed.');
