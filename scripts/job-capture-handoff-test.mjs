// Behavioural tests for the extension -> page job-capture handoff.
//
// These run the real background.js and auth-bridge.js inside sandboxes with a
// fake chrome API, wire the bridge's runtime messages to the real background
// listener, and drive the protocol end to end. They also run the real receiver
// listeners extracted from funnel.html and app.js.
//
// They are deliberately not regex checks over source. The properties being
// protected -- nothing is deleted before acknowledgement, a forged
// acknowledgement is ignored, a missing capture id is never accepted, an
// addition overlapping an acknowledgement loses neither -- are behavioural, and
// a source-text assertion cannot prove any of them.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const backgroundSource = await readFile(new URL('1ststep-extension/background.js', ROOT), 'utf8');
const bridgeSource = await readFile(new URL('1ststep-extension/auth-bridge.js', ROOT), 'utf8');
const funnelSource = await readFile(new URL('funnel.html', ROOT), 'utf8');
const appSource = await readFile(new URL('app.js', ROOT), 'utf8');

const ORIGIN = 'https://app.1ststep.ai';
const settle = () => new Promise(resolve => setImmediate(() => setImmediate(resolve)));

// ---------------------------------------------------------------------------
// Shared fake extension platform: one storage, the real background listener,
// and any number of pages whose bridges talk to it.

