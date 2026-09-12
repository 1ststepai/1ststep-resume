import { createPublicKey } from 'node:crypto';

const EXPECTED_INSTANCE_ID = 'ins_3Ixlu9jY678IVA1WkkJnDTItYiP';

function samePublicKey(pem, jwk) {
  const configured = createPublicKey(pem).export({ type: 'spki', format: 'der' });
  const instance = createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'der' });
  return configured.equals(instance);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).end();
  if (req.method !== 'GET') return res.status(405).end();

  const result = {
    serverKeyAccepted: false,
    developmentInstance: false,
    expectedInstance: false,
    jwtKeyMatchesInstance: false,
  };
  const secret = process.env.CLERK_SECRET_KEY;
  const jwtKey = process.env.CLERK_JWT_KEY;
  if (!secret || !jwtKey) return res.status(200).json(result);

  try {
    const headers = { Authorization: `Bearer ${secret}` };
    const [instanceResponse, jwksResponse] = await Promise.all([
      fetch('https://api.clerk.com/v1/instance', { headers }),
      fetch('https://api.clerk.com/v1/jwks', { headers }),
    ]);
    result.serverKeyAccepted = instanceResponse.ok;
    if (!instanceResponse.ok || !jwksResponse.ok) return res.status(200).json(result);

    const [instance, jwks] = await Promise.all([instanceResponse.json(), jwksResponse.json()]);
    result.developmentInstance = instance.environment_type === 'development';
    result.expectedInstance = instance.id === EXPECTED_INSTANCE_ID;
    result.jwtKeyMatchesInstance = Array.isArray(jwks.keys)
      && jwks.keys.some((key) => {
        try { return samePublicKey(jwtKey, key); } catch { return false; }
      });
  } catch {
    // No provider response body, credential, or parsing error enters the response.
  }
  return res.status(200).json(result);
}
