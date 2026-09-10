import assert from 'node:assert/strict';
import { normalizePartnerApplication, partnerSubjectHash, recordPartnerAttribution, savePartnerApplication } from '../lib/partner-account.js';
class MemoryRedis { constructor(){this.data=new Map()} async get(k){return this.data.get(k) ?? null} async set(k,v,o={}){if(o.nx&&this.data.has(k))return null;this.data.set(k,v);return 'OK'} async del(k){return this.data.delete(k)?1:0} }
const redis=new MemoryRedis(), secret='s'.repeat(32), subject='person@example.test';
assert.deepEqual(normalizePartnerApplication({displayName:' Career Coach ',code:'Career_Coach',acceptedTerms:true}),{displayName:'Career Coach',code:'career-coach'});
await assert.rejects(()=>savePartnerApplication({displayName:'x',code:'bad',acceptedTerms:true},{subject,redis,secret}),/PARTNER_NAME_INVALID/);
const pending=await savePartnerApplication({displayName:'Career Coach',code:'career-coach',acceptedTerms:true},{subject,redis,secret,now:new Date('2026-09-10T00:00:00Z')});
assert.equal(pending.status,'pending');
assert.equal(await redis.get(`partner:v1:code:career-coach`),partnerSubjectHash(subject,secret));
await assert.rejects(()=>savePartnerApplication({displayName:'Other Coach',code:'career-coach',acceptedTerms:true},{subject:'other@example.test',redis,secret}),/PARTNER_CODE_TAKEN/);
assert.deepEqual(await recordPartnerAttribution({subject:'new@example.test',code:'career-coach',redis,secret,now:new Date('2026-09-10T01:00:00Z')}),{recorded:true,code:'career-coach',commissionEligible:false});
console.log('Partner account checks passed: authenticated durable profile, unique code, pending state, and beta attribution.');
