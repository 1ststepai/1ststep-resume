import assert from 'node:assert/strict';
import { buildAdminCostDashboard } from '../client/admin-cost-dashboard.js';

const operations = {
  monetarySpend: {
    contentFree: true, containsCandidateValues: false, currency: 'USD',
    days: [{
      date: '2026-09-07', global: { settledCents: 85, reservedCents: 25, releasedCents: 10 },
      categories: {
        ai: { settledCents: 60, reservedCents: 5, releasedCents: 10 },
        'application-package': { settledCents: 25, reservedCents: 20, releasedCents: 0 },
      },
    }],
  },
  costControls: { monetaryReservationControl: {
    enabled: true, approved: true, globalDailyCapCents: 500,
    categories: {
      ai: { dailyCapCents: 250, maximumRequestCents: 5 },
      'application-package': { dailyCapCents: 200, maximumRequestCents: 25 },
      'employer-browser': { dailyCapCents: null, maximumRequestCents: null },
    },
  } },
};

const dashboard = buildAdminCostDashboard(operations);
assert.equal(dashboard.available, true);
assert.equal(dashboard.settledCents, 85);
assert.equal(dashboard.reservedCents, 25);
assert.equal(dashboard.remainingCents, 390);
assert.equal(dashboard.guardedCategories, 2);
assert.equal(dashboard.activeUsers, null, 'Unavailable user telemetry must remain unknown.');
assert.equal(dashboard.categories.find(item => item.key === 'ai').guarded, true);
assert.equal(dashboard.categories.find(item => item.key === 'employer-browser').guarded, false);
assert.match(dashboard.evidenceStatus, /invoices are not connected/i);
assert.equal(buildAdminCostDashboard({}).available, false);
assert.equal(buildAdminCostDashboard({ monetarySpend: { contentFree: false }, costControls: { monetaryReservationControl: {} } }).available, false);

console.log('Admin live-cost dashboard truthfulness and budget-boundary tests passed.');
