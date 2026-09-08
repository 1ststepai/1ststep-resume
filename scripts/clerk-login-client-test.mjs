import assert from 'node:assert/strict';
import { initializeLoginPage } from '../login.js';
async function run({signedIn=true, enabled=true, failure=false, mode=''}={}) {
  const calls=[], cache=new Map(), scripts=[];
  const elements = Object.fromEntries(['loginStatus','retryLogin','clerkSignIn'].map(id=>[id,{hidden:true,textContent:'',addEventListener(type,fn){this[type]=fn;}}]));
  const result={calls,cache,scripts,elements};
  const clerk={session:signedIn?{getToken:async(options)=> {assert.equal(options.skipCache,true);return 'fixture.session.token';}}:null,load:async()=>{},signOut:async()=>{result.signedOut=true;},redirectToSignIn:async(options)=>{assert.equal(options.signInForceRedirectUrl,'https://app.1ststep.ai/login.html');result.signIn=true;},redirectToSignUp:async()=>{result.signUp=true;}};
  await initializeLoginPage({
    documentRef:{getElementById:id=>elements[id],createElement:()=>({dataset:{}}),head:{appendChild(script){scripts.push(script.src);script.onload();}}},
    windowRef:{Clerk:clerk},
    locationRef:{origin:'https://app.1ststep.ai',search:mode?`?mode=${mode}`:'?redirect=https://evil.example',replace:url=>{result.redirect=url;},reload:()=>{result.reloaded=true;}},
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
