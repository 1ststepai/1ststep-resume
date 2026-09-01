import assert from 'node:assert/strict';
import {
  CAMPAIGN_TEMPLATES, addCampaign, addCampaignItem, campaignAnalyticsEvent, campaignMetrics,
  createCampaignRun, createCampaignStore, createPersistentCampaign, operatingContractText,
  queueCampaignHumanAction, transitionCampaignItem, updateCampaignStatus, validateOperatingContract,
} from '../lib/persistent-campaign.js';

const at = '2026-08-28T12:00:00.000Z';
const template = CAMPAIGN_TEMPLATES[1];
const campaign = createPersistentCampaign({
  ...template,
  cadence: { timezone: 'America/New_York', recurrence: 'weekdays at 08:00' },
  targets: { runTarget: 12 },
  reportingRequirements: ['Report exact counts and blockers'],
}, at);
assert.equal(campaign.name, 'Vendor Sourcing');
assert.equal(campaign.status, 'design');
assert.equal(campaign.privacyPolicy.persistPrivateExecutionContext, false);
assert.equal(campaign.privacyPolicy.privateContextRetention, 'session_only');
assert.equal(validateOperatingContract(campaign).complete, true);
assert.match(operatingContractText(campaign), /STOP CONDITIONS/);

assert.throws(() => createPersistentCampaign({ name: 'Unsafe', objective: 'Contact person@example.com' }), /Private or secret/);
assert.throws(() => createPersistentCampaign({ name: 'Unsafe', objective: 'my password is hunter2' }), /Private or secret/);
assert.throws(() => createPersistentCampaign({ name: 'Unsafe', privateContext: 'secret' }), /Private execution field/);
assert.doesNotMatch(JSON.stringify(CAMPAIGN_TEMPLATES), /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);

let store = addCampaign(createCampaignStore(), campaign, at);
const campaignId = store.activeCampaignId;
assert.throws(() => updateCampaignStatus(store, campaignId, 'active'), /Integration Required/);
assert.throws(() => createCampaignRun(store, campaignId), /Integration Required/);

let added = addCampaignItem(store, campaignId, { id: 'vendor-a', title: 'Vendor A' }, at);
store = added.store;
added = addCampaignItem(store, campaignId, { id: 'vendor-b', title: 'Vendor B' }, at);
store = added.store;
store = queueCampaignHumanAction(store, 'vendor-a', {
  blockerType: 'MATERIAL_CONSENT', reason: 'Contract terms need review', requiredUserAction: 'Review the terms',
}, at);
assert.equal(store.items.find(item => item.id === 'vendor-a').status, 'Awaiting Human Action');
assert.equal(store.items.find(item => item.id === 'vendor-b').status, 'Discovered');
assert.equal(store.humanActions.length, 1);

assert.throws(() => transitionCampaignItem(store, 'vendor-b', { newStatus: 'Verified Complete' }, at), /authoritative evidence/);
store = transitionCampaignItem(store, 'vendor-b', {
  newStatus: 'Verified Complete', evidence: {
    evidenceType: 'authoritative_source', evidenceReference: 'source-record-17', source: 'vendor portal', verificationMethod: 'direct review',
  },
}, at);
assert.equal(campaignMetrics(store, campaignId).completed, 1);
assert.equal(store.evidence.length, 1);

const analytics = campaignAnalyticsEvent('campaign_run', {
  campaignType: 'vendor_sourcing', itemCount: 2, promptText: 'private', email: 'person@example.com', objective: 'private',
});
assert.deepEqual(analytics.metadata, { campaignType: 'vendor_sourcing', itemCount: 2 });

console.log('Persistent campaign domain tests passed.');
