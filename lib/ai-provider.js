const PROVIDERS = new Set(['cloudflare', 'openai-compatible', 'anthropic', 'deepseek']);
const ROUTINE_TASKS = new Set(['concierge', 'interviewQuestions', 'search', 'utility']);
const SENSITIVE_TASKS = new Set(['application-package', 'autofill', 'coverLetter', 'interviewCoach', 'linkedin', 'profileExtractor', 'resumeBuilder', 'tailor']);
const APPROVAL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;

function enabled(value) { return String(value || '').trim().toLowerCase() === 'true'; }

function providerCredentialsReady(provider, env) {
  if (provider === 'cloudflare') return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
  if (provider === 'openai-compatible') return Boolean(env.OPENAI_API_KEY || env.AI_API_KEY);
  if (provider === 'anthropic') return Boolean(env.ANTHROPIC_API_KEY);
  if (provider === 'deepseek') return Boolean(env.DEEPSEEK_API_KEY);
  return false;
}

function assertProviderCredentials(provider, env) {
  if (provider === 'cloudflare' && !providerCredentialsReady(provider, env)) throw new Error('Cloudflare AI credentials are incomplete.');
  if (provider === 'openai-compatible' && !providerCredentialsReady(provider, env)) throw new Error('OpenAI-compatible credentials are incomplete.');
  if (provider === 'anthropic' && !providerCredentialsReady(provider, env)) throw new Error('Anthropic credentials are incomplete.');
  if (provider === 'deepseek' && !providerCredentialsReady(provider, env)) throw new Error('DeepSeek credentials are incomplete.');
}

function defaultProvider(env) {
  return (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN ? 'cloudflare' : '')
    || (env.OPENAI_API_KEY || env.AI_API_KEY ? 'openai-compatible' : '')
    || (env.ANTHROPIC_API_KEY ? 'anthropic' : '')
    || (env.DEEPSEEK_API_KEY ? 'deepseek' : '');
}

export function aiTaskSensitivity(task = '') {
  const normalized = String(task || '').trim();
  if (SENSITIVE_TASKS.has(normalized)) return 'candidate-sensitive';
  if (ROUTINE_TASKS.has(normalized)) return 'routine';
  return 'unspecified';
}

function assertDeepSeekRouteApproved(env, sensitivity) {
  if (sensitivity !== 'routine') throw new Error('DeepSeek routing is restricted to routine, non-candidate-sensitive tasks.');
  if (!enabled(env.AI_DEEPSEEK_ROUTING_ENABLED) || !enabled(env.AI_DEEPSEEK_ROUTING_APPROVED)
    || !APPROVAL_VERSION.test(String(env.AI_DEEPSEEK_ROUTING_APPROVAL_VERSION || ''))) {
    throw new Error('DeepSeek routing requires an explicit versioned approval.');
  }
}

export function selectAiProvider(env = {}, { provider = '' } = {}) {
  const requested = String(provider || env.AI_PROVIDER || '').trim().toLowerCase();
  if (requested && !PROVIDERS.has(requested)) throw new Error(`Unsupported AI provider: ${requested}`);
  const selected = requested || defaultProvider(env);
  if (!selected) return { provider: 'local-fallback', configured: false };
  assertProviderCredentials(selected, env);
  return { provider: selected, configured: true };
}

function routedProvider(env, task) {
  const sensitivity = aiTaskSensitivity(task);
  const legacy = String(env.AI_PROVIDER || '').trim().toLowerCase();
  let requested = legacy;
  if (sensitivity === 'routine') requested = String(env.AI_ROUTINE_PROVIDER || legacy).trim().toLowerCase();
  if (sensitivity === 'candidate-sensitive') {
    requested = String(env.AI_DOCUMENT_PROVIDER || '').trim().toLowerCase()
      || (providerCredentialsReady('anthropic', env) ? 'anthropic' : legacy);
  }
  const selected = selectAiProvider(env, { provider: requested });
  if (selected.provider === 'deepseek') assertDeepSeekRouteApproved(env, sensitivity);
  return { ...selected, sensitivity };
}

