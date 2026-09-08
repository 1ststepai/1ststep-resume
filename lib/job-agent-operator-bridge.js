import { timingSafeEqual } from 'node:crypto';

export const JOB_AGENT_OPERATOR_BRIDGE_HEADER = 'x-1ststep-operator-bridge-secret';

function constantTimeEqual(left, right) {
  const actual = Buffer.from(String(left || ''));
  const expected = Buffer.from(String(right || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isJobAgentOperatorBridgeAuthorized(req = {}, env = process.env) {
  const expected = String(env.JOB_AGENT_OPERATOR_BRIDGE_SECRET || '');
  const provided = String(req.headers?.[JOB_AGENT_OPERATOR_BRIDGE_HEADER] || '');
  if (expected.length < 32 || provided.length < 32 || provided.length > 512) return false;
  return constantTimeEqual(provided, expected);
}
