import assert from 'node:assert/strict';
import {
  acquisitionFunnel, classifyFitScore, descriptionSimilarity, evaluateCandidateFit,
  extractStructuredRequirements, publicJobsAreDuplicate, upsertHiringEcosystem,
} from '../lib/job-intelligence.js';

const job = {
  employer: 'Fixture Manufacturing', title: 'Strategic Sourcing Manager', requisitionId: 'FM-42',
  description: 'Lead strategic sourcing and supplier negotiations. Required: procurement and cross-functional stakeholder management. Preferred: Coupa or SAP. 7+ years of experience. Bachelor degree preferred.',
  location: 'Remote - United States', workplaceType: 'Remote', remote: true,
  employmentType: 'Full-time', salaryMin: 115000, salaryMax: 140000, salaryDisclosure: '$115,000-$140,000',
  provider: 'greenhouse', sourceEvidence: 'Published Greenhouse employer board feed', applyUrl: 'https://boards.greenhouse.io/fixture/jobs/42',
};
const requirements = extractStructuredRequirements(job);
assert.equal(requirements.yearsExperience, 7);
assert.ok(requirements.required.some(item => /procurement/i.test(item)));
assert.ok(requirements.technology.includes('Coupa'));

const fit = evaluateCandidateFit({ ...job, requirements }, {
  skills: ['Strategic sourcing', 'Procurement', 'Supplier negotiations', 'CRM', 'Cross-functional stakeholder management', 'SAP'],
  workHistory: ['Led procurement operations and vendor programs'], education: ['Bachelor degree'],
  authorization: 'Authorized to work in the United States', geography: ['Remote United States'],
}, { role: 'procurement manager', workModes: ['Remote'], salaryMin: 100000 });
assert.ok(fit.score >= 70, JSON.stringify(fit));
const screeningRequirements = { ...requirements, workAuthorization: ['Must be authorized to work without sponsorship.'] };
const fitWithAuthorization = evaluateCandidateFit({ ...job, requirements: screeningRequirements }, {
  skills: ['Strategic sourcing', 'Procurement', 'Supplier negotiations', 'CRM', 'Cross-functional stakeholder management', 'SAP'],
  workHistory: ['Led procurement operations and vendor programs'], education: ['Bachelor degree'], authorization: 'Candidate-confirmed answer',
  geography: ['Remote United States'],
}, { role: 'procurement manager', workModes: ['Remote'], salaryMin: 100000 });
const fitWithoutAuthorization = evaluateCandidateFit({ ...job, requirements: screeningRequirements }, {
  skills: ['Strategic sourcing', 'Procurement', 'Supplier negotiations', 'CRM', 'Cross-functional stakeholder management', 'SAP'],
  workHistory: ['Led procurement operations and vendor programs'], education: ['Bachelor degree'],
  geography: ['Remote United States'],
}, { role: 'procurement manager', workModes: ['Remote'], salaryMin: 100000 });
assert.equal(fitWithoutAuthorization.score, fitWithAuthorization.score);
assert.ok(!fitWithAuthorization.matchedEvidence.includes('work authorization'));
assert.ok(fitWithAuthorization.notRankedSignals.length > 0);
assert.equal(fit.credibleInterviewPath, true);
assert.equal(classifyFitScore(89), 'Strong Match');
assert.equal(classifyFitScore(59), 'Reject');

