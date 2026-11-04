const test = require('node:test');
const assert = require('node:assert/strict');
const { validateScriptIndex, createReviewDraft } = require('../lib/fohScriptIndex');

test('accepts ordered, source-exact synthetic cues', () => {
 const index = { id: 'synthetic', revision: '1', cues: [
  { id: 'a', order: 1, act: 1, kind: 'sulukan', text: 'Laras siji\nlaras loro', page: 1 },
  { id: 'b', order: 2, act: 1, kind: 'ada-ada', text: 'Swara', page: 2 },
 ] };
 assert.deepEqual(validateScriptIndex(index, { 1: 'Laras siji\nlaras loro', 2: 'Swara' }), { valid: true, errors: [] });
});

test('rejects duplicate IDs, gaps, unreviewed acts, metadata and altered source', () => {
 const index = { id: 'fixture', revision: 'r1', cues: [
  { id: 'x', order: 1, act: 1, kind: 'dialog', text: 'A: Halo B: Ya', page: 1 },
  { id: 'x', order: 3, act: null, kind: 'metadata', text: 'changed', page: 2 },
 ] };
 const result = validateScriptIndex(index, { 1: 'A: Halo B: Ya', 2: 'original' });
 assert.equal(result.valid, false);
 for (const field of ['id', 'order', 'act', 'kind', 'text']) assert.ok(result.errors.some(e => e.path === `cues[1].${field}`), field);
});

test('validates exact ordered source spans across page boundaries', () => {
 const index = { id: 'fixture', revision: 'r1', cues: [{ id: 'cross', order: 1, act: 1, kind: 'janturan', page: 1, text: 'First\ncontinued', spans: [ { page: 1, start: 0, end: 6 }, { page: 2, start: 0, end: 9 } ] }] };
 assert.equal(validateScriptIndex(index, { 1: 'First\n', 2: 'continued' }).valid, true);
 index.cues[0].text = 'First\nmodified';
 assert.equal(validateScriptIndex(index, { 1: 'First\n', 2: 'continued' }).valid, false);
});

test('rejects duplicate source ranges across cues', () => {
 const cue = { order: 1, id: 'a', act: 1, kind: 'dialog', page: 1, text: 'Hello', spans: [{ page: 1, start: 0, end: 5 }] };
 const index = { id: 'fixture', revision: '1', cues: [cue, { ...cue, id: 'b', order: 2 }] };
 assert.equal(validateScriptIndex(index, { 1: 'Hello' }).valid, false);
});

test('bounds total cue and span counts before validating an index', () => {
 const cues = Array.from({length:2001}, (_,i) => ({id:`c${i}`,order:i+1,act:1,kind:'dialog',page:1,text:'x',spans:[{page:1,start:i,end:i+1}]}));
 const result=validateScriptIndex({id:'fixture',revision:'1',cues});
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(e=>e.path==='cues'));
});

test('rejects overlapping ranges even when cue spans are not ordered by offset', () => {
 const cues=[
  {id:'a',order:1,act:1,kind:'dialog',page:1,text:'x',spans:[{page:1,start:8,end:12}]},
  {id:'b',order:2,act:1,kind:'dialog',page:1,text:'y',spans:[{page:1,start:0,end:10}]},
 ];
 assert.equal(validateScriptIndex({id:'fixture',revision:'1',cues}).valid,false);
});

test('draft preserves all page text and flags ambiguous cue boundaries for review', () => {
 const pages = ['Judul\n\nSULUKAN\nlaras siji\nlaras loro\nA: halo B: ya\n', 'B\ntutugan\nADA-ADA\nlaras'];
 const draft = createReviewDraft({ id: 'fixture', revision: 'r1', pages });
 assert.equal(draft.reviewRequired, true);
 assert.deepEqual(draft.cues, []);
 for (let p = 0; p < pages.length; p++) assert.equal(draft.blocks.filter(b => b.page === p + 1).map(b => b.text).join(''), pages[p]);
 assert.ok(draft.blocks.some(b => b.signals.includes('sulukan')));
 assert.ok(draft.blocks.some(b => b.signals.includes('ada-ada')));
 assert.ok(draft.blocks.every(b => b.reviewRequired));
});