function createExtension({ pendingJobs = {} } = {}) {
  const store = { pendingJobs: structuredClone(pendingJobs) };
  let messageListener = null;

  const storageLocal = {
    async get(keys) {
      const out = {};
      for (const key of [].concat(keys)) if (key in store) out[key] = structuredClone(store[key]);
      return out;
    },
    async set(values) { Object.assign(store, structuredClone(values)); },
  };

  const chromeApi = {
    runtime: {
      onMessage: { addListener(fn) { messageListener = fn; } },
      onInstalled: { addListener() {} },
      lastError: null,
    },
    storage: { local: storageLocal, session: { async get() { return {}; }, async set() {} } },
    tabs: { async query() { return []; }, async create() {}, async update() {}, sendMessage() {} },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
  };

  const sandbox = {
    chrome: chromeApi,
    crypto: { randomUUID: () => `cap-${Math.random().toString(36).slice(2, 10)}` },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    console, Date, URLSearchParams, structuredClone, Promise, Object, String, Number,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(backgroundSource, sandbox, { filename: 'background.js' });
  assert.ok(messageListener, 'background.js must register a message listener');

  /** Calls the real background listener the way chrome.runtime.sendMessage does. */
  const sendToBackground = (request, sender = { url: `${ORIGIN}/funnel` }) =>
    new Promise(resolve => {
      const handled = messageListener(request, sender, resolve);
      if (!handled) resolve(undefined);
    });

  return { store, sendToBackground, sandbox };
}

/** Boots auth-bridge.js as a page bridge attached to the given extension. */
function attachBridge(ext, { search = '', senderUrl = `${ORIGIN}/funnel` } = {}) {
  const listeners = [];
  const posted = [];

  const windowStub = {
    location: { search, origin: ORIGIN, href: `${ORIGIN}/funnel${search}` },
    addEventListener(type, handler) { if (type === 'message') listeners.push(handler); },
    postMessage(data, targetOrigin) { posted.push({ data, targetOrigin }); },
  };
  windowStub.self = windowStub;

  const chromeApi = {
    runtime: {
      onMessage: { addListener() {} },
      sendMessage: request => ext.sendToBackground(request, { url: senderUrl }),
      lastError: null,
    },
    // get() only: a write attempt from the bridge throws instead of silently
    // racing the worker.
    storage: { local: { get: keys => ext.sandbox.chrome.storage.local.get(keys) } },
  };

  const sandbox = {
    window: windowStub, chrome: chromeApi, URLSearchParams, Date, console,
    fetch: async () => ({ ok: true, json: async () => ({}) }), structuredClone,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bridgeSource, sandbox, { filename: 'auth-bridge.js' });

  const send = (data, { source: src = windowStub, origin = ORIGIN } = {}) => {
    for (const handler of listeners) handler({ data, origin, source: src });
  };
  const captures = () => posted.filter(m => m.data.type === '1STSTEP_JOB_CAPTURE');

  return { send, posted, captures, windowStub };
}

const job = id => ({ jobData: { jobTitle: `Role ${id}`, company: `Co ${id}` }, mode: 'tailor', createdAt: Date.now() });

// ===========================================================================
// A. Bridge delivery and acknowledged consumption
// ===========================================================================

// A1. Delivered, and nothing deleted before acknowledgement.
{
  const ext = createExtension({ pendingJobs: { 'cap-1': job(1) } });
  const page = attachBridge(ext, { search: '?jobCaptureId=cap-1' });
  await settle();

  assert.equal(page.captures().length, 1, 'the capture must be delivered');
  assert.equal(page.captures()[0].data.captureId, 'cap-1');
  assert.equal(page.captures()[0].targetOrigin, ORIGIN, 'delivery must be origin-scoped');
  assert.ok(ext.store.pendingJobs['cap-1'], 'the capture must survive until acknowledged');
}

// A2. A matching acknowledgement deletes only the matching capture.
{
  const ext = createExtension({ pendingJobs: { 'cap-1': job(1), 'cap-2': job(2) } });
  const page = attachBridge(ext, { search: '?jobCaptureId=cap-1' });
  await settle();

  page.send({ type: '1STSTEP_JOB_CAPTURE_ACK', captureId: 'cap-1' });
  await settle();

  assert.equal(ext.store.pendingJobs['cap-1'], undefined, 'acknowledged capture must be removed');
  assert.ok(ext.store.pendingJobs['cap-2'], 'an unrelated pending capture must survive');
}

// A3. Wrong, forged and cross-frame acknowledgements are ignored.
{
  const ext = createExtension({ pendingJobs: { 'cap-1': job(1), 'cap-2': job(2) } });
  const page = attachBridge(ext, { search: '?jobCaptureId=cap-1' });
  await settle();

  page.send({ type: '1STSTEP_JOB_CAPTURE_ACK', captureId: 'cap-2' });
  page.send({ type: 'SOMETHING_ELSE', captureId: 'cap-1' });
  page.send({ type: '1STSTEP_JOB_CAPTURE_ACK', captureId: 'cap-1' }, { origin: 'https://evil.example' });
  page.send({ type: '1STSTEP_JOB_CAPTURE_ACK', captureId: 'cap-1' }, { source: { other: true } });
  page.send({ type: '1STSTEP_JOB_CAPTURE_ACK' });
  await settle();

  assert.ok(ext.store.pendingJobs['cap-1'], 'cap-1 must survive every invalid acknowledgement');
  assert.ok(ext.store.pendingJobs['cap-2'], 'cap-2 must survive an acknowledgement from the wrong page');
}

// A4. No capture id, or an unknown one, never delivers another job.
{
  const ext = createExtension({ pendingJobs: { 'cap-1': job(1), 'cap-2': job(2) } });
  const page = attachBridge(ext, { search: '' });
  await settle();
  assert.equal(page.captures().length, 0, 'no capture id must deliver nothing');
  assert.equal(Object.keys(ext.store.pendingJobs).length, 2, 'and must delete nothing');
}
{
  const ext = createExtension({ pendingJobs: { 'cap-1': job(1) } });
  const page = attachBridge(ext, { search: '?jobCaptureId=cap-missing' });
  await settle();
  assert.equal(page.captures().length, 0, 'an unknown capture id must not fall back to another job');
  assert.ok(ext.store.pendingJobs['cap-1']);
}

// A5. Retry serves exactly the capture named in the URL.
{
  const ext = createExtension({ pendingJobs: { 'cap-1': job(1), 'cap-2': job(2) } });
  const page = attachBridge(ext, { search: '?jobCaptureId=cap-1' });
  await settle();
  const before = page.posted.length;

  page.send({ type: '1STSTEP_JOB_CAPTURE_REQUEST', captureId: 'cap-1' });
  await settle();
  const again = page.posted.slice(before).filter(m => m.data.type === '1STSTEP_JOB_CAPTURE');
  assert.equal(again.length, 1, 'retry must re-deliver the capture');
  assert.equal(again[0].data.captureId, 'cap-1');

  const mark = page.posted.length;
  page.send({ type: '1STSTEP_JOB_CAPTURE_REQUEST', captureId: 'cap-2' });
  await settle();
  assert.equal(page.posted.slice(mark).length, 0, 'retry must not serve a capture this page does not own');
}

// A6. Repeated acknowledgement is harmless.
{
  const ext = createExtension({ pendingJobs: { 'cap-1': job(1) } });
  const page = attachBridge(ext, { search: '?jobCaptureId=cap-1' });
  await settle();
  page.send({ type: '1STSTEP_JOB_CAPTURE_ACK', captureId: 'cap-1' });
  await settle();
  page.send({ type: '1STSTEP_JOB_CAPTURE_ACK', captureId: 'cap-1' });
  await settle();
  assert.deepEqual(ext.store.pendingJobs, {}, 'a repeated acknowledgement must not throw or resurrect state');
}

// A7. An expired capture is not delivered.
{
  const stale = job(1);
  stale.createdAt = Date.now() - (3 * 60 * 1000);
  const ext = createExtension({ pendingJobs: { 'cap-1': stale } });
  const page = attachBridge(ext, { search: '?jobCaptureId=cap-1' });
  await settle();
  assert.equal(page.captures().length, 0, 'a capture past its expiry must not be delivered');
}

// ===========================================================================
// B. background.js is the sole writer, and its mutations serialize
// ===========================================================================

// B1. An addition overlapping an acknowledgement loses neither.
{
  const ext = createExtension({ pendingJobs: { 'cap-old': job('old') } });

  // Fire both without awaiting between them: with an unserialized
  // read-modify-write, each would read the same snapshot and the later write
  // would drop the other's change.
  const addition = ext.sendToBackground({
    action: 'OPEN_IN_APP',
    jobData: { jobTitle: 'Fresh role', company: 'Fresh co' },
    mode: 'tailor',
  });
  const acknowledgement = ext.sendToBackground({ action: 'CONSUME_JOB_CAPTURE', captureId: 'cap-old' });
  const [addResult] = await Promise.all([addition, acknowledgement]);
  await settle();

  const ids = Object.keys(ext.store.pendingJobs);
  assert.equal(ext.store.pendingJobs['cap-old'], undefined, 'the acknowledged capture must be gone');
  assert.equal(ids.length, 1, `the new capture must survive the overlapping acknowledgement, got ${ids.length}`);
  assert.ok(addResult.jobCaptureId, 'the addition must report its capture id');
  assert.ok(ext.store.pendingJobs[addResult.jobCaptureId], 'the new capture must be the surviving one');
}

// B2. Many overlapping additions all survive.
{
  const ext = createExtension();
  const results = await Promise.all([1, 2, 3, 4, 5].map(n => ext.sendToBackground({
    action: 'OPEN_IN_APP', jobData: { jobTitle: `Role ${n}` }, mode: 'tailor',
  })));
  await settle();
  assert.equal(Object.keys(ext.store.pendingJobs).length, 5, 'no concurrent addition may be dropped');
  for (const r of results) assert.ok(ext.store.pendingJobs[r.jobCaptureId]);
}

// B3. Consumption validates the exact id and refuses unknown ones.
{
  const ext = createExtension({ pendingJobs: { 'cap-1': job(1) } });
  assert.equal((await ext.sendToBackground({ action: 'CONSUME_JOB_CAPTURE', captureId: 'nope' })).consumed, false);
  assert.equal((await ext.sendToBackground({ action: 'CONSUME_JOB_CAPTURE', captureId: '' })).consumed, false);
  assert.equal((await ext.sendToBackground({ action: 'CONSUME_JOB_CAPTURE' })).consumed, false);
  assert.ok(ext.store.pendingJobs['cap-1'], 'invalid consumption must not delete anything');
  assert.equal((await ext.sendToBackground({ action: 'CONSUME_JOB_CAPTURE', captureId: 'cap-1' })).consumed, true);
  assert.equal(ext.store.pendingJobs['cap-1'], undefined);
}

// B4. Consumption is refused from anywhere but the app origin.
{
  const ext = createExtension({ pendingJobs: { 'cap-1': job(1) } });
  const response = await ext.sendToBackground(
    { action: 'CONSUME_JOB_CAPTURE', captureId: 'cap-1' },
    { url: 'https://evil.example/page' });
  assert.equal(response.success, false, 'a foreign sender must not consume a capture');
  assert.ok(ext.store.pendingJobs['cap-1'], 'and the capture must survive');
}

// ===========================================================================
// C. Receivers: exact identity and apply-once
// ===========================================================================

/** Extracts a source region and runs it against a permissive fake page. */
function runReceiver(source, { from, to, balanced = false, search }) {
  const start = source.indexOf(from);
  assert.ok(start !== -1, `receiver region start not found: ${from}`);

  let code;
  if (balanced) {
    // Walk to the end of the call expression so the extracted listener is a
    // complete statement. A fixed end marker cut app.js mid-body.
    let depth = 0;
    let seen = false;
    let i = start;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === '(') { depth++; seen = true; }
      else if (ch === ')') { depth--; if (seen && depth === 0) { i++; break; } }
    }
    while (i < source.length && source[i] !== ';') i++;
    code = source.slice(start, i + 1);
  } else {
    const end = to ? source.indexOf(to, start) : source.length;
    assert.ok(end !== -1, `receiver region end not found: ${to}`);
    code = source.slice(start, end);
  }

  const applied = [];
  const acks = [];
  const sessionData = new Map();
  const listeners = [];

  const windowStub = {
    location: { search, origin: ORIGIN, href: `${ORIGIN}/funnel${search}` },
    addEventListener(type, handler) { if (type === 'message') listeners.push(handler); },
    postMessage(data) { if (data && data.type === '1STSTEP_JOB_CAPTURE_ACK') acks.push(data.captureId); },
  };

  const elementStub = () => ({
    textContent: '', className: '', style: {}, value: '',
    appendChild() {}, addEventListener() {}, dispatchEvent() {}, querySelector: () => elementStub(),
  });

  const base = {
    window: windowStub,
    location: windowStub.location,
    document: {
      getElementById: () => elementStub(),
      createElement: () => elementStub(),
      querySelector: () => elementStub(),
      querySelectorAll: () => [],
    },
    sessionStorage: {
      getItem: k => (sessionData.has(k) ? sessionData.get(k) : null),
      setItem: (k, v) => sessionData.set(k, String(v)),
      removeItem: k => sessionData.delete(k),
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URLSearchParams, Date, console, JSON, Object, String, Number, Boolean, Array,
    setTimeout: () => 0, clearTimeout: () => {},
    applyJobCapture: jobData => { applied.push(jobData); },
  };

  // Unknown identifiers resolve to a harmless no-op so a receiver embedded in a
  // large file can run without stubbing every unrelated helper it touches.
  const noop = new Proxy(function () {}, {
    get: (t, p) => (p === Symbol.toPrimitive || p === 'toString' || p === Symbol.iterator ? () => '' : noop),
    apply: () => undefined,
  });
  const sandbox = new Proxy(base, {
    has: () => true,
    get: (t, p) => (p in t ? t[p] : noop),
    set: (t, p, v) => { t[p] = v; return true; },
  });

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'receiver' });

  const deliver = data => {
    for (const handler of listeners) handler({ data, origin: ORIGIN, source: windowStub });
  };
  return { deliver, applied, acks };
}

