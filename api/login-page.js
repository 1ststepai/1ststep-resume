import { readFile } from 'node:fs/promises';
import { clerkBrowserConfiguration } from '../lib/public-authentication-configuration.js';

const loginPage = await readFile(new URL('../login.html', import.meta.url), 'utf8');

export function loginContentSecurityPolicy(env = process.env) {
  const clerk = clerkBrowserConfiguration(env.CLERK_PUBLISHABLE_KEY, env.VERCEL_ENV);
  const frontendApi = clerk ? ` ${clerk.frontendApiUrl}` : '';
  return `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'${frontendApi} https://challenges.cloudflare.com https://*.protect.clerk.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://img.clerk.com; connect-src 'self'${frontendApi} https://*.protect.clerk.com:*; frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com; worker-src 'self' blob:; upgrade-insecure-requests`;
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', loginContentSecurityPolicy());
  return res.status(200).send(req.method === 'HEAD' ? '' : loginPage);
}
