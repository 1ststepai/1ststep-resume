import assert from 'node:assert/strict';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { clerkSubscriptionRequest } from '../api/user-session.js';
import { isOriginAllowed } from '../lib/api-security.js';
import { sendVerifiedSubscriptionSession } from '../api/subscription.js';
const req = new IncomingMessage(new Socket());
req.headers = { origin: 'https://app.1ststep.ai', host: 'app.1ststep.ai' };
req.query = { action: 'clerk-exchange' };
assert.equal({...req}.headers, undefined, 'Reproduce Node request getter loss');
assert.equal(isOriginAllowed(req),true);
const handoff = clerkSubscriptionRequest(req);
assert.equal(isOriginAllowed(handoff),true,'The subscription handoff must retain origin evidence');
assert.equal(handoff.query.client,'job-agent');
assert.equal(req.query.client,undefined,'Do not mutate the original request');
req.headers = { origin:'https://evil.example', host:'app.1ststep.ai' };
assert.equal(isOriginAllowed(clerkSubscriptionRequest(req)),false,'Foreign origins stay blocked');
process.env.TIER_SECRET = 'founder-access-isolated-fixture-32-characters';
const res = { status(code){this.code=code;return this;},setHeader(){},json(body){this.body=body;return this;} };
await sendVerifiedSubscriptionSession({query:{},headers:{}},res,'evan@1ststep.ai',{signedIn:true}, {
  customers:{list:async()=>{throw new Error('Verified founder must not require a Stripe purchase');}},
});
assert.equal(res.code,200);
assert.equal(res.body.tier,'complete');
assert.equal(res.body.status,'owner_verified_access');
console.log('Real Node request origin retained, foreign origin blocked, verified founder gets complete access without a purchase.');
