const test = require('node:test');
const assert = require('node:assert/strict');
const { selectCandidates, transition } = require('../lib/fohScriptMatcher');

const index = { id: 'script', revision: 1, cues: [
  { id: 'a', order: 1, act: 1, kind: 'dialog', text: '  Sumber\nAsli  ', page: 1 },
  { id: 'b', order: 2, act: 1, kind: 'sulukan', text: 'Suluk', page: 2 },
  { id: 'c', order: 3, act: 2, kind: 'dialog', text: 'Next', page: 3 },
  { id: 'd', order: 4, act: 3, kind: 'dialog', text: 'Later', page: 4 },
] };

test('automatic candidates stay in the current act away from its boundary', () => {
  const candidates = selectCandidates({ index, cursor: { scriptId: 'script', scriptRevision: 1, revision: 0, cueId: 'a', act: 1 }, config: { boundarySize: 1, lookAhead: 3, lookBehind: 0, nextActSize: 1 } });
  assert.deepEqual(candidates.map(c => c.id), ['a', 'b']);
  assert.equal(candidates[0].text, '  Sumber\nAsli  ');
});

test('boundary permits only initial next-act cues, never past or more distant acts', () => {
  const config = { boundarySize: 1, lookAhead: 5, lookBehind: 9, nextActSize: 1 };
  const cursor = { scriptId: 'script', scriptRevision: 1, revision: 0, cueId: 'b', act: 1 };
  assert.deepEqual(selectCandidates({ index, cursor, config }).map(c => c.id), ['a', 'b', 'c']);
  assert.deepEqual(selectCandidates({ index, cursor: { ...cursor, cueId: 'c', act: 2 }, config }).map(c => c.id), ['c', 'd']);
});

test('a sufficiently strong external vocal judgment can transition to next act', () => {
  const cursor = { scriptId: 'script', scriptRevision: 1, revision: 3, cueId: 'b', act: 1, mode: 'auto' };
  const result = transition({ index, cursor, expectedRevision: 3, evidence: 'vocal', judgments: [{ cueId: 'c', score: 0.9 }], config: { boundarySize: 1, lookAhead: 2, lookBehind: 0, nextActSize: 1, minScore: 0.8, minMargin: 0.1 } });
  assert.equal(result.status, 'matched');
  assert.equal(result.cue.text, 'Next');
  assert.deepEqual(result.cursor, { ...cursor, cueId: 'c', act: 2, revision: 4 });
});

test('stale cursor or script revisions are rejected', () => {
  const cursor = { scriptId: 'script', scriptRevision: 1, revision: 3, cueId: 'b', act: 1, mode: 'auto' };
  const args = { index, cursor, expectedRevision: 2, evidence: 'vocal', judgments: [{ cueId: 'c', score: 1 }], config: { boundarySize: 1, lookAhead: 2, lookBehind: 0, nextActSize: 1, minScore: 0.8, minMargin: 0.1 } };
  assert.equal(transition(args).status, 'stale');
  assert.equal(transition({ ...args, expectedRevision: 3, cursor: { ...cursor, scriptRevision: 0 } }).status, 'stale');
});

test('explicit manual override jumps and rewinds, invalidating old revisions', () => {
  const cursor = { scriptId: 'script', scriptRevision: 1, revision: 3, cueId: 'a', act: 1, mode: 'auto' };
  const jumped = transition({ index, cursor, expectedRevision: 3, manualCueId: 'd' });
  assert.equal(jumped.status, 'manual');
  assert.deepEqual(jumped.cursor, { ...cursor, cueId: 'd', act: 3, revision: 4, mode: 'manual' });
  const back = transition({ index, cursor: jumped.cursor, expectedRevision: 4, manualCueId: 'a' });
  assert.equal(back.cue.text, '  Sumber\nAsli  ');
  assert.equal(back.cursor.act, 1);
  assert.equal(transition({ index, cursor: back.cursor, expectedRevision: 3, manualCueId: 'd' }).status, 'stale');
});

test('manual mode pauses automatic results and can be resumed with a revision change', () => {
  const cursor = { scriptId: 'script', scriptRevision: 1, revision: 4, cueId: 'b', act: 1, mode: 'manual' };
  const config = { boundarySize: 1, lookAhead: 2, lookBehind: 0, nextActSize: 1, minScore: 0.8, minMargin: 0.1 };
  const args = { index, cursor, expectedRevision: 4, evidence: 'vocal', judgments: [{ cueId: 'c', score: 1 }], config };
  assert.equal(transition(args).status, 'no_match');
  const resumed = transition({ index, cursor, expectedRevision: 4, setMode: 'auto' });
  assert.equal(resumed.cursor.revision, 5);
  assert.equal(resumed.cursor.mode, 'auto');
  assert.equal(transition({ ...args, cursor: resumed.cursor }).status, 'stale');
});

test('unsafe or ambiguous evidence abstains, including duplicate and malformed judgments', () => {
  const cursor = { scriptId: 'script', scriptRevision: 1, revision: 2, cueId: 'b', act: 1, mode: 'auto' };
  const config = { boundarySize: 1, lookAhead: 2, lookBehind: 1, nextActSize: 1, minScore: 0.8, minMargin: 0.1 };
  const args = { index, cursor, expectedRevision: 2, evidence: 'vocal', config };
  for (const input of [
    { evidence: 'silence', judgments: [{ cueId: 'c', score: 1 }] },
    { evidence: 'instrumental', judgments: [{ cueId: 'c', score: 1 }] },
    { judgments: [{ cueId: 'b', score: 0.9 }, { cueId: 'c', score: 0.9 }] },
    { judgments: [{ cueId: 'c', score: 0.7 }] },
    { judgments: [{ cueId: 'd', score: 1 }] },
    { judgments: [{ cueId: 'c', score: NaN }] },
    { judgments: [{ cueId: 'c', score: 1 }, { cueId: 'c', score: 0 }] },
  ]) assert.equal(transition({ ...args, ...input }).status, 'no_match');
  assert.equal(transition({ ...args, config: { ...config, minMargin: 0 }, judgments: [{ cueId: 'b', score: 1 }, { cueId: 'c', score: 1 }] }).status, 'no_match');
});

test('invalid windows, index ordering, stale selectors and cursor state fail closed', () => {
  const cursor = { scriptId: 'script', scriptRevision: 1, revision: 0, cueId: 'b', act: 1, mode: 'auto' };
  const config = { boundarySize: 1, lookAhead: 2, lookBehind: 0, nextActSize: 1, minScore: 0.8, minMargin: 0.1 };
  assert.throws(() => selectCandidates({ index, cursor: { ...cursor, scriptRevision: 0 }, config }));
  assert.throws(() => selectCandidates({ index, cursor: { ...cursor, cueId: 'missing' }, config }));
  assert.throws(() => selectCandidates({ index, cursor, config: { ...config, lookBehind: -1 } }));
  assert.throws(() => selectCandidates({ index: { ...index, cues: [...index.cues].reverse() }, cursor, config }));
  assert.throws(() => transition({ index, cursor, expectedRevision: 0, evidence: 'vocal', judgments: [{ cueId: 'c', score: 1 }], config: { ...config, minScore: undefined } }));
});
