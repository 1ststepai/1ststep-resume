import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { addRole, createDeskState, verificationGaps } from '../client/concierge-domain.js';
import { restoredJobCardIsRelevant } from '../client/job-mission-relevance.js';
import { validateDurableCampaignState } from '../lib/tenant-campaign-store.js';

const conciergeSource = await readFile(new URL('../concierge.js', import.meta.url), 'utf8');
assert.match(conciergeSource, /event\.source !== window \|\| event\.origin !== window\.location\.origin/);
assert.match(conciergeSource, /captureId !== jobCaptureIdFromUrl\(\)/);
assert.match(conciergeSource, /pendingJobAgentCapture = \{ captureId, jobData \}/);
assert.doesNotMatch(conciergeSource, /JOB_CAPTURE_KEY|sessionStorage\.setItem\('1ststep_pending_capture'/,
  'Job Agent must not duplicate the raw captured posting into clear-text browser storage');
assert.doesNotMatch(conciergeSource.slice(conciergeSource.indexOf("event.data.type !== '1STSTEP_JOB_CAPTURE'"), conciergeSource.indexOf('const LOCAL_APPLICATION_UI_FIXTURE')), /1STSTEP_JOB_CAPTURE_ACK/,
  'Job Agent must leave the extension capture available for an explicit Resume Builder handoff');
assert.doesNotMatch(conciergeSource.slice(conciergeSource.indexOf('function consumeJobAgentCapture'), conciergeSource.indexOf('function workingIndicator')), /runTailoring\(|generateDurablePackage\(|startDurableApplication\(/,
  'receiving a generic capture must not generate, apply, or spend automatically');
assert.match(conciergeSource, /Captured page: \$\{job\.location\} \(not independently verified\)/,
  'captured location must be shown as unverified evidence');
assert.match(conciergeSource, /Captured page: \$\{job\.salaryText\} \(not independently verified\)/,
  'captured pay must be shown as unverified evidence');

const added = addRole(createDeskState({}), {
  id: 'captured_test', employer: 'Example Supply', title: 'Senior Buyer',
  directEmployerUrl: 'https://jobs.example.test/123', sourceUrl: 'https://jobs.example.test/123',
  sourceType: 'user-captured', applyPathActive: false,
  jobDescription: 'A user-selected job description that still requires direct-employer verification.',
  sourceProvider: 'jobs.example.test',
});
assert.equal(added.role.status, 'Found');
assert.equal(added.role.sourceType, 'user-captured');
assert.equal(added.role.applyPathActive, false);
assert.equal(restoredJobCardIsRelevant(added.role, { role: 'Unrelated Engineer' }), true, 'a user capture must remain visible for review');
assert.ok(verificationGaps(added.role).includes('direct employer source'));
assert.ok(verificationGaps(added.role).includes('active Apply path'));

const durableState = {
  version: 1, campaigns: [], activeCampaignId: '', runs: [], items: [], humanActions: [], evidence: [], transitions: [],
  subscriberView: {
    version: 1, runState: null, needsYou: [],
    jobCards: [{
      id: added.role.id, employer: added.role.employer, title: added.role.title, status: 'Found',
      sourceType: 'user-captured', sourceProvider: 'jobs.example.test', applyPathActive: false,
      sourceUrl: added.role.sourceUrl, directEmployerUrl: added.role.directEmployerUrl,
    }],
  },
};
assert.equal(validateDurableCampaignState(durableState).subscriberView.jobCards[0].sourceType, 'user-captured');
assert.throws(() => validateDurableCampaignState({
  ...durableState,
  subscriberView: { ...durableState.subscriberView, jobCards: [{ ...durableState.subscriberView.jobCards[0], jobDescription: 'private captured text' }] },
}), /Unsupported durable subscriber field/);

console.log('Job Agent capture stays in memory, user-selected, unverified, metadata-only when durable, visible for review, and never auto-generates or submits.');
