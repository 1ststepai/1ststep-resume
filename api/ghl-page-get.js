/**
 * GET /api/ghl-page-get?pageId=ccca26a1-f81e-41a8-affd-c7ce62f9d82f
 *
 * TEMPORARY endpoint — fetch raw GHL funnel page JSON so we can edit and re-import.
 * DELETE this file after use.
 */

export const maxDuration = 15;

export default async function handler(req, res) {
  // Only allow from local / Evan's IP — basic protection for a temp endpoint
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  const pageId     = req.query.pageId || 'ccca26a1-f81e-41a8-affd-c7ce62f9d82f';

  if (!apiKey || !locationId) {
    return res.status(500).json({ error: 'GHL env vars not set' });
  }

  const url = `https://services.leadconnectorhq.com/funnels/page?locationId=${locationId}&pageId=${pageId}`;

  try {
    const r = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
      },
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: 'GHL API error', details: data });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
