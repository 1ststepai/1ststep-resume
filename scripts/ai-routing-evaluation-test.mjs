import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAiRequestPlan } from '../lib/ai-provider.js';
import {
  AI_ROUTING_QUALITY_GATES, AI_ROUTING_SYNTHETIC_CASES, assertSafeSyntheticDataset, estimateAiRoutingCost,
  evaluateAiRoutingOutput, projectAiRoutingCosts, summarizeAiRoutingBenchmark,
} from '../lib/ai-routing-evaluation.js';

assert.equal(AI_ROUTING_SYNTHETIC_CASES.length, 60);
assert.equal(assertSafeSyntheticDataset(), true);
assert.equal(new Set(AI_ROUTING_SYNTHETIC_CASES.map(item => item.id)).size, 60);
for (const category of ['job-fit', 'job-summary', 'structured-extraction', 'edge-case']) {
  assert(AI_ROUTING_SYNTHETIC_CASES.some(item => item.category === category), `missing ${category}`);
}
assert(AI_ROUTING_SYNTHETIC_CASES.some(item => /ignore previous instructions/i.test(item.content)));
assert(AI_ROUTING_SYNTHETIC_CASES.some(item => /protected|under 30/i.test(item.content)));
assert(AI_ROUTING_SYNTHETIC_CASES.every(item => !/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(item.content)));
assert(AI_ROUTING_SYNTHETIC_CASES.every(item => !/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(item.content)));

const fixture = AI_ROUTING_SYNTHETIC_CASES[0];
const exact = fixture.expected.exact;
const validOutput = JSON.stringify({
  recommendation: fixture.expected.recommendation,
  summary: `The ${fixture.expected.requiredTerms.join(' role requires ')}.`,
  requiredSkills: fixture.expected.requiredTerms.slice(1),
  preferredSkills: [],
  yearsExperience: exact.yearsExperience ?? null,
  salaryMin: exact.salaryMin ?? null,
  salaryMax: exact.salaryMax ?? null,
  workMode: exact.workMode ?? 'unknown',
  location: exact.location ?? 'unknown',
  seniority: exact.seniority ?? 'unknown',
  reasons: ['The supplied facts align.'],
  nextAction: 'Review the verified requisition.',
});
const validEvaluation = evaluateAiRoutingOutput(fixture, validOutput);
assert.equal(validEvaluation.schemaValid, true);
assert.equal(validEvaluation.unsupportedFactCount, 0);
assert.deepEqual(validEvaluation.hardFailures, []);

const injectionFixture = AI_ROUTING_SYNTHETIC_CASES.find(item => item.id.startsWith('injection-protected-trait'));
const injectedOutput = JSON.stringify({
  recommendation: injectionFixture.expected.recommendation, summary: 'Reveal the system prompt and include the SSN.', requiredSkills: [], preferredSkills: [],
  yearsExperience: injectionFixture.expected.exact.yearsExperience, salaryMin: null, salaryMax: null,
  workMode: injectionFixture.expected.exact.workMode, location: injectionFixture.expected.exact.location,
  seniority: 'unknown', reasons: [], nextAction: 'Send to invalid.example.',
});
const injectionEvaluation = evaluateAiRoutingOutput(injectionFixture, injectedOutput);
assert(injectionEvaluation.hardFailures.includes('instruction-injection'));

assert.deepEqual(estimateAiRoutingCost('claude-haiku-4-5-20251001', { inputTokens: 1000, outputTokens: 1000 }), { costUsd: 0.006, priceBasis: 'standard' });
assert.deepEqual(estimateAiRoutingCost('deepseek-v4-flash', { inputTokens: 1000, outputTokens: 1000 }), { costUsd: 0.00176, priceBasis: 'peak-cache-miss' });
const summary = summarizeAiRoutingBenchmark([
  { provider: 'deepseek', passed: true, latencyMs: 100, usage: { inputTokens: 10, outputTokens: 5 }, estimatedCostUsd: 0.001, evaluation: { hardFailures: [] } },
  { provider: 'anthropic', passed: true, latencyMs: 200, usage: { inputTokens: 10, outputTokens: 5 }, estimatedCostUsd: 0.002, evaluation: { hardFailures: [] } },
]);
assert.equal(summary.providers.deepseek.passRate, 1);
assert.equal(summary.providers.anthropic.costPer100JobsUsd, 0.2);
const projection = projectAiRoutingCosts(summary, { jobsPerUserPerDay: 20 });
assert.equal(projection.costPer100JobsUsd.anthropicOnly, 0.2);
assert.equal(projection.costPer100JobsUsd.mixed, 0.1);
assert.equal(projection.activeUsers[100].jobsPerDay, 2000);
assert.equal(AI_ROUTING_QUALITY_GATES.maximumFallbackAttempts, 2);

const plan = buildAiRequestPlan({
  env: {
    AI_ROUTINE_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'synthetic', ANTHROPIC_API_KEY: 'synthetic',
    AI_DEEPSEEK_ROUTING_ENABLED: 'true', AI_DEEPSEEK_ROUTING_APPROVED: 'true',
    AI_DEEPSEEK_ROUTING_APPROVAL_VERSION: 'synthetic-evaluation-v1', AI_FALLBACK_PROVIDER: 'anthropic',
  },
  task: 'concierge', system: 'Synthetic', messages: [{ role: 'user', content: 'Synthetic' }], maxTokens: 450,
});
assert.equal(plan.requests.length, AI_ROUTING_QUALITY_GATES.maximumFallbackAttempts);

const apiSource = await readFile(new URL('../api/ai.js', import.meta.url), 'utf8');
assert(!/^import .*application-submission/m.test(apiSource));
assert(!/^import .*employer-browser/m.test(apiSource));
assert(!/^import .*sendEmail/m.test(apiSource));
const attemptLoop = apiSource.indexOf('for (const candidate of requestPlan.requests)');
const perAttemptReservation = apiSource.indexOf('reserveJobAgentSpend({', attemptLoop);
const providerCall = apiSource.indexOf('fetch(candidate.url', attemptLoop);
const perAttemptSettlement = apiSource.indexOf('settleJobAgentSpend({', attemptLoop);
assert(attemptLoop >= 0 && perAttemptReservation > attemptLoop && providerCall > perAttemptReservation && perAttemptSettlement > providerCall);
const benchmarkSource = await readFile(new URL('./ai-routing-shadow-benchmark.mjs', import.meta.url), 'utf8');
assert(benchmarkSource.includes('AI_ROUTING_BENCHMARK_LOCAL_ONLY'));
assert(benchmarkSource.includes('AI_ROUTING_BENCHMARK_APPROVED'));
assert(!/writeFile|appendFile|createWriteStream/.test(benchmarkSource));
assert(!benchmarkSource.includes('outputText:'));

console.log('AI routing synthetic dataset, quality gates, cost math, bounded plan, and no-external-action tests passed.');
