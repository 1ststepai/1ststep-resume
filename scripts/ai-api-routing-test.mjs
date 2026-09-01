import assert from 'node:assert/strict';
import aiHandler from '../api/ai.js';
import { __resetLocalRateLimitsForTests } from '../lib/durable-rate-limit.js';

const managedKeys = [
  'VERCEL_ENV', 'NODE_ENV', 'AI_ROUTINE_PROVIDER', 'AI_ROUTINE_MODEL',
  'AI_FALLBACK_PROVIDER', 'AI_FALLBACK_MODEL', 'AI_DEEPSEEK_ROUTING_ENABLED',
  'AI_DEEPSEEK_ROUTING_APPROVED', 'AI_DEEPSEEK_ROUTING_APPROVAL_VERSION',
  'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'JOB_AGENT_MONETARY_BUDGET_ENABLED',
];
const previousEnv = Object.fromEntries(managedKeys.map((key) => [key, process.env[key]]));
const previousFetch = globalThis.fetch;
const previousConsoleError = console.error;
const previousConsoleLog = console.log;

function mockResponse() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const failures = Object.freeze([
  { id: 'timeout', response: () => { throw new DOMException('Synthetic timeout', 'TimeoutError'); } },
  { id: 'http-429', response: async () => ({ ok: false, status: 429, json: async () => ({}) }) },
  { id: 'http-500', response: async () => ({ ok: false, status: 500, json: async () => ({}) }) },
  { id: 'malformed-json', response: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Synthetic malformed JSON'); } }) },
  { id: 'empty-response', response: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }] }) }) },
  { id: 'provider-unavailable', response: () => { throw new TypeError('Synthetic provider unavailable'); } },
]);

try {
  process.env.VERCEL_ENV = 'development';
  process.env.NODE_ENV = 'development';
  process.env.AI_ROUTINE_PROVIDER = 'deepseek';
  process.env.AI_ROUTINE_MODEL = 'deepseek-v4-flash';
  process.env.AI_FALLBACK_PROVIDER = 'anthropic';
  process.env.AI_FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
  process.env.AI_DEEPSEEK_ROUTING_ENABLED = 'true';
  process.env.AI_DEEPSEEK_ROUTING_APPROVED = 'true';
  process.env.AI_DEEPSEEK_ROUTING_APPROVAL_VERSION = 'synthetic-routing-test-v1';
  process.env.DEEPSEEK_API_KEY = 'synthetic-deepseek-key';
  process.env.ANTHROPIC_API_KEY = 'synthetic-anthropic-key';
  delete process.env.JOB_AGENT_MONETARY_BUDGET_ENABLED;

  console.error = () => {};
  console.log = () => {};
  __resetLocalRateLimitsForTests();

  for (const failure of failures) {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), headers: options?.headers });
      if (String(url).includes('api.deepseek.com')) return failure.response();
      if (String(url).includes('api.anthropic.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [{ type: 'text', text: 'I can compare verified roles and show the best next step.' }],
            usage: { input_tokens: 12, output_tokens: 14 },
          }),
        };
      }
      throw new Error(`Unexpected provider URL: ${url}`);
    };

    const response = mockResponse();
    await aiHandler({
      method: 'POST',
      headers: { origin: 'http://localhost:4175', 'content-type': 'application/json' },
      body: { callType: 'concierge', content: `Synthetic ${failure.id} fallback case.` },
      socket: {},
    }, response);

    assert.equal(response.statusCode, 200, `${failure.id}: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.provider, 'anthropic', failure.id);
    assert.equal(calls.length, 2, `${failure.id} must be bounded to primary plus one fallback`);
    assert.match(calls[0].url, /api\.deepseek\.com/);
    assert.match(calls[1].url, /api\.anthropic\.com/);
    assert.equal(calls[0].headers.Authorization, 'Bearer synthetic-deepseek-key');
    assert.equal(calls[1].headers['x-api-key'], 'synthetic-anthropic-key');
  }
} finally {
  globalThis.fetch = previousFetch;
  console.error = previousConsoleError;
  console.log = previousConsoleLog;
  __resetLocalRateLimitsForTests();
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log('AI API timeout, 429, 500, malformed, empty, unavailable, and bounded fallback tests passed.');
