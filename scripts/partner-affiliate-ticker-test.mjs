import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, script, styles, config] = await Promise.all([
  readFile(new URL('../partners-landing/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../partners-landing/assets/partner-284b3be68cb6.js', import.meta.url), 'utf8'),
  readFile(new URL('../partners-landing/assets/partner-3093c794ea96.css', import.meta.url), 'utf8'),
  readFile(new URL('../partners-landing/vercel.json', import.meta.url), 'utf8'),
]);
const source = `${html}\n${script}\n${styles}\n${config}`;

assert.match(source, /https:\/\/app\.1ststep\.ai\/api\/affiliates/);
assert.match(source, /verified referrals tracked/);
assert.match(source, /active partner codes/);
assert.match(source, /referred paid subscribers/);
assert.match(source, /Live referral totals will appear here when verified tracking is available/);
assert.match(html, /id="partnerEmail"[^>]+type="email"/);
assert.match(html, /id="partnerTerms"[^>]+type="checkbox"/);
assert.match(script, /acceptedTerms:\s*true/);
assert.match(script, /Registration saved for review/);
assert.match(script, /partner\.registered && partner\.referralCode/);
assert.match(styles, /@keyframes partnerTicker/);
assert.match(config, /connect-src 'self' https:\/\/app\.1ststep\.ai/);
assert.match(html, /30% recurring commission/i);
assert.match(html, /60 days/i);
assert.match(html, /30-day payment confirmation period/i);
assert.match(html, /Minimum payout threshold:\s*\$50/i);
assert.doesNotMatch(html, /Founder Partner Bonus/i);
assert.doesNotMatch(source, /data-ticker="(?:referrals|partners|paid)"[^>]*>[^<]*(?:email|name|customer)/i);

console.log('Partner registration, aggregate-only live ticker, unavailable-state honesty, and current published terms tests passed.');