function modelFor(env, quality, provider, { route = 'primary', sensitivity = 'unspecified' } = {}) {
  const fast = quality !== 'quality';
  if (route === 'fallback' && env.AI_FALLBACK_MODEL) return env.AI_FALLBACK_MODEL;
  if (sensitivity === 'routine' && env.AI_ROUTINE_MODEL) return env.AI_ROUTINE_MODEL;
  if (sensitivity === 'candidate-sensitive' && env.AI_DOCUMENT_MODEL) return env.AI_DOCUMENT_MODEL;
  if (fast && env.AI_FAST_MODEL) return env.AI_FAST_MODEL;
  if (!fast && env.AI_QUALITY_MODEL) return env.AI_QUALITY_MODEL;
  if (provider === 'cloudflare') return '@cf/meta/llama-3.1-8b-instruct';
  if (provider === 'openai-compatible') return fast ? 'gpt-4.1-mini' : 'gpt-4.1';
  if (provider === 'deepseek') return fast ? 'deepseek-v4-flash' : 'deepseek-v4-pro';
  return fast ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';
}

function providerRequest({ env, provider, quality, sensitivity, route, system, messages, maxTokens }) {
  const selected = selectAiProvider(env, { provider });
  const model = modelFor(env, quality, selected.provider, { route, sensitivity });
  const clampedTokens = Math.min(3000, Math.max(64, Number(maxTokens) || 512));
  if (selected.provider === 'cloudflare') return {
    ...selected, model, route, sensitivity,
    url: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: { messages: [{ role: 'system', content: system }, ...messages], max_tokens: clampedTokens },
  };
  if (selected.provider === 'openai-compatible' || selected.provider === 'deepseek') {
    const apiKey = selected.provider === 'deepseek' ? env.DEEPSEEK_API_KEY : (env.OPENAI_API_KEY || env.AI_API_KEY);
    const baseUrl = selected.provider === 'deepseek' ? 'https://api.deepseek.com' : String(env.AI_BASE_URL || 'https://api.openai.com/v1');
    return {
      ...selected, model, route, sensitivity,
      url: `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: { model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: clampedTokens },
    };
  }
  return {
    ...selected, model, route, sensitivity, url: 'https://api.anthropic.com/v1/messages',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: { model, system, messages, max_tokens: clampedTokens },
  };
}

export function buildAiRequest({ env = {}, quality = 'fast', task = '', system, messages, maxTokens = 512 }) {
  const selected = routedProvider(env, task);
  if (!selected.configured) return selected;
  return providerRequest({ env, provider: selected.provider, quality, sensitivity: selected.sensitivity, route: 'primary', system, messages, maxTokens });
}

export function buildAiRequestPlan({ env = {}, quality = 'fast', task = '', system, messages, maxTokens = 512 }) {
  const primary = buildAiRequest({ env, quality, task, system, messages, maxTokens });
  if (!primary.configured) return { configured: false, requests: [primary] };
  const requestedFallback = String(env.AI_FALLBACK_PROVIDER || '').trim().toLowerCase()
    || (primary.provider !== 'anthropic' && providerCredentialsReady('anthropic', env) ? 'anthropic' : '');
  if (!requestedFallback || requestedFallback === primary.provider) return { configured: true, requests: [primary] };
  if (!PROVIDERS.has(requestedFallback)) throw new Error(`Unsupported AI provider: ${requestedFallback}`);
  if (requestedFallback === 'deepseek') throw new Error('DeepSeek cannot be used as the fallback provider.');
  if (!providerCredentialsReady(requestedFallback, env)) throw new Error(`${requestedFallback} fallback credentials are incomplete.`);
  const fallback = providerRequest({
    env, provider: requestedFallback, quality, sensitivity: primary.sensitivity, route: 'fallback', system, messages, maxTokens,
  });
  return { configured: true, requests: [primary, fallback] };
}

export function extractAiText(provider, payload = {}) {
  if (provider === 'cloudflare') return String(payload.result?.response || '').trim();
  if (provider === 'openai-compatible' || provider === 'deepseek') return String(payload.choices?.[0]?.message?.content || '').trim();
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
