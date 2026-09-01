import assert from 'node:assert/strict';
import { buildAiRequest, extractAiText, extractAiUsage, selectAiProvider } from '../lib/ai-provider.js';

assert.deepEqual(selectAiProvider({}), { provider: 'local-fallback', configured: false });
assert.throws(() => selectAiProvider({ AI_PROVIDER: 'cloudflare' }), /incomplete/);
assert.throws(() => selectAiProvider({ AI_PROVIDER: 'unsupported' }), /Unsupported/);

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

assert.equal(extractAiText('cloudflare', { result: { response: ' Cloudflare reply ' } }), 'Cloudflare reply');
assert.equal(extractAiText('openai-compatible', { choices: [{ message: { content: ' Compatible reply ' } }] }), 'Compatible reply');
assert.equal(extractAiText('anthropic', { content: [{ text: 'Anthropic ' }, { text: 'reply' }] }), 'Anthropic reply');
assert.deepEqual(extractAiUsage('openai-compatible', { usage: { prompt_tokens: 120, completion_tokens: 30 } }), { inputTokens: 120, outputTokens: 30 });
assert.deepEqual(extractAiUsage('anthropic', { usage: { input_tokens: 80, output_tokens: 20 } }), { inputTokens: 80, outputTokens: 20 });
assert.deepEqual(extractAiUsage('cloudflare', { result: { usage: { prompt_tokens: 40, completion_tokens: 10 } } }), { inputTokens: 40, outputTokens: 10 });
assert.deepEqual(extractAiUsage('anthropic', { usage: { input_tokens: -1, output_tokens: 'unknown' } }), { inputTokens: 0, outputTokens: 0 });

console.log('AI provider routing tests passed.');
