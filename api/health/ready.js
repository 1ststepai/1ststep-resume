import { jobAgentDependencyHealth } from '../../lib/job-agent-health.js';

export const maxDuration = 8;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const health = await jobAgentDependencyHealth();
  return res.status(health.ready ? 200 : 503).json({ status: health.status, ready: health.ready, checkedAt: health.checkedAt });
}
