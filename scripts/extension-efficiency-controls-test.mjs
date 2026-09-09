import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../1ststep-extension/background.js', import.meta.url), 'utf8');
const store = {};
const menus = [];
const badges = [];
const titles = [];
const opened = [];
const injected = [];
let installedListener = null;
let contextClickListener = null;
let messageListener = null;

const capturedJob = {
  jobTitle: 'Strategic Sourcing Lead',
  company: 'Fixture Company',
  jobDescription: 'Lead supplier negotiations and sourcing strategy. '.repeat(8),
  applyUrl: 'https://jobs.fixture.test/roles/123',
  site: 'jobs.fixture.test',
  captureMethod: 'structured-job-posting',
};

const chrome = {
  runtime: {
    onMessage: { addListener(fn) { messageListener = fn; } },
    onInstalled: { addListener(fn) { installedListener = fn; } },
    lastError: null,
  },
  storage: {
    local: {
      async get(keys) { return Object.fromEntries([].concat(keys).filter(key => key in store).map(key => [key, structuredClone(store[key])])); },
      async set(values) { Object.assign(store, structuredClone(values)); },
    },
    session: {
      async get(keys) { return Object.fromEntries([].concat(keys).filter(key => key in store).map(key => [key, structuredClone(store[key])])); },
      async set(values) { Object.assign(store, structuredClone(values)); },
    },
  },
  scripting: {
    async executeScript(options) {
      injected.push(structuredClone(options));
      return [{ frameId: 0, result: structuredClone(capturedJob) }];
    },
  },
  tabs: {
    async query(query) {
      if (query?.active) return [{ id: 42, url: capturedJob.applyUrl }];
      return [];
    },
    async create(options) { opened.push(structuredClone(options)); },
    async update() {},
    sendMessage() {},
  },
  action: {
    async setBadgeText(options) { badges.push(structuredClone(options)); },
    async setBadgeBackgroundColor() {},
    async setTitle(options) { titles.push(structuredClone(options)); },
  },
  contextMenus: {
    removeAll(callback) { menus.length = 0; callback?.(); },
    create(options) { menus.push(structuredClone(options)); },
    onClicked: { addListener(fn) { contextClickListener = fn; } },
  },
};

const sandbox = {
  chrome,
  crypto: { randomUUID: () => 'capture-efficiency-test' },
  console,
  Date,
  URL,
  Promise,
  Object,
  String,
  Number,
  structuredClone,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'background.js' });

assert.ok(installedListener && contextClickListener && messageListener);
installedListener({ reason: 'update' });
assert.deepEqual(menus.map(menu => menu.id), ['firststep-capture-resume', 'firststep-capture-agent']);
assert.ok(menus.every(menu => menu.contexts.includes('page') && menu.contexts.includes('selection')));

contextClickListener({ menuItemId: 'firststep-capture-agent' }, { id: 42, url: capturedJob.applyUrl });
await new Promise(resolve => setImmediate(() => setImmediate(resolve)));

assert.deepEqual(injected[0], { target: { tabId: 42, allFrames: true }, files: ['generic-capture.js'] });
assert.deepEqual(badges.at(-1), { tabId: 42, text: 'JOB' });
assert.match(titles.at(-1).title, /Strategic Sourcing Lead/);
assert.match(opened.at(-1).url, /^https:\/\/app\.1ststep\.ai\/concierge\?jobCaptureId=capture-efficiency-test&mode=jobAgent$/);
assert.equal(store.pendingJobs['capture-efficiency-test'].jobData.jobTitle, capturedJob.jobTitle);
assert.equal(store.pendingJobs['capture-efficiency-test'].mode, 'jobAgent');

const capturedByPopup = await new Promise(resolve => {
  messageListener({ action: 'CAPTURE_ACTIVE_TAB' }, { url: 'chrome-extension://fixture/popup.html' }, resolve);
});
assert.equal(capturedByPopup.success, true);
assert.equal(capturedByPopup.job.captureMethod, 'structured-job-posting');

console.log('Context-menu and popup capture share one explicit active-tab path, set a visible JOB badge, and route the selected job to the requested 1stStep workflow.');
