import assert from 'node:assert/strict';
import { notifyNewApplicationNeedsYouAction } from '../lib/application-needs-you-notifier.js';

const events = [];
const enqueued = [];
const config = { marker: 'synthetic-config' };
const subject = 'fixture@example.test';
const newSession = { state: 'Waiting for You', actions: [{ id: 'action_extension_blocked_0001', status: 'open' }] };

let result = await notifyNewApplicationNeedsYouAction({
  config, subject, session: newSession,
  enqueue: async input => { enqueued.push(input); return { status: 'queued' }; },
  recordEvent: async event => { events.push(event); },
});
assert.equal(result.status, 'queued');
assert.equal(result.actionId, 'action_extension_blocked_0001');
assert.equal(enqueued[0].subject, subject);
assert.equal(enqueued[0].actionId, 'action_extension_blocked_0001');
assert.equal(enqueued[0].marker, 'synthetic-config');
assert.deepEqual(events, ['needs_you_notification_queued']);

result = await notifyNewApplicationNeedsYouAction({
  config, subject, session: newSession, previousSession: newSession,
  enqueue: async () => { throw new Error('must not enqueue an existing action'); },
  recordEvent: async event => { events.push(event); },
});
assert.deepEqual(result, { status: 'not-needed', actionId: null });

result = await notifyNewApplicationNeedsYouAction({
  config, subject, session: { state: 'Preparing', actions: newSession.actions },
  enqueue: async () => { throw new Error('must not enqueue outside Needs You'); },
  recordEvent: async event => { events.push(event); },
});
assert.deepEqual(result, { status: 'not-needed', actionId: null });

result = await notifyNewApplicationNeedsYouAction({
  config, subject, session: { state: 'Waiting for You', actions: [{ id: 'action_extension_partial_0002', status: 'open' }] },
  enqueue: async () => { throw new Error('synthetic outbox failure'); },
  recordEvent: async event => { events.push(event); },
});
assert.equal(result.status, 'failed');
assert.equal(result.actionId, 'action_extension_partial_0002');
assert.equal(events.at(-1), 'needs_you_notification_failure');

console.log('Shared application Needs You notification selection, dedupe, queue metric, and non-blocking failure tests passed.');