const rankSafetyProfile = {
  skills: ['Strategic sourcing', 'Procurement', 'Supplier negotiations', 'Cross-functional stakeholder management', 'SAP'],
  workHistory: ['Led procurement operations and vendor programs'], education: ['Bachelor degree'],
  prioritizedRoleFamilies: ['Procurement manager'], geography: ['Remote United States'],
};
const rankSafetyMission = { role: 'procurement manager', workModes: ['Remote'], salaryMin: 100000 };
const rankSafetyBaseline = evaluateCandidateFit(job, rankSafetyProfile, rankSafetyMission);
const excludedScreeningCases = [
  ['citizenship and clearance', 'Required: U.S. citizenship, ITAR export-control classification, and security clearance.', 'U.S. citizen with active clearance.'],
  ['protected demographics', 'Applicants must disclose age, race, gender, disability, and veteran status.', 'Disabled veteran, age 45.'],
  ['criminal history', 'Must pass a criminal background check and disclose conviction history.', 'No criminal convictions.'],
  ['health screening', 'Must complete drug testing and a medical examination.', 'Completed a health screening.'],
  ['referrals', 'Employee referral preferred; provide the referrer name.', 'Referred by an employee.'],
  ['restrictive agreements', 'Must disclose outside employment, conflicts of interest, and non-compete restrictions.', 'No outside employment or restrictive agreements.'],
];
for (const [label, postingText, candidateText] of excludedScreeningCases) {
  const augmentedJob = { ...job, description: `${job.description} ${postingText}` };
  const augmentedProfile = {
    ...rankSafetyProfile,
    skills: [...rankSafetyProfile.skills, candidateText],
    workHistory: [...rankSafetyProfile.workHistory, candidateText],
    education: [...rankSafetyProfile.education, candidateText],
  };
  const augmented = evaluateCandidateFit(augmentedJob, augmentedProfile, rankSafetyMission);
  assert.equal(augmented.score, rankSafetyBaseline.score, `${label} changed the fit score`);
  assert.deepEqual(augmented.components, rankSafetyBaseline.components, `${label} changed fit components`);
  assert.deepEqual(augmented.matchedEvidence, rankSafetyBaseline.matchedEvidence, `${label} changed matched evidence`);
  assert.ok(augmented.notRankedSignals.length > 0, `${label} was not disclosed as excluded`);
}
const ageSafeRequirements = extractStructuredRequirements({ ...job, description: `${job.description} Applicants must be 18 years or older.` });
assert.equal(ageSafeRequirements.yearsExperience, 7);
assert.ok(ageSafeRequirements.nonRankableScreening.includes('Protected-trait and optional-demographic information'));
assert.doesNotMatch(ageSafeRequirements.required.join(' '), /citizen|clearance|export|criminal|disability|veteran|referral|non.?compete/i);

const blocked = evaluateCandidateFit({ ...job, salaryMax: 90000, requirements }, {}, { role: 'procurement', workModes: ['Remote'], salaryMin: 100000 });
assert.ok(blocked.score < 60);
assert.equal(blocked.credibleInterviewPath, false);
assert.match(blocked.hardDisqualifiers.join(' '), /compensation/i);

assert.ok(descriptionSimilarity(job.description, `${job.description} Additional detail.`) > .85);
assert.equal(publicJobsAreDuplicate(job, { ...job, requisitionId: '', description: `${job.description} Additional detail.` }), true);

let ecosystem = upsertHiringEcosystem([], { ...job, requirements }, '2026-08-29T00:00:00Z');
ecosystem = upsertHiringEcosystem(ecosystem, { ...job, requisitionId: 'FM-43', requirements }, '2026-08-29T01:00:00Z');
assert.equal(ecosystem.length, 1);
assert.deepEqual(ecosystem[0].matchingOpenRequisitions.sort(), ['FM-42', 'FM-43']);

const funnel = acquisitionFunnel([
  { stage: 'Applied', authoritativeReceiptVerified: true },
  { stage: 'Recruiter Screen', authoritativeReceiptVerified: true },
  { stage: 'Hiring Manager Interview', receipt: { authority: 'employer-side' } },
  { stage: 'Offer', authoritativeReceiptVerified: true },
  { stage: 'Offer', authoritativeReceiptVerified: false },
]);
assert.equal(funnel.counts.Applied, 4);
assert.equal(funnel.counts['Recruiter Screen'], 3);
assert.equal(funnel.interviewYield, 75);
assert.equal(funnel.offerYield, 25);
assert.equal(funnel.verifiedSampleSize, 4);
assert.deepEqual(acquisitionFunnel([{ stage: 'Offer' }]), {
  counts: { Applied: 0, Response: 0, 'Recruiter Screen': 0, 'Hiring Manager Interview': 0, 'Final Round': 0, Offer: 0 },
  verifiedSampleSize: 0, interviewYield: null, offerYield: null,
});

console.log('Job intelligence tests passed.');
