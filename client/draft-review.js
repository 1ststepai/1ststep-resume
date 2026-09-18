export function draftReviewGuidance(draft = {}) {
  const messages = (draft.atsIssues || []).map(issue => {
    if (/UNMAPPED|SOURCE_MAP|UNSUPPORTED|CLAIM|FACT/.test(issue)) return 'Compare claims with your original resume. Correct anything that adds experience, skills, or results you cannot support.';
    if (/TABLE|TAB|FORMAT|ORDER|LAYOUT/.test(issue)) return 'Keep the layout simple. Use clear headings and ordinary paragraphs so employers can read your resume easily.';
    if (/LENGTH|SHORT|EMPTY/.test(issue)) return 'Check that your relevant experience and contact details are included.';
    return 'This draft needs a closer review. Check the wording and details before using it.';
  });
  return [...new Set(messages.length ? messages : ['Review your contact details, experience, dates, and skills. Keep only statements that are true for you.'])];
}

// A lost response replays the same idempotent revision. An acknowledged pending
// revision is read back before another edit is submitted against a new version.
export function createRevisionWriter({ getRole, submit, readRun, apply }) {
  let pending = null;
  async function settle() {
    const run = pending.runId ? await readRun(pending.runId) : await submit(pending.base, pending.snapshot);
    if (run?.id) pending.runId = run.id;
    if (!run?.result?.resumeText || !['Finished', 'Waiting for You'].includes(run.status)) throw new Error('Revision is not ready.');
    apply(run);
    const snapshot = pending.snapshot;
    pending = null;
    return snapshot;
  }
  return async snapshot => {
    if (pending) {
      const completed = await settle();
      if (JSON.stringify(completed) === JSON.stringify(snapshot)) return;
    }
    pending = { base: getRole(), snapshot: { ...snapshot }, runId: '' };
    await settle();
  };
}

// Hold unsaved edits in the open page only. Persist through the existing private
// revision endpoint, one request at a time; never retry a failure in a loop.
export function createDraftAutosave({ initial, read, save, onState, delay = 1400 }) {
  let saved = JSON.stringify(initial), timer, running, disposed = false, unsettled = false;
  const dirty = () => unsettled || JSON.stringify(read()) !== saved;
  async function flush() {
    clearTimeout(timer);
    if (running) return running;
    if (disposed) return !dirty();
    running = (async () => {
      while (!disposed && dirty()) {
        const snapshot = read();
        unsettled = true;
        onState('saving');
        try { await save(snapshot); }
        catch { onState('error'); return false; }
        saved = JSON.stringify(snapshot);
        unsettled = false;
      }
      if (!disposed) onState('saved');
      return !dirty();
    })();
    try { return await running; } finally { running = null; }
  }
  return {
    dirty, flush,
    schedule() {
      clearTimeout(timer);
      if (disposed) return;
      onState(dirty() ? 'pending' : 'saved');
      if (dirty() && !running) timer = setTimeout(flush, delay);
    },
    dispose() { disposed = true; clearTimeout(timer); },
  };
}