const FUNNEL_REGION = {
  from: "const CAPTURE_ID = new URLSearchParams(location.search).get('jobCaptureId')",
  to: '// Visible states for the capture.',
};
const APP_REGION = {
  from: "    window.addEventListener('message', (event) => {",
  balanced: true,
};

// C1. funnel: the same capture delivered twice applies once, acknowledges twice.
{
  const r = runReceiver(funnelSource, { ...FUNNEL_REGION, search: '?jobCaptureId=cap-1' });
  const payload = { type: '1STSTEP_JOB_CAPTURE', captureId: 'cap-1', jobData: { jobTitle: 'Role 1' } };
  r.deliver(payload);
  r.deliver(payload);
  assert.equal(r.applied.length, 1, `funnel must apply the capture once, applied ${r.applied.length}`);
  assert.equal(r.acks.length, 2, `funnel must acknowledge both deliveries, acked ${r.acks.length}`);
  assert.deepEqual(r.acks, ['cap-1', 'cap-1']);
}

// C2. funnel rejects a missing capture id, and a page with no id of its own.
{
  const r = runReceiver(funnelSource, { ...FUNNEL_REGION, search: '?jobCaptureId=cap-1' });
  r.deliver({ type: '1STSTEP_JOB_CAPTURE', jobData: { jobTitle: 'Role 1' } });
  r.deliver({ type: '1STSTEP_JOB_CAPTURE', captureId: '', jobData: { jobTitle: 'Role 1' } });
  r.deliver({ type: '1STSTEP_JOB_CAPTURE', captureId: 'other', jobData: { jobTitle: 'Role 1' } });
  assert.equal(r.applied.length, 0, 'funnel must reject a capture without a matching id');
  assert.equal(r.acks.length, 0, 'and must not acknowledge it');

  const noUrlId = runReceiver(funnelSource, { ...FUNNEL_REGION, search: '' });
  noUrlId.deliver({ type: '1STSTEP_JOB_CAPTURE', captureId: 'cap-1', jobData: { jobTitle: 'Role 1' } });
  assert.equal(noUrlId.applied.length, 0, 'a page opened without a capture id must accept nothing');
  assert.equal(noUrlId.acks.length, 0, 'and must acknowledge nothing');
}

