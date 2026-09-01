const PROVIDERS = new Set(['cloudflare', 'openai-compatible', 'anthropic']);

export function selectAiProvider(env = {}) {
  const requested = String(env.AI_PROVIDER || '').trim().toLowerCase();
  if (requested && !PROVIDERS.has(requested)) throw new Error(`Unsupported AI provider: ${requested}`);
  const provider = requested
    || (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN ? 'cloudflare' : '')
    || (env.OPENAI_API_KEY || env.AI_API_KEY ? 'openai-compatible' : '')
    || (env.ANTHROPIC_API_KEY ? 'anthropic' : '');
  if (!provider) return { provider: 'local-fallback', configured: false };
  if (provider === 'cloudflare' && (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN)) throw new Error('Cloudflare AI credentials are incomplete.');
  if (provider === 'openai-compatible' && !(env.OPENAI_API_KEY || env.AI_API_KEY)) throw new Error('OpenAI-compatible credentials are incomplete.');
  if (provider === 'anthropic' && !env.ANTHROPIC_API_KEY) throw new Error('Anthropic credentials are incomplete.');
  return { provider, configured: true };
}

function modelFor(env, quality, provider) {
  const fast = quality !== 'quality';
  if (fast && env.AI_FAST_MODEL) return env.AI_FAST_MODEL;
  if (!fast && env.AI_QUALITY_MODEL) return env.AI_QUALITY_MODEL;
  if (provider === 'cloudflare') return '@cf/meta/llama-3.1-8b-instruct';
  if (provider === 'openai-compatible') return fast ? 'gpt-4.1-mini' : 'gpt-4.1';
  return fast ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';
}

export function buildAiRequest({ env = {}, quality = 'fast', system, messages, maxTokens = 512 }) {
  const selected = selectAiProvider(env);
  if (!selected.configured) return selected;
  const model = modelFor(env, quality, selected.provider);
  const clampedTokens = Math.min(3000, Math.max(64, Number(maxTokens) || 512));
  if (selected.provider === 'cloudflare') return {
    ...selected, model,
    url: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: { messages: [{ role: 'system', content: system }, ...messages], max_tokens: clampedTokens },
  };
  if (selected.provider === 'openai-compatible') return {
    ...selected, model,
    url: `${String(env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`,
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY || env.AI_API_KEY}`, 'Content-Type': 'application/json' },
    body: { model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: clampedTokens },
  };
  return {
    ...selected, model, url: 'https://api.anthropic.com/v1/messages',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: { model, system, messages, max_tokens: clampedTokens },
  };
}

export function extractAiText(provider, payload = {}) {
  if (provider === 'cloudflare') return String(payload.result?.response || '').trim();
  if (provider === 'openai-compatible') return String(payload.choices?.[0]?.message?.content || '').trim();
  if (provider === 'anthropic') return (payload.content || []).map(block => block.text || '').join('').trim();
  return '';
}

export function extractAiUsage(provider, payload = {}) {
  const usage = provider === 'cloudflare' ? (payload.result?.usage || payload.usage || {}) : (payload.usage || {});
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
  return {
    inputTokens: Number.isSafeInteger(inputTokens) && inputTokens > 0 ? inputTokens : 0,
    outputTokens: Number.isSafeInteger(outputTokens) && outputTokens > 0 ? outputTokens : 0,
  };
}
