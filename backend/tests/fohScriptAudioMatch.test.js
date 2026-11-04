'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchScriptAudio } = require('../lib/fohScriptAudioMatch');

const candidates = [
 { id: 's1', text: 'Kula nuwun', kind: 'dialog' },
 { id: 's2', text: 'Dhuh kulup', kind: 'sulukan' },
];
test('sends audio and only supplied candidates and returns bounded vocal judgments', async () => {
 const requests = [];
 assert.equal(typeof matchScriptAudio, 'function');
 const result = await matchScriptAudio({
  bytes: Buffer.from('fixture audio'), mimeType: 'audio/webm', candidates, model: 'test-model',
  generateContent: async req => { requests.push(req); return { text: JSON.stringify({ vocal: true, judgments: [{ cueId: 's1', score: 0.3 }, { cueId: 's2', score: 0.9 }] }) }; },
 });
 assert.deepEqual(result, { evidence: 'vocal', judgments: [{ cueId: 's1', score: 0.3 }, { cueId: 's2', score: 0.9 }] });
 assert.equal(requests.length, 1);
 assert.equal(requests[0].model, 'test-model');
 assert.equal(requests[0].contents[0].parts[0].inlineData.data, Buffer.from('fixture audio').toString('base64'));
 assert.match(JSON.stringify(requests[0].contents), /Dhuh kulup/);
});

test('silence, unknown cue, missing candidate, duplicates and malformed judgments abstain', async () => {
 const results = [
  { vocal: false, judgments: [{ cueId: 's1', score: 0.9 }, { cueId: 's2', score: 0.1 }] },
  { vocal: true, judgments: [{ cueId: 's1', score: 0.9 }, { cueId: 'other', score: 0.1 }] },
  { vocal: true, judgments: [{ cueId: 's1', score: 0.9 }] },
  { vocal: true, judgments: [{ cueId: 's1', score: 0.9 }, { cueId: 's1', score: 0.1 }] },
  { vocal: true, judgments: [{ cueId: 's1', score: 2 }, { cueId: 's2', score: 0.1 }] },
 ];
 for (const data of results) {
  const r = await matchScriptAudio({ bytes: Buffer.alloc(256), mimeType: 'audio/webm', candidates, model: 'test', generateContent: async () => ({ text: JSON.stringify(data) }) });
  assert.deepEqual(r, { evidence: 'unknown', judgments: [] });
 }
});

test('rejects oversized or unsupported input before using provider', async () => {
 let calls = 0; const generateContent = async () => { calls++; return { text: '{}' }; };
 for (const input of [{ bytes: Buffer.alloc(0), mimeType: 'audio/webm' }, { bytes: Buffer.alloc(256), mimeType: 'text/plain' }, { bytes: Buffer.alloc(256), mimeType: 'audio/webm', candidates: [] }]) {
  await assert.rejects(() => matchScriptAudio({ candidates, model: 'test', generateContent, ...input }));
 }
 assert.equal(calls, 0);
});
