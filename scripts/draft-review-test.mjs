import assert from 'node:assert/strict';
import { createDraftAutosave, createRevisionWriter, draftReviewGuidance } from '../client/draft-review.js';

let value = { resumeText: 'original', coverLetterText: '' };
let release;
const writes = [], states = [];
const editor = createDraftAutosave({
  initial: value, read: () => ({ ...value }), delay: 10,
  save: async snapshot => { writes.push(snapshot); if (writes.length === 1) await new Promise(resolve => { release = resolve; }); },
  onState: state => states.push(state),
});
value = { ...value, resumeText: 'first edit' };
const pending = editor.flush();
value = { ...value, resumeText: 'new edit during save' };
editor.schedule();
release();
assert.equal(await pending, true);
assert.deepEqual(writes.map(item => item.resumeText), ['first edit', 'new edit during save']);
assert.equal(editor.dirty(), false);
await editor.flush();
assert.equal(writes.length, 2, 'unchanged documents do not create revisions');
editor.dispose();

let failed = true, attempts = 0;
const recovery = createDraftAutosave({ initial: { resumeText: 'old' }, read: () => ({ resumeText: 'kept edit' }),
  save: async () => { attempts++; if (failed) throw new Error('offline'); }, onState: () => {}, delay: 10 });
assert.equal(await recovery.flush(), false);
assert.equal(recovery.dirty(), true, 'failure never marks edits saved');
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(attempts, 1, 'failed saves never loop automatically');
failed = false;
assert.equal(await recovery.flush(), true);
assert.equal(recovery.dirty(), false);
recovery.dispose();
let revertedText = 'original', rejectSave = true;
const reverted = createDraftAutosave({ initial: { resumeText: revertedText }, read: () => ({ resumeText: revertedText }),
  save: async () => { if (rejectSave) throw new Error('Response lost'); }, onState: () => {} });
revertedText = 'new';
assert.equal(await reverted.flush(), false);
revertedText = 'original';
assert.equal(reverted.dirty(), true, 'reverting text cannot hide an unresolved server save');
rejectSave = false;
assert.equal(await reverted.flush(), true);
reverted.dispose();
let currentRole = { packageRunId: 'base' }, submissions = [], reads = 0;
const revisionWriter = createRevisionWriter({
  getRole: () => currentRole,
  submit: async (base, snapshot) => {
    submissions.push({ base: base.packageRunId, ...snapshot });
    return submissions.length === 1 ? { id: 'pending', status: 'Searching' }
      : { id: 'second', status: 'Finished', result: { resumeText: snapshot.resumeText } };
  },
  readRun: async id => { reads++; assert.equal(id, 'pending'); return { id, status: 'Waiting for You', result: { resumeText: 'edit one' } }; },
  apply: run => { currentRole = { packageRunId: run.id }; },
});
await assert.rejects(revisionWriter({ resumeText: 'edit one' }));
assert.equal(currentRole.packageRunId, 'base', 'pending revision cannot replace a usable base');
await revisionWriter({ resumeText: 'edit two' });
assert.equal(reads, 1);
assert.deepEqual(submissions.map(item => item.base), ['base', 'pending']);
let lostResponse = true;
const replays = [];
const replayWriter = createRevisionWriter({ getRole: () => ({ packageRunId: 'original' }),
  submit: async (base, snapshot) => { replays.push({ ...base, ...snapshot }); if (lostResponse) { lostResponse = false; throw new Error('timeout'); } return { id: 'saved', status: 'Finished', result: { resumeText: snapshot.resumeText } }; },
  readRun: () => { throw new Error('No acknowledged run to read'); }, apply: () => {},
});
await assert.rejects(replayWriter({ resumeText: 'same edit' }));
await replayWriter({ resumeText: 'same edit' });
assert.deepEqual(replays[0], replays[1], 'a lost response replays the exact base and edits');
assert.match(draftReviewGuidance({ atsIssues: ['UNMAPPED_OUTPUT_CLAIM'] }).join(' '), /original resume/);
assert.equal(draftReviewGuidance({ atsIssues: ['UNRECOGNIZED_PRIVATE_CODE'] }).some(text => text.includes('UNRECOGNIZED')), false);
assert.match(draftReviewGuidance({ atsIssues: [] }).join(' '), /Review/);
console.log('Draft review: serial saves, in-flight edits, no-op saves, failure recovery, plain-language guidance passed.');