// C3. app.js: the same capture delivered twice acknowledges twice, applies once.
{
  const r = runReceiver(appSource, { ...APP_REGION, search: '?jobCaptureId=cap-1' });
  const payload = { type: '1STSTEP_JOB_CAPTURE', captureId: 'cap-1', jobData: { jobTitle: 'Role 1' } };
  r.deliver(payload);
  assert.equal(r.acks.length, 1, 'app.js must acknowledge the first delivery');
  r.deliver(payload);
  assert.equal(r.acks.length, 2, `app.js must acknowledge both deliveries, acked ${r.acks.length}`);
}

// C4. app.js rejects a missing capture id.
{
  const r = runReceiver(appSource, { ...APP_REGION, search: '?jobCaptureId=cap-1' });
  r.deliver({ type: '1STSTEP_JOB_CAPTURE', jobData: { jobTitle: 'Role 1' } });
  r.deliver({ type: '1STSTEP_JOB_CAPTURE', captureId: '', jobData: { jobTitle: 'Role 1' } });
  r.deliver({ type: '1STSTEP_JOB_CAPTURE', captureId: 'other', jobData: { jobTitle: 'Role 1' } });
  assert.equal(r.acks.length, 0, 'app.js must not acknowledge a capture without a matching id');

  const noUrlId = runReceiver(appSource, { ...APP_REGION, search: '' });
  noUrlId.deliver({ type: '1STSTEP_JOB_CAPTURE', captureId: 'cap-1', jobData: { jobTitle: 'Role 1' } });
  assert.equal(noUrlId.acks.length, 0, 'a page opened without a capture id must accept nothing');
}

