export const maxDuration = 5;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json({ status: 'healthy', alive: true, checkedAt: new Date().toISOString() });
}
