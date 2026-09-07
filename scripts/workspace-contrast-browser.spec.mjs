const testOrigin = new URL(process.env.CONCIERGE_TEST_URL || testOrigin + '/concierge').origin;
import { test, expect } from '@playwright/test';

const base = testOrigin;

// The light-theme migration flipped page ink to --agent-ink while several
// components kept dark-theme text and panel colours. That left 20 WCAG AA
// failures in the signed-in dashboard, the worst at 1.05:1 - text that was
// effectively invisible. Static greps could not catch it because most of the
// stale declarations were already overridden; only the rendered result tells
// the truth. This measures the rendered result.
const AUDIT = `(() => {
  function parse(c){const m=c.match(/[\\d.]+/g);if(!m)return null;return{r:+m[0],g:+m[1],b:+m[2],a:m[3]===undefined?1:+m[3]};}
  function chan(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}
  function relLum(c){return 0.2126*chan(c.r)+0.7152*chan(c.g)+0.0722*chan(c.b);}
  function ratio(f,b){const x=relLum(f)+0.05,y=relLum(b)+0.05;return x>y?x/y:y/x;}
  function effBg(el){let n=el;while(n){const c=parse(getComputedStyle(n).backgroundColor);if(c&&c.a>0.85)return c;n=n.parentElement;}return{r:255,g:255,b:255,a:1};}
  function where(el){const p=[];let n=el;for(let i=0;i<4&&n&&n.tagName;i++){p.unshift(n.tagName.toLowerCase()+(n.className?'.'+String(n.className).trim().split(/\\s+/)[0]:''));n=n.parentElement;}return p.join('>');}
  const failures=[];
  const root=document.querySelector('#resumeOverlay.open')||document.querySelector('.application-overlay.open')||document.querySelector('.desk-overlay.open')||document;
  for(const el of root.querySelectorAll('*')){
    if(el.children.length>0) continue;                       // text-bearing leaves only
    const text=(el.textContent||'').trim();
    if(text.length<2) continue;
    const rect=el.getBoundingClientRect();
    if(rect.width<4||rect.height<4) continue;                // not rendered
    const cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.opacity==='0') continue;
    const fg=parse(cs.color);
    if(!fg||fg.a===0) continue;
    const px=parseFloat(cs.fontSize);
    const bold=parseInt(cs.fontWeight,10)>=700;
    const need=(px>=24||(px>=18.66&&bold))?3:4.5;            // WCAG 1.4.3 large-text rule
    const cr=ratio(fg,effBg(el));
    if(cr<need) failures.push({ where: where(el), text: text.slice(0,32), px, ratio: Math.round(cr*100)/100, need });
  }
  return failures;
})()`;

const SURFACES = [
  { name: 'signed-out landing', url: `${base}/concierge` },
  { name: 'subscriber workspace', url: `${base}/concierge?uiFixture=subscriber` }
];

for (const surface of ['admin', 'application']) for (const width of [375,1440]) {
  test(`${surface} overlay contrast at ${width}px`, async ({page}) => {
    await page.setViewportSize({width:surface === 'admin' ? 1440 : width,height:900});
    await page.route('**/api/session-capabilities*', r => r.fulfill({json:{adminConsole:true,jobAgentAccess:true,authentication:'opaque-session'}}));
    await page.route('**/api/application-sessions*', r => r.fulfill({json:{sessions:[{id:'application-contrast-fixture',version:1,role:{employer:'Synthetic Employer',title:'Operations',directEmployerUrl:'https://careers.example.com/job'},documentVersion:'synthetic-resume-v1',state:'Waiting for You',stage:'employer_form',proposedFields:[],approvals:{},actions:[{id:'action-contrast',type:'AMBIGUOUS_FACT',status:'open',summary:'Review the employer question.',metadata:{}}],timeline:[]}]}}));
    await page.goto(`${base}/concierge`,{waitUntil:'networkidle'});
    await page.locator(surface === 'admin' ? '#openDesk' : '#reviewAttentionNow').click();
    await page.setViewportSize({width,height:900});
    const failures = await page.evaluate(AUDIT);
    expect(failures,JSON.stringify(failures)).toEqual([]);
    await page.screenshot({path:`${process.env.TEMP || '/tmp'}/${surface}-contrast-${width}.png`});
  });
}

for (const width of [375, 1440]) {
  test(`resume overlay readable and mobile nav meets rendered floor at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.goto(`${base}/concierge`,{waitUntil:'networkidle'});
    if(width === 375) {
      const buttons = await page.locator('.agent-header nav button:visible').evaluateAll(nodes => nodes.map(n => ({font:parseFloat(getComputedStyle(n).fontSize),height:n.getBoundingClientRect().height})));
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons.every(b => b.font >= 11.2 && b.height >= 44)).toBe(true);
    }
    await page.locator('#openGuidedLaunch').click();
    await page.locator('[data-guided-goal="best-fit"]').click();
    await page.locator('#quickUploadResume').click();
    await expect(page.locator('#resumeOverlay')).toHaveClass(/open/);
    const failures = await page.evaluate(AUDIT);
    expect(failures,JSON.stringify(failures)).toEqual([]);
    await page.screenshot({path:`${process.env.TEMP || '/tmp'}/resume-contrast-${width}.png`});
  });
}

for (const surface of SURFACES) {
  for (const width of [375, 1440]) {
    test(`${surface.name} meets WCAG AA text contrast at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(surface.url);
      await page.waitForLoadState('networkidle');
      const failures = await page.evaluate(AUDIT);
      expect(
        failures,
        failures.map(f => `${f.ratio}:1 (needs ${f.need}) ${f.px}px "${f.text}" at ${f.where}`).join('\n')
      ).toEqual([]);
    });
  }
}

test('the primary Needs You panel never renders dark text on a dark panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/concierge?uiFixture=subscriber`);
  await expect(page.locator('#attentionNow')).toBeVisible();
  const unreadable = await page.evaluate(`(() => {
    function lum(rgb){const m=rgb.match(/[\\d.]+/g);if(!m)return null;if(m[3]!==undefined&&Number(m[3])===0)return null;const[r,g,b]=m.map(Number);return 0.2126*r+0.7152*g+0.0722*b;}
    const bad=[];
    for(const el of document.querySelectorAll('*')){
      const r=el.getBoundingClientRect();
      if(r.width<8||r.height<8) continue;
      const cs=getComputedStyle(el);
      const bg=lum(cs.backgroundColor);
      if(bg===null||bg>=90) continue;
      const fg=lum(cs.color);
      if(fg!==null&&fg<120) bad.push(String(el.className||el.tagName));
    }
    return bad;
  })()`);
  expect(unreadable, unreadable.join(', ')).toEqual([]);
});
