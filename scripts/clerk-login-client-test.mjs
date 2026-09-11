import assert from 'node:assert/strict';
import { initializeLoginPage } from '../login.js';
async function run({signedIn=true, enabled=true, failure=false, mode='', returnTo='', token='fixture.session.token'}={}) {
  const calls=[], cache=new Map(), scripts=[];
  const elements = Object.fromEntries(['loginStatus','retryLogin','clerkSignIn'].map(id=>[id,{hidden:true,textContent:'',addEventListener(type,fn){this[type]=fn;}}]));
  const result={calls,cache,scripts,elements};
  const expectedReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('/login.html') ? returnTo : '/app';
  const expectedCallback = `https://app.1ststep.ai/login.html?returnTo=${encodeURIComponent(expectedReturnTo)}`;
  const clerk={session:signedIn?{getToken:async(options)=> {assert.equal(options.skipCache,true);return token;}}:null,load:async(options)=>{assert.equal(options.signInForceRedirectUrl,expectedCallback);assert.equal(options.signUpForceRedirectUrl,expectedCallback);},signOut:async()=>{result.signedOut=true;},redirectToSignIn:async(options)=>{assert.equal(options.signInForceRedirectUrl,expectedCallback);result.signIn=true;},redirectToSignUp:async(options)=>{assert.equal(options.signUpForceRedirectUrl,expectedCallback);result.signUp=true;}};
  await initializeLoginPage({
    documentRef:{getElementById:id=>elements[id],createElement:()=>({dataset:{}}),head:{appendChild(script){scripts.push(script.src);script.onload();}}},
    windowRef:{Clerk:clerk},
    locationRef:{origin:'https://app.1ststep.ai',search:new URLSearchParams({...(mode?{mode}:{}),...(returnTo?{returnTo}:{redirect:'https://evil.example'})}).toString().replace(/^/,'?'),replace:url=>{result.redirect=url;},reload:()=>{result.reloaded=true;}},
    storage:{setItem:(k,v)=>cache.set(k,v)},
    timeout:()=>undefined,
    now:()=>0,
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      if(url==='/api/app-config')return{ok:true,json:async()=>({authentication:{clerk:{enabled,publishableKey:'pk_live_fixture'}}})};
      return{ok:!failure,json:async()=>failure?{error:'Subscription temporarily unavailable'}:{signedIn:true,email:'verified@example.test',tier:'complete',status:'active'}};
    },
  });
  return result;
}
const success=await run();
assert.equal(success.redirect,'/app','Ignore untrusted redirect parameters');
assert.equal(success.calls[1].options.headers.Authorization,'Bearer fixture.session.token');
assert.equal(success.calls[1].options.credentials,'same-origin');
assert.equal(success.cache.size,1);
assert.equal([...success.cache.values()][0].includes('fixture.session.token'),false);
assert.deepEqual(JSON.parse([...success.cache.values()][0]), { ts: 0, jobAgentSession: true });
const returned=await run({returnTo:'/app?resume=continue#review'});
assert.equal(returned.redirect,'/app?resume=continue#review','OAuth and magic-link exchange must preserve the intended in-app route');
const existingPartner=await run({returnTo:'/partner?path=existing-user'});
assert.equal(existingPartner.redirect,'/partner?path=existing-user','Existing users must retain the explicit partner-linking path across Clerk redirects');
const affiliateOnly=await run({returnTo:'/partner?path=affiliate-only',mode:'sign-up'});
assert.equal(affiliateOnly.redirect,'/partner?path=affiliate-only','Affiliate-only applicants must retain the isolated role path across Clerk redirects');
const rejectedExternal=await run({returnTo:'https://evil.example/steal'});
assert.equal(rejectedExternal.redirect,'/app','External return URLs must fail closed');
const expired=await run({token:null});
assert.equal(expired.redirect,undefined);
assert.match(expired.elements.loginStatus.textContent,/expired/i);
assert.equal(expired.elements.retryLogin.hidden,false);
for (const authenticationMethod of ['email-password','magic-link','oauth']) {
  const unifiedSession=await run({returnTo:`/app?auth=${authenticationMethod}`});
  assert.equal(unifiedSession.calls.filter(call=>call.url==='/api/user-session?action=clerk-exchange').length,1,`${authenticationMethod} must exchange into the same app session once`);
  assert.equal(unifiedSession.redirect,`/app?auth=${authenticationMethod}`);
}
const failed=await run({failure:true});
assert.equal(failed.redirect,undefined);
assert.equal(failed.cache.size,0);
assert.equal(failed.elements.retryLogin.hidden,false);
const disabled=await run({enabled:false});
assert.equal(disabled.scripts.length,0);
assert.equal((await run({signedIn:false})).signIn,true);
assert.equal((await run({signedIn:false,mode:'sign-up'})).signUp,true);
const logout=await run({mode:'sign-out'});
assert.equal(logout.signedOut,true);
assert.equal(logout.calls.some(call=>call.url.includes('clerk-exchange')),false);
const failedLogout=await run({mode:'sign-out',failure:true});
failedLogout.elements.retryLogin.click();
assert.equal(failedLogout.reloaded,true,'Retrying logout cannot create a new login session');
console.log('Login client checks passed: verified exchange, fixed redirects, no token storage, sign-up, failure recovery, and logout.');
