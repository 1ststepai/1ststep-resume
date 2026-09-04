import assert from 'node:assert/strict';
import {
  jobAgentThroughputConfiguration, jobAgentThroughputDecision, publicJobAgentThroughput,
} from '../lib/job-agent-throughput-policy.js';

const env = {
  JOB_AGENT_CONTROLLED_BETA_DAILY_APPLICATION_LIMIT: '8',
  JOB_AGENT_CONTROLLED_BETA_MONTHLY_APPLICATION_LIMIT: '80',
  JOB_AGENT_CONTROLLED_BETA_MONTHLY_PROVIDER_BUDGET_CENTS: '400',
  JOB_AGENT_SUBSCRIBER_DAILY_APPLICATION_LIMIT: '20',
  JOB_AGENT_SUBSCRIBER_MONTHLY_APPLICATION_LIMIT: '300',
  JOB_AGENT_SUBSCRIBER_MONTHLY_PROVIDER_BUDGET_CENTS: '1200',
  JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS: '20',
};

assert.deepEqual(jobAgentThroughputConfiguration({ entitlements: ['job-agent-controlled-beta'] }, env), {
  schemaVersion: 1, planId: 'controlled-beta', dailyApplicationLimit: 8, monthlyApplicationLimit: 20,
  monthlyProviderBudgetCents: 400, maximumPackageRequestCents: 20, costBounded: true,
});
assert.equal(jobAgentThroughputConfiguration({ entitlements: ['job-agent'] }, env).monthlyApplicationLimit, 60);

const goalBound = jobAgentThroughputDecision({ auth: { entitlements: ['job-agent'] }, env, requestedDailyGoal: 12 });
assert.equal(goalBound.effectiveDailyApplicationTarget, 12);
assert.equal(goalBound.submissionTarget, 0);
assert.ok(goalBound.constrainedBy.includes('user-approval'));

const supplyBound = jobAgentThroughputDecision({ auth: { entitlements: ['job-agent'] }, env, requestedDailyGoal: 12, eligibleMatches: 4, approvedApplications: 4 });
assert.equal(supplyBound.effectiveDailyApplicationTarget, 4);
assert.equal(supplyBound.submissionTarget, 4);
assert.ok(supplyBound.constrainedBy.includes('eligible-supply'));

const safeBound = jobAgentThroughputDecision({
  auth: { entitlements: ['job-agent'] }, env, requestedDailyGoal: 50, eligibleMatches: 40,
  remainingPlanApplications: 9, remainingBudgetCents: 100, estimatedApplicationCents: 20,
  systemCapacity: 7, approvedApplications: 3,
});
assert.equal(safeBound.effectiveDailyApplicationTarget, 5);
assert.equal(safeBound.submissionTarget, 3);
assert.deepEqual(safeBound.constrainedBy, ['eligible-supply', 'plan-allowance', 'provider-budget', 'system-capacity', 'user-approval']);

const publicPolicy = publicJobAgentThroughput(safeBound);
assert.equal(publicPolicy.monthlyApplicationLimit, 60);
assert.equal(Object.hasOwn(publicPolicy, 'monthlyProviderBudgetCents'), false);
assert.equal(publicPolicy.finalSubmissionRequiresApproval, true);
assert.equal(publicPolicy.authoritativeReceiptRequiredForSubmitted, true);

console.log('Goal-, supply-, plan-, cost-, capacity-, approval-, and receipt-bounded Job Agent throughput tests passed.');