// ===========================================================================
// D. Visible states
// ===========================================================================
{
  const has = needle => assert.ok(funnelSource.includes(needle), `funnel.html must contain: ${needle}`);
  has("'Job saved'");
  has('We couldn’t load that job.');
  has("'Try again'");
  has('1STSTEP_JOB_CAPTURE_REQUEST');
  assert.ok(!funnelSource.includes('chrome.storage'), 'the page must never read extension storage directly');

  const listener = funnelSource.slice(funnelSource.indexOf("e.data.type !== '1STSTEP_JOB_CAPTURE'"));
  const ackAt = listener.indexOf('acknowledgeCapture(captureId)');
  const saveAt = listener.indexOf('applyJobCapture(jobData, resumeText, true)');
  assert.ok(saveAt !== -1 && ackAt !== -1 && saveAt < ackAt,
    'the page must save the capture before acknowledging it');

  const captureBlock = funnelSource.slice(funnelSource.indexOf('function showJobSaved'),
                                          funnelSource.indexOf('function startCaptureTimeout'));
  const visible = [...captureBlock.matchAll(/textContent = '([^']*)'/g)].map(m => m[1]);
  assert.ok(visible.length >= 3, `expected the capture states to set visible text, found ${visible.length}`);
  for (const copy of visible) {
    for (const term of ['captureId', 'storage', 'extension', 'bridge', 'chrome', 'API', 'JSON']) {
      assert.ok(!copy.toLowerCase().includes(term.toLowerCase()),
        `user-visible copy must not mention ${term}: ${copy}`);
    }
  }
}

console.log('Job capture handoff: exact identity in both receivers, delivery before deletion, background-owned serialized mutations, race-free overlapping add/acknowledge, forged-acknowledgement rejection, exact-capture retry, apply-once re-delivery, and visible success/failure states all verified.');
