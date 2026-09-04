const PLAN_DEFAULTS = Object.freeze({
  'controlled-beta': Object.freeze({ daily: 10, monthly: 100, monthlyProviderBudgetCents: 1000 }),
  subscriber: Object.freeze({ daily: 20, monthly: 300, monthlyProviderBudgetCents: 1200 }),
});

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Math.floor(Number(value));
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function planIdForAuth(auth = {}) {
  const entitlements = new Set(Array.isArray(auth.entitlements) ? auth.entitlements.map(value => String(value)) : []);
  return entitlements.has('job-agent') ? 'subscriber' : 'controlled-beta';
}

export function jobAgentThroughputConfiguration(auth = {}, env = process.env) {
  const planId = planIdForAuth(auth);
  const defaults = PLAN_DEFAULTS[planId];
  const prefix = planId === 'subscriber' ? 'JOB_AGENT_SUBSCRIBER' : 'JOB_AGENT_CONTROLLED_BETA';
  const configuredDailyLimit = boundedInteger(env[`${prefix}_DAILY_APPLICATION_LIMIT`], defaults.daily, 1, 50);
  const configuredMonthlyLimit = boundedInteger(env[`${prefix}_MONTHLY_APPLICATION_LIMIT`], defaults.monthly, 1, 1000);
  const monthlyProviderBudgetCents = boundedInteger(env[`${prefix}_MONTHLY_PROVIDER_BUDGET_CENTS`], defaults.monthlyProviderBudgetCents, 100, 3900);
  const maximumPackageRequestCents = boundedInteger(env.JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS, 100, 1, 3900);
  const costBoundedMonthlyLimit = Math.max(1, Math.floor(monthlyProviderBudgetCents / maximumPackageRequestCents));
  const monthlyApplicationLimit = Math.min(configuredMonthlyLimit, costBoundedMonthlyLimit);
  const dailyApplicationLimit = Math.min(configuredDailyLimit, monthlyApplicationLimit);
  return Object.freeze({
    schemaVersion: 1,
    planId,
    dailyApplicationLimit,
    monthlyApplicationLimit,
    monthlyProviderBudgetCents,
    maximumPackageRequestCents,
    costBounded: monthlyApplicationLimit < configuredMonthlyLimit,
  });
}

function available(value, fallback) {
  if (value === Infinity) return fallback;
  const parsed = Math.floor(Number(value));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function jobAgentThroughputDecision({
  auth = {}, env = process.env, requestedDailyGoal = 10, eligibleMatches = Infinity,
  remainingPlanApplications, remainingBudgetCents, estimatedApplicationCents,
  systemCapacity = Infinity, approvedApplications = 0,
} = {}) {
  const plan = jobAgentThroughputConfiguration(auth, env);
  const requested = boundedInteger(requestedDailyGoal, 10, 1, 50);
  const eligible = available(eligibleMatches, requested);
  const planRemaining = Math.min(plan.dailyApplicationLimit, available(remainingPlanApplications, plan.dailyApplicationLimit));
  const systemRemaining = available(systemCapacity, requested);
  const estimatedCents = boundedInteger(estimatedApplicationCents, plan.maximumPackageRequestCents, 1, 3900);
  const budgetRemaining = available(remainingBudgetCents, plan.monthlyProviderBudgetCents);
  const budgetCapacity = Math.floor(budgetRemaining / estimatedCents);
  const preparationTarget = Math.max(0, Math.min(requested, eligible, planRemaining, budgetCapacity, systemRemaining));
  const submissionTarget = Math.max(0, Math.min(preparationTarget, available(approvedApplications, 0)));
  const constrainedBy = [];
  if (eligible < requested) constrainedBy.push('eligible-supply');
  if (planRemaining < requested) constrainedBy.push('plan-allowance');
  if (budgetCapacity < requested) constrainedBy.push('provider-budget');
  if (systemRemaining < requested) constrainedBy.push('system-capacity');
  if (submissionTarget < preparationTarget) constrainedBy.push('user-approval');
  return Object.freeze({
    schemaVersion: 1,
    requestedDailyGoal: requested,
    effectiveDailyApplicationTarget: preparationTarget,
    submissionTarget,
    constrainedBy: Object.freeze([...new Set(constrainedBy)]),
    plan,
    finalSubmissionRequiresApproval: true,
    authoritativeReceiptRequiredForSubmitted: true,
  });
}

export function publicJobAgentThroughput(decision = {}) {
  return {
    schemaVersion: 1,
    plan: decision.plan?.planId || 'controlled-beta',
    requestedDailyGoal: Number(decision.requestedDailyGoal) || 0,
    effectiveDailyApplicationTarget: Number(decision.effectiveDailyApplicationTarget) || 0,
    dailyApplicationLimit: Number(decision.plan?.dailyApplicationLimit) || 0,
    monthlyApplicationLimit: Number(decision.plan?.monthlyApplicationLimit) || 0,
    constrainedBy: Array.isArray(decision.constrainedBy) ? decision.constrainedBy : [],
    finalSubmissionRequiresApproval: true,
    authoritativeReceiptRequiredForSubmitted: true,
  };
}
