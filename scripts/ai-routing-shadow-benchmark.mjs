import { createHash } from 'node:crypto';
import { buildAiRequestPlan, extractAiText, extractAiUsage } from '../lib/ai-provider.js';
import {
  AI_ROUTING_EVALUATION_SYSTEM, AI_ROUTING_QUALITY_GATES, AI_ROUTING_SYNTHETIC_CASES,
  assertSafeSyntheticDataset, estimateAiRoutingCost, evaluateAiRoutingOutput, projectAiRoutingCosts, summarizeAiRoutingBenchmark,
} from '../lib/ai-routing-evaluation.js';

if (process.env.VERCEL_ENV || process.env.VERCEL) throw new Error('AI_ROUTING_BENCHMARK_LOCAL_ONLY');
if (String(process.env.AI_ROUTING_BENCHMARK_APPROVED || '').toLowerCase() !== 'true') {
  throw new Error('Set AI_ROUTING_BENCHMARK_APPROVED=true in the process environment for this synthetic-only benchmark.');
}
if (!process.env.DEEPSEEK_API_KEY || !process.env.ANTHROPIC_API_KEY) throw new Error('DEEPSEEK_API_KEY and ANTHROPIC_API_KEY are required in the process environment.');
assertSafeSyntheticDataset();

const env = {
  ...process.env,
  AI_ROUTINE_PROVIDER: 'deepseek',
  AI_ROUTINE_MODEL: process.env.AI_ROUTINE_MODEL || 'deepseek-v4-flash',
  AI_FALLBACK_PROVIDER: 'anthropic',
  AI_FALLBACK_MODEL: process.env.AI_FALLBACK_MODEL || 'claude-haiku-4-5-20251001',
  AI_DEEPSEEK_ROUTING_ENABLED: 'true',
  AI_DEEPSEEK_ROUTING_APPROVED: 'true',
  AI_DEEPSEEK_ROUTING_APPROVAL_VERSION: 'local-synthetic-shadow-v2',
};

const report = [];
for (const fixture of AI_ROUTING_SYNTHETIC_CASES) {
  const content = `<untrusted_job_data>\n${fixture.content}\n</untrusted_job_data>`;
  const plan = buildAiRequestPlan({
    env, task: fixture.task, quality: 'fast', system: AI_ROUTING_EVALUATION_SYSTEM,
    messages: [{ role: 'user', content }], maxTokens: 450,
  });
  for (const request of plan.requests) {
    const startedAt = performance.now();
    let status = 0;
    let text = '';
    let usage = { inputTokens: 0, outputTokens: 0 };
    try {
      const response = await fetch(request.url, {
        method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: AbortSignal.timeout(30_000),
      });
      status = response.status;
      const payload = await response.json().catch(() => ({}));
      text = response.ok ? extractAiText(request.provider, payload) : '';
      usage = extractAiUsage(request.provider, payload);
    } catch (error) {
      report.push({
        fixture: fixture.id, category: fixture.category, task: fixture.task, provider: request.provider,
        model: request.model, status: 'transport-error', error: error?.name || 'unknown', passed: false,
      });
      continue;
    }
    const evaluation = evaluateAiRoutingOutput(fixture, text);
    const cost = estimateAiRoutingCost(request.model, usage);
    report.push({
      fixture: fixture.id, category: fixture.category, task: fixture.task, provider: request.provider,
      model: request.model, status, latencyMs: Math.round(performance.now() - startedAt), usage,
      estimatedCostUsd: cost.costUsd, priceBasis: cost.priceBasis, evaluation,
      passed: status === 200 && evaluation.hardFailures.length === 0
        && evaluation.instructionScore >= AI_ROUTING_QUALITY_GATES.minimumInstructionScore
        && evaluation.relevanceScore >= AI_ROUTING_QUALITY_GATES.minimumRelevanceScore
        && evaluation.completenessScore >= AI_ROUTING_QUALITY_GATES.minimumCompletenessScore,
      outputSha256: text ? createHash('sha256').update(text).digest('hex') : null,
    });
  }
}

const summary = summarizeAiRoutingBenchmark(report);
const costProjection = projectAiRoutingCosts(summary, { jobsPerUserPerDay: 20 });
const deepseek = summary.providers.deepseek;
const anthropic = summary.providers.anthropic;
const passRateDelta = deepseek && anthropic ? Math.abs(deepseek.passRate - anthropic.passRate) : 1;
const gatesPassed = Boolean(deepseek && anthropic)
  && deepseek.hardFailures === AI_ROUTING_QUALITY_GATES.hardFailureCount
  && anthropic.hardFailures === AI_ROUTING_QUALITY_GATES.hardFailureCount
  && passRateDelta <= AI_ROUTING_QUALITY_GATES.maximumPassRateDelta;

console.log(JSON.stringify({
  syntheticOnly: true,
  persisted: false,
  fixtureCount: AI_ROUTING_SYNTHETIC_CASES.length,
  qualityGatesDeclaredBeforeRun: AI_ROUTING_QUALITY_GATES,
  summary,
  costProjection,
  passRateDelta,
  gatesPassed,
  report,
}, null, 2));
if (!gatesPassed) process.exitCode = 1;
