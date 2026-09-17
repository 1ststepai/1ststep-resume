import assert from 'node:assert/strict';
import loginPageHandler, { loginContentSecurityPolicy } from '../api/login-page.js';
import { initializeLoginPage } from '../login.js';
import { allowedClerkBrowserScriptSrc, DEVELOPMENT_CLERK_BROWSER_SCRIPT, DEVELOPMENT_CLERK_FRONTEND_ORIGIN, PRODUCTION_CLERK_BROWSER_SCRIPT } from '../client/clerk-browser-script.js';
async function run({signedIn=true, enabled=true, failure=false, mode='', returnTo='', token='fixture.session.token', production=true, frontendApiUrl}={}) {
  const calls=[], cache=new Map(), scripts=[];
  const elements = Object.fromEntries(['loginStatus','retryLogin','clerkSignIn'].map(id=>[id,{hidden:true,textContent:'',addEventListener(type,fn){this[type]=fn;}}]));
  const result={calls,cache,scripts,elements};
  const expectedReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('/login.html') ? returnTo : '/app';
  const expectedCallback = `https://app.1ststep.ai/login.html?returnTo=${encodeURIComponent(expectedReturnTo)}`;
  const clerk={session:signedIn?{getToken:async(options)=> {assert.equal(options.skipCache,true);return token;}}:null,load:async(options)=>{assert.equal(options.signInForceRedirectUrl,expectedCallback);assert.equal(options.signUpForceRedirectUrl,expectedCallback);result.loadOptions=options;},signOut:async()=>{result.signedOut=true;},redirectToSignIn:async(options)=>{assert.equal(options.signInForceRedirectUrl,expectedCallback);result.signIn=true;},redirectToSignUp:async(options)=>{assert.equal(options.signUpForceRedirectUrl,expectedCallback);result.signUp=true;}};
  await initializeLoginPage({
    documentRef:{getElementById:id=>elements[id],createElement:()=>({dataset:{}}),head:{appendChild(script){scripts.push(script.src);script.onload();}}},
    windowRef:{Clerk:clerk},
    locationRef:{origin:'https://app.1ststep.ai',search:new URLSearchParams({...(mode?{mode}:{}),...(returnTo?{returnTo}:{redirect:'https://evil.example'})}).toString().replace(/^/,'?'),replace:url=>{result.redirect=url;},reload:()=>{result.reloaded=true;}},
    storage:{setItem:(k,v)=>cache.set(k,v)},
    timeout:()=>undefined,
    now:()=>0,
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      if(url==='/api/app-config')return{ok:true,json:async()=>({authentication:{clerk:{enabled,publishableKey:production?'pk_live_fixture':'pk_test_fixture',frontendApiUrl:frontendApiUrl||(production?'https://clerk.1ststep.ai':'https://first-impala-7783.clerk.accounts.dev'),signInUrl:production?'https://accounts.1ststep.ai/sign-in':null,signUpUrl:production?'https://accounts.1ststep.ai/sign-up':null}}})};
      return{ok:!failure,json:async()=>failure?{error:'Subscription temporarily unavailable'}:{signedIn:true,email:'verified@example.test',tier:'complete',status:'active'}};
    },
  });
  return result;
}
const success=await run();
assert.equal(success.scripts[0],'https://clerk.1ststep.ai/npm/@clerk/clerk-js@6/dist/clerk.browser.js');
assert.equal(success.loadOptions.signInUrl,'https://accounts.1ststep.ai/sign-in');
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
const preview=await run({production:false});
assert.equal(preview.scripts[0], DEVELOPMENT_CLERK_BROWSER_SCRIPT);
assert.equal(Object.hasOwn(preview.loadOptions,'signInUrl'),false,'Preview must let the development Clerk instance choose its Account Portal');
assert.equal(Object.hasOwn(preview.loadOptions,'signUpUrl'),false,'Preview must not receive Production Account Portal URLs');
const mismatched=await run({production:false,frontendApiUrl:'https://clerk.1ststep.ai'});
assert.equal(mismatched.scripts.length,0,'A test key cannot load the Production Clerk origin');
assert.match(mismatched.elements.loginStatus.textContent,/invalid/i);
const unknownDevHost=await run({production:false,frontendApiUrl:'https://fixture.clerk.accounts.dev'});
assert.equal(unknownDevHost.scripts.length,0,'Unknown development Clerk hosts must fail closed');
const extraDevLabel=await run({production:false,frontendApiUrl:'https://foo.evil.clerk.accounts.dev'});
assert.equal(extraDevLabel.scripts.length,0,'Development Clerk hosts must be exactly one accounts.dev subdomain');
const attackerSuffix=await run({production:false,frontendApiUrl:'https://first-impala-7783.clerk.accounts.dev.evil.example'});
assert.equal(attackerSuffix.scripts.length,0,'Suffix-style Clerk hostnames must fail closed');
const javascriptSrc=await run({production:false,frontendApiUrl:'javascript:alert(1)'});
assert.equal(javascriptSrc.scripts.length,0);
const cleartextClerkOrigin = new URL(DEVELOPMENT_CLERK_FRONTEND_ORIGIN);
cleartextClerkOrigin.protocol = 'http:';
assert.equal(cleartextClerkOrigin.protocol, 'http:');
const httpSrc=await run({production:false,frontendApiUrl:cleartextClerkOrigin.href});
assert.equal(httpSrc.scripts.length,0,'Cleartext Clerk origins must fail closed');
assert.equal(allowedClerkBrowserScriptSrc(cleartextClerkOrigin.href, false), '');
assert.equal(allowedClerkBrowserScriptSrc('https://clerk.1ststep.ai', true), PRODUCTION_CLERK_BROWSER_SCRIPT);
assert.equal(allowedClerkBrowserScriptSrc('https://first-impala-7783.clerk.accounts.dev', false), DEVELOPMENT_CLERK_BROWSER_SCRIPT);
assert.equal(allowedClerkBrowserScriptSrc('https://fixture.clerk.accounts.dev', false), '');
assert.equal(allowedClerkBrowserScriptSrc('https://foo.evil.clerk.accounts.dev', false), '');
assert.equal((await run({signedIn:false})).signIn,true);
assert.equal((await run({signedIn:false,mode:'sign-up'})).signUp,true);
const logout=await run({mode:'sign-out'});
assert.equal(logout.signedOut,true);
assert.equal(logout.calls.some(call=>call.url.includes('clerk-exchange')),false);
const failedLogout=await run({mode:'sign-out',failure:true});
failedLogout.elements.retryLogin.click();
assert.equal(failedLogout.reloaded,true,'Retrying logout cannot create a new login session');
const productionKey=`pk_live_${Buffer.from('clerk.1ststep.ai$').toString('base64url')}`;
const developmentKey=`pk_test_${Buffer.from('first-impala-7783.clerk.accounts.dev$').toString('base64url')}`;
const productionCsp=loginContentSecurityPolicy({VERCEL_ENV:'production',CLERK_PUBLISHABLE_KEY:productionKey});
const previewCsp=loginContentSecurityPolicy({VERCEL_ENV:'preview',CLERK_PUBLISHABLE_KEY:developmentKey});
assert.match(productionCsp,/https:\/\/clerk\.1ststep\.ai/);
assert.doesNotMatch(productionCsp,/clerk\.accounts\.dev/,'Production CSP must not trust the development Clerk instance');
assert.match(previewCsp,/https:\/\/first-impala-7783\.clerk\.accounts\.dev/);
assert.doesNotMatch(previewCsp,/https:\/\/clerk\.1ststep\.ai/,'Preview CSP must not trust the Production Clerk instance');
const priorEnvironment={...process.env};
try{
  Object.assign(process.env,{VERCEL_ENV:'preview',CLERK_PUBLISHABLE_KEY:developmentKey});
  for(const [method,url] of [
    ['GET','/login.html'],
    ['GET','/login.html?mode=sign-up&returnTo=%2Fapp'],
    ['GET','/login.html?mode=sign-out&returnTo=%2Fpartner'],
    ['HEAD','/login.html?returnTo=%2Fapp'],
  ]){
    const captured={headers:{},statusCode:null,body:null};
    const response={setHeader:(key,value)=>{captured.headers[key]=value;},status(code){captured.statusCode=code;return this;},send(body){captured.body=body;return this;},end(){return this;}};
    loginPageHandler({method,url},response);
    assert.equal(captured.statusCode,200,`${method} ${url} must reach the login response`);
    assert.equal(captured.headers['Cache-Control'],'no-store');
    assert.equal(captured.headers['Set-Cookie'],undefined,'The public login shell must not create a session');
    assert.match(captured.headers['Content-Security-Policy'],/first-impala-7783\.clerk\.accounts\.dev/);
    assert.match(captured.headers['Content-Security-Policy'],/frame-ancestors 'none'/);
    assert.doesNotMatch(captured.headers['Content-Security-Policy'],/clerk\.1ststep\.ai/);
    assert.equal(captured.headers['X-Frame-Options'],'DENY');
    assert.equal(captured.headers['X-Content-Type-Options'],'nosniff');
    assert.equal(captured.headers['Referrer-Policy'],'strict-origin-when-cross-origin');
    assert.equal(captured.headers['Permissions-Policy'],'camera=(), microphone=(), geolocation=(self)');
    if(method==='HEAD')assert.equal(captured.body,'');
    else assert.match(captured.body,/src="\/login\.js"/);
  }
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){
    const captured={headers:{},statusCode:null,body:null};
    const response={setHeader:(key,value)=>{captured.headers[key]=value;},status(code){captured.statusCode=code;return this;},send(body){captured.body=body;return this;},end(){return this;}};
    loginPageHandler({method,url:'/api/login-page'},response);
    assert.equal(captured.statusCode,405,`${method} cannot mutate through the public login shell`);
    assert.equal(captured.headers.Allow,'GET, HEAD');
    assert.equal(captured.headers['Set-Cookie'],undefined);
    assert.equal(captured.body,null);
  }
}finally{
  for(const key of Object.keys(process.env))if(!Object.hasOwn(priorEnvironment,key))delete process.env[key];
  Object.assign(process.env,priorEnvironment);
}
console.log('Login client checks passed: verified exchange, fixed redirects, no token storage, sign-up, failure recovery, and logout.');
