import { test, expect } from '@playwright/test';

const testOrigin = new URL(process.env.CONCIERGE_TEST_URL || 'http://127.0.0.1:4175/concierge').origin;
const base = testOrigin;
const themes = ['light', 'dark'];

const explainFailures = (label, failures) => [
  `${label}: ${failures.length} contrast failure(s)`,
  ...failures.map(({ ratio, need, text, placeholder, where }) =>
    `${ratio}:1 needs ${need}: "${text || placeholder || '(unlabelled control)'}" at ${where}`),
].join('\n');

async function openWithTheme(page, url, theme) {
  await page.addInitScript(value => localStorage.setItem('1ststep_theme', value), theme);
  await page.goto(url, { waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

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
    const control=el.matches('input,textarea,select');
    if(el.children.length>0&&!control) continue;              // text-bearing leaves and controls only
    const placeholder=control&&!el.value?el.getAttribute('placeholder')||'':'';
    const text=(control?(el.value||placeholder||el.getAttribute('aria-label')||''):(el.textContent||'')).trim();
    if(text.length<2) continue;
    const rect=el.getBoundingClientRect();
    if(rect.width<4||rect.height<4) continue;                // not rendered
    const cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.opacity==='0') continue;
    const fg=parse(placeholder?getComputedStyle(el,'::placeholder').color:cs.color);
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

for (const theme of themes) for (const surface of ['admin', 'application']) for (const width of [375,1440]) {
  test(`${surface} overlay ${theme} contrast at ${width}px`, async ({page}) => {
    await page.setViewportSize({width:surface === 'admin' ? 1440 : width,height:900});
    await page.route('**/api/session-capabilities*', r => r.fulfill({json:{adminConsole:true,jobAgentAccess:true,authentication:'opaque-session'}}));
    await page.route('**/api/application-sessions*', r => r.fulfill({json:{sessions:[{id:'application-contrast-fixture',version:1,role:{employer:'Synthetic Employer',title:'Operations',directEmployerUrl:'https://careers.example.com/job'},documentVersion:'synthetic-resume-v1',state:'Waiting for You',stage:'employer_form',proposedFields:[],approvals:{},actions:[{id:'action-contrast',type:'AMBIGUOUS_FACT',status:'open',summary:'Review the employer question.',metadata:{}}],timeline:[]}]}}));
    await openWithTheme(page, `${base}/concierge`, theme);
    if (surface === 'admin') await page.locator('#openDesk').evaluate(button => button.click());
    else await page.locator('#reviewAttentionNow').click();
    await page.setViewportSize({width,height:900});
    const failures = await page.evaluate(AUDIT);
    expect(failures.length, explainFailures(`${surface} ${theme} ${width}px`, failures)).toBe(0);
    await page.screenshot({path:`${process.env.TEMP || '/tmp'}/${surface}-${theme}-contrast-${width}.png`});
  });
}

for (const theme of themes) for (const width of [375, 1440]) {
  test(`resume overlay ${theme} readable and mobile nav meets rendered floor at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await openWithTheme(page, `${base}/concierge`, theme);
    if(width === 375) {
      const menu = await page.locator('#appMenu > summary').evaluate(node => ({font:parseFloat(getComputedStyle(node).fontSize),height:node.getBoundingClientRect().height}));
      expect(menu.font).toBeGreaterThanOrEqual(11.2);
      expect(menu.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#openResumeSetup').evaluate(button => button.click());
    await expect(page.locator('#resumeOverlay')).toHaveClass(/open/);
    const failures = await page.evaluate(AUDIT);
    expect(failures.length, explainFailures(`resume ${theme} ${width}px`, failures)).toBe(0);
    await page.screenshot({path:`${process.env.TEMP || '/tmp'}/resume-${theme}-contrast-${width}.png`});
  });
}

for (const surface of SURFACES) {
  for (const theme of themes) for (const width of [375, 1440]) {
    test(`${surface.name} meets WCAG AA ${theme} text contrast at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openWithTheme(page, surface.url, theme);
      const failures = await page.evaluate(AUDIT);
      expect(failures.length, explainFailures(`${surface.name} ${theme} ${width}px`, failures)).toBe(0);
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

for (const theme of themes) for (const width of [375, 1440]) {
  test(`secondary concierge panels and text fields meet WCAG AA in ${theme} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWithTheme(page, `${base}/concierge?uiFixture=subscriber`, theme);

    const panels = ['#needsYouOverlay', '#jobsOverlay', '#vaultOverlay', '#interviewOverlay', '#agentAccessOverlay'];
    const allFailures = [];
    for (const panel of panels) {
      await page.locator(panel).evaluate(element => element.classList.add('open'));
      await expect(page.locator(panel)).toHaveClass(/open/);
      const failures = await page.evaluate(AUDIT);
      allFailures.push(...failures.map(failure => ({ ...failure, where: `${panel} ${failure.where}` })));
      if (panel === '#jobsOverlay') {
        await page.locator('#jobsOverlay .job-card-grid').first().evaluate(element => {
          element.innerHTML = '<div class="jobs-empty">No matching jobs yet. Unavailable jobs are excluded.</div>';
        });
        const emptyFailures = await page.evaluate(AUDIT);
        allFailures.push(...emptyFailures.map(failure => ({ ...failure, where: `#jobsOverlay empty ${failure.where}` })));
      }
      await page.locator(panel).evaluate(element => element.classList.remove('open'));
    }

    await page.locator('#guidedLaunchOverlay').evaluate(element => element.classList.add('open'));
    await expect(page.locator('#guidedLaunchOverlay')).toHaveClass(/open/);
    const onboardingFailures = await page.evaluate(AUDIT);
    allFailures.push(...onboardingFailures.map(failure => ({ ...failure, where: `#guidedLaunchOverlay ${failure.where}` })));
    await page.locator('#guidedLaunchOverlay').evaluate(element => element.classList.remove('open'));

    for (const panel of ['#questionOverlay', '#packageReviewOverlay']) {
      await page.locator(panel).evaluate(element => element.classList.add('open'));
      const failures = await page.evaluate(AUDIT);
      allFailures.push(...failures.map(failure => ({ ...failure, where: `${panel} ${failure.where}` })));
      await page.locator(panel).evaluate(element => element.classList.remove('open'));
    }

    expect(allFailures.length, explainFailures(`all secondary panels ${theme} ${width}px`, allFailures)).toBe(0);
  });
}
