const CATEGORY_LABELS = Object.freeze({
  ai: 'AI guidance',
  'application-package': 'Application preparation',
  'document-render': 'Document rendering',
  'object-storage': 'Object storage',
  email: 'Job Agent email',
  'employer-browser': 'Employer browser',
});

function cents(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
}

function configuredCap(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function buildAdminCostDashboard(operations = {}) {
  const spend = operations?.monetarySpend;
  const budget = operations?.costControls?.monetaryReservationControl;
  if (!spend || spend.contentFree !== true || !budget) {
    return { available: false, reason: 'Live cost evidence is unavailable.' };
  }

  const today = Array.isArray(spend.days) ? spend.days[0] : null;
  const global = today?.global || {};
  const settledCents = cents(global.settledCents);
  const reservedCents = cents(global.reservedCents);
  const releasedCents = cents(global.releasedCents);
  const dailyCapCents = configuredCap(budget.globalDailyCapCents);
  const remainingCents = dailyCapCents == null ? null : Math.max(0, dailyCapCents - settledCents - reservedCents);
  const budgetGuardEnabled = budget.enabled === true && budget.approved === true && dailyCapCents != null;
  const categories = Object.entries(CATEGORY_LABELS).map(([key, label]) => {
    const limits = budget.categories?.[key] || {};
    const usage = today?.categories?.[key] || {};
    const dailyCategoryCapCents = configuredCap(limits.dailyCapCents);
    const maximumRequestCents = configuredCap(limits.maximumRequestCents);
    return {
      key,
      label,
      settledCents: cents(usage.settledCents),
      reservedCents: cents(usage.reservedCents),
      releasedCents: cents(usage.releasedCents),
      dailyCapCents: dailyCategoryCapCents,
      maximumRequestCents,
      budgetConfigured: dailyCategoryCapCents != null && maximumRequestCents != null,
      guarded: budgetGuardEnabled && dailyCategoryCapCents != null && maximumRequestCents != null,
    };
  });

  return {
    available: true,
    currency: 'USD',
    ledgerDate: today?.date || null,
    settledCents,
    reservedCents,
    releasedCents,
    dailyCapCents,
    remainingCents,
    guardedCategories: categories.filter(category => category.guarded).length,
    budgetGuardEnabled,
    activeUsers: null,
    averageCostPerUserCents: null,
    categories,
    evidenceStatus: 'Provider invoices are not connected. Settled ledger amounts may include a conservative maximum when exact provider cost is unknown.',
    containsCandidateValues: spend.containsCandidateValues === true,
  };
}
