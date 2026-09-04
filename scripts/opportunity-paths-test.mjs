import assert from 'node:assert/strict';
import { OPPORTUNITY_PATHS, OPPORTUNITY_SECTORS, authoritativeOutcomesFromApplicationSessions, classifyOpportunityPath, mergeAuthoritativeOutcomeEvidence, opportunityPathOutcomeEvidence, rankOpportunityPaths, suggestedOpportunityPaths } from '../lib/opportunity-paths.js';

assert.equal(classifyOpportunityPath({ title: 'Senior Strategic Sourcing Manager' }).id, 'procurement');
assert.equal(classifyOpportunityPath({ title: 'Customer Success Manager' }).id, 'customer-success');
assert.equal(classifyOpportunityPath({ title: 'Dentist' }), null);
assert.equal(OPPORTUNITY_PATHS.length, 19);
assert.equal(OPPORTUNITY_SECTORS.length, 6);
assert.equal(classifyOpportunityPath({ title: 'Registered Nurse Care Coordinator' }).id, 'healthcare');
assert.equal(classifyOpportunityPath({ title: 'Senior Data Scientist' }).id, 'data-ai');
assert.equal(classifyOpportunityPath({ title: 'Supply Chain Logistics Manager' }).id, 'supply-logistics');
assert.equal(classifyOpportunityPath({ title: 'Compliance Risk Analyst' }).id, 'legal-compliance');

const suggestions = suggestedOpportunityPaths({ skills: ['supplier management', 'strategic sourcing'] }, '', 2);
assert.equal(suggestions[0].id, 'procurement');

const jobs = [
  { title: 'Procurement Manager', fitScore: 88 },
  { title: 'Strategic Sourcing Manager', fitScore: 82 },
  { title: 'Customer Success Manager', fitScore: 76 },
];
const outcomes = Array.from({ length: 5 }, (_, index) => ({ title: 'Procurement Manager', stage: index < 3 ? 'Recruiter Screen' : 'Applied', authoritativeReceiptVerified: true }));
const ranked = rankOpportunityPaths({ jobs, outcomes, profile: { skills: ['procurement'] } });
const procurement = ranked.find(path => path.id === 'procurement');
assert.equal(procurement.openings, 2);
assert.equal(procurement.qualifiedOpenings, 2);
assert.equal(procurement.interviewRate, 60);
assert.equal(procurement.outcomeConfidence, 'directional');

const reliable = opportunityPathOutcomeEvidence(
  classifyOpportunityPath({ title: 'Procurement Manager' }),
  Array.from({ length: 20 }, (_, index) => ({ title: 'Procurement Manager', stage: index < 8 ? 'Recruiter Screen' : 'Applied', authoritativeReceiptVerified: true })),
);
assert.deepEqual(reliable, { sampleSize: 20, screens: 8, offers: 0, interviewRate: 40, offerRate: 0, outcomeConfidence: 'reliable' });

const applicationSessions = [
  {
    id: 'app_12345678', role: { employer: 'Synthetic Employer', title: 'Procurement Manager', requisitionId: 'SYNTH-1' },
    receipt: { authority: 'employer-side', evidenceHash: 'a'.repeat(64), receivedAt: '2026-08-01T00:00:00.000Z' },
    postSubmission: { status: 'INTERVIEW', source: 'USER_CONFIRMED' },
  },
  {
    id: 'app_87654321', role: { employer: 'Synthetic Employer', title: 'Customer Success Manager', requisitionId: 'SYNTH-2' },
    receipt: { authority: 'employer-side', evidenceHash: 'b'.repeat(64), receivedAt: '2026-08-02T00:00:00.000Z' },
    postSubmission: { status: 'REJECTED_CLOSED' },
    timeline: [{ kind: 'INTERVIEW_CONFIRMED' }, { kind: 'APPLICATION_REJECTED_OR_CLOSED_CONFIRMED' }],
  },
  { id: 'app_ignored1', role: { title: 'Procurement Manager' }, receipt: null },
];
const projected = authoritativeOutcomesFromApplicationSessions(applicationSessions);
assert.equal(projected.length, 2);
assert.equal(projected[0].stage, 'Recruiter Screen');
assert.equal(projected[0].outcomeSource, 'user-confirmed-interview');
assert.equal(projected[1].stage, 'Recruiter Screen', 'a later closed status does not erase the earlier confirmed interview outcome');
const merged = mergeAuthoritativeOutcomeEvidence([
  { title: 'Procurement Manager', stage: 'Recruiter Screen', authoritativeReceiptVerified: true, evidenceHash: 'a'.repeat(64) },
  { title: 'Procurement Manager', stage: 'Recruiter Screen', authoritativeReceiptVerified: false },
], applicationSessions);
assert.equal(merged.length, 2, 'durable receipt evidence wins and duplicate/unverified outcomes are excluded');

const supplyRanked = rankOpportunityPaths({ jobs, supplyByPath: { procurement: 24, 'customer-success': 7 }, outcomes: [], profile: { skills: ['procurement'] } });
assert.equal(supplyRanked.find(path => path.id === 'procurement').openings, 24);
assert.equal(supplyRanked.find(path => path.id === 'procurement').verifiedOpeningsAnalyzed, 2);

const unverifiedOutcomes = rankOpportunityPaths({
  jobs, profile: { skills: ['procurement'] },
  outcomes: Array.from({ length: 20 }, () => ({ title: 'Procurement Manager', stage: 'Recruiter Screen', authoritativeReceiptVerified: false })),
});
const unverifiedProcurement = unverifiedOutcomes.find(path => path.id === 'procurement');
assert.equal(unverifiedProcurement.sampleSize, 0);
assert.equal(unverifiedProcurement.interviewRate, null);
assert.equal(unverifiedProcurement.outcomeConfidence, 'learning');

const learning = rankOpportunityPaths({ jobs: [{ title: 'Customer Success Manager', fitScore: 80 }], outcomes: [] });
assert.equal(learning[0].interviewRate, null);
assert.equal(learning[0].outcomeConfidence, 'learning');

console.log('Opportunity path tests passed.');
