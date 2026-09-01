import assert from 'node:assert/strict';
import { aiTaskSensitivity, buildAiRequest, buildAiRequestPlan, extractAiText, extractAiUsage, selectAiProvider } from '../lib/ai-provider.js';

assert.deepEqual(selectAiProvider({}), { provider: 'local-fallback', configured: false });
assert.throws(() => selectAiProvider({ AI_PROVIDER: 'cloudflare' }), /incomplete/);
assert.throws(() => selectAiProvider({ AI_PROVIDER: 'unsupported' }), /Unsupported/);
assert.equal(aiTaskSensitivity('concierge'), 'routine');
assert.equal(aiTaskSensitivity('interviewQuestions'), 'routine');
assert.equal(aiTaskSensitivity('profileExtractor'), 'candidate-sensitive');
assert.equal(aiTaskSensitivity('resumeBuilder'), 'candidate-sensitive');
assert.equal(aiTaskSensitivity('application-package'), 'candidate-sensitive');

const cloudflare = buildAiRequest({
  env: { CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 'token' },
  quality: 'fast', system: 'System', messages: [{ role: 'user', content: 'Hello' }], maxTokens: 5000,
});
assert.equal(cloudflare.provider, 'cloudflare');
assert.match(cloudflare.url, /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/acct\/ai\/run\//);
assert.equal(cloudflare.body.max_tokens, 3000);

const compatible = buildAiRequest({
  env: { AI_PROVIDER: 'openai-compatible', AI_API_KEY: 'key', AI_BASE_URL: 'https://models.example/v1/', AI_FAST_MODEL: 'small-model' },
  system: 'System', messages: [{ role: 'user', content: 'Hello' }],
});
assert.equal(compatible.provider, 'openai-compatible');
assert.equal(compatible.url, 'https://models.example/v1/chat/completions');
assert.equal(compatible.body.model, 'small-model');

const anthropic = buildAiRequest({
  env: { ANTHROPIC_API_KEY: 'key' }, quality: 'quality', system: 'System', messages: [{ role: 'user', content: 'Hello' }],
});
assert.equal(anthropic.provider, 'anthropic');
assert.equal(anthropic.url, 'https://api.anthropic.com/v1/messages');

assert.throws(() => buildAiRequest({
  env: { AI_ROUTINE_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'key' }, task: 'concierge',
  system: 'System', messages: [{ role: 'user', content: 'Synthetic job question' }],
}), /versioned approval/);

const routed = buildAiRequestPlan({
  env: {
    AI_ROUTINE_PROVIDER: 'deepseek', AI_ROUTINE_MODEL: 'deepseek-v4-flash', DEEPSEEK_API_KEY: 'deepseek-key',
    AI_DEEPSEEK_ROUTING_ENABLED: 'true', AI_DEEPSEEK_ROUTING_APPROVED: 'true', AI_DEEPSEEK_ROUTING_APPROVAL_VERSION: 'synthetic-benchmark-v1',
    ANTHROPIC_API_KEY: 'anthropic-key', AI_FALLBACK_PROVIDER: 'anthropic', AI_FALLBACK_MODEL: 'claude-haiku-4-5-20251001',
  },
  task: 'concierge', system: 'System', messages: [{ role: 'user', content: 'Synthetic job question' }],
});
assert.equal(routed.requests.length, 2);
assert.deepEqual(routed.requests.map(request => [request.provider, request.route, request.sensitivity]), [
  ['deepseek', 'primary', 'routine'], ['anthropic', 'fallback', 'routine'],
]);
assert.equal(routed.requests[0].url, 'https://api.deepseek.com/chat/completions');
assert.equal(routed.requests[0].body.model, 'deepseek-v4-flash');
assert.equal(routed.requests[1].url, 'https://api.anthropic.com/v1/messages');

const sensitiveDefault = buildAiRequest({
  env: {
    AI_ROUTINE_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'deepseek-key', ANTHROPIC_API_KEY: 'anthropic-key',
    AI_DEEPSEEK_ROUTING_ENABLED: 'true', AI_DEEPSEEK_ROUTING_APPROVED: 'true', AI_DEEPSEEK_ROUTING_APPROVAL_VERSION: 'synthetic-benchmark-v1',
  },
  task: 'resumeBuilder', quality: 'quality', system: 'System', messages: [{ role: 'user', content: 'Synthetic resume facts' }],
});
assert.equal(sensitiveDefault.provider, 'anthropic');
assert.equal(sensitiveDefault.sensitivity, 'candidate-sensitive');

assert.throws(() => buildAiRequest({
  env: {
    AI_DOCUMENT_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'deepseek-key',
    AI_DEEPSEEK_ROUTING_ENABLED: 'true', AI_DEEPSEEK_ROUTING_APPROVED: 'true', AI_DEEPSEEK_ROUTING_APPROVAL_VERSION: 'synthetic-benchmark-v1',
  },
  task: 'application-package', quality: 'quality', system: 'System', messages: [{ role: 'user', content: 'Synthetic resume facts' }],
}), /restricted to routine/);

assert.equal(extractAiText('cloudflare', { result: { response: ' Cloudflare reply ' } }), 'Cloudflare reply');
assert.equal(extractAiText('openai-compatible', { choices: [{ message: { content: ' Compatible reply ' } }] }), 'Compatible reply');
assert.equal(extractAiText('deepseek', { choices: [{ message: { content: ' DeepSeek reply ' } }] }), 'DeepSeek reply');
assert.equal(extractAiText('anthropic', { content: [{ text: 'Anthropic ' }, { text: 'reply' }] }), 'Anthropic reply');
assert.deepEqual(extractAiUsage('openai-compatible', { usage: { prompt_tokens: 120, completion_tokens: 30 } }), { inputTokens: 120, outputTokens: 30 });
assert.deepEqual(extractAiUsage('deepseek', { usage: { prompt_tokens: 60, completion_tokens: 15 } }), { inputTokens: 60, outputTokens: 15 });
assert.deepEqual(extractAiUsage('anthropic', { usage: { input_tokens: 80, output_tokens: 20 } }), { inputTokens: 80, outputTokens: 20 });
assert.deepEqual(extractAiUsage('cloudflare', { result: { usage: { prompt_tokens: 40, completion_tokens: 10 } } }), { inputTokens: 40, outputTokens: 10 });
assert.deepEqual(extractAiUsage('anthropic', { usage: { input_tokens: -1, output_tokens: 'unknown' } }), { inputTokens: 0, outputTokens: 0 });

console.log('AI provider routing tests passed.');
await import('./ai-routing-evaluation-test.mjs');
await import('./ai-api-routing-test.mjs');
