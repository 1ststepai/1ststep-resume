import { buildAiRequest } from '../lib/ai-provider.js';
const names = ['AI_PROVIDER', 'AI_DOCUMENT_PROVIDER', 'AI_DOCUMENT_MODEL', 'AI_QUALITY_MODEL', 'AI_OPENAI_REASONING_EFFORT'];
const configuration = Object.fromEntries(names.map(name => [name, process.env[name]?.trim() || '(unavailable in export)']));
let route;
try {
  const request = buildAiRequest({ env: process.env, quality: 'quality', task: 'application-package', system: 'Synthetic diagnostic; do not call provider.', messages: [], maxTokens: 3000 });
  route = { configured: request.configured, provider: request.provider, model: request.model };
} catch (error) {
  route = { configured: false, code: /credentials/.test(error.message) ? 'CREDENTIALS_INCOMPLETE' : /reasoning/.test(error.message) ? 'REASONING_CONFIGURATION' : /provider/.test(error.message) ? 'PROVIDER_NAME_INVALID' : 'ROUTING_CONFIGURATION' };
}
console.log(JSON.stringify({ configuration, route, providerRequestsMade: 0 }, null, 2));
