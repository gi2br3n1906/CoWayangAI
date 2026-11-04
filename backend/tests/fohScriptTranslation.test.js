'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { translateScriptCue } = require('../lib/fohScriptTranslation');

test('translates the exact selected script text without accepting model-rewritten Javanese', async () => {
 const calls = [];
 const generateContent = async request => {
  calls.push(request);
  return { text: JSON.stringify({ jawa: 'replaced', indonesia: 'Wahai anakku', inggris: 'Oh my child' }) };
 };
 assert.equal(typeof translateScriptCue, 'function');
 const text = 'Dhuh kulup putraningsun\nSireh iku wus wanci';
 const result = await translateScriptCue({ text, kind: 'ada-ada', model: 'fixture-model', generateContent });
 assert.deepEqual(result, { jawa: text, indonesia: 'Wahai anakku', inggris: 'Oh my child' });
 assert.equal(calls.length, 1);
 assert.equal(calls[0].model, 'fixture-model');
 const prompt = JSON.stringify(calls[0].contents);
 assert.ok(prompt.includes('Dhuh kulup putraningsun'));
 assert.ok(prompt.includes('ada-ada'));
 assert.ok(!prompt.includes('inlineData'));
});

test('refuses invalid or incomplete provider output instead of publishing invented fallback', async () => {
 for (const output of ['not-json', JSON.stringify({ indonesia: 'Halo' }), JSON.stringify({ indonesia: 2, inggris: 'hello' })]) {
  await assert.rejects(() => translateScriptCue({ text: 'Sugeng', kind: 'dialog', model: 'fixture', generateContent: async () => ({ text: output }) }));
 }
});

test('does not send empty or oversized source text to the provider', async () => {
 let called = false;
 const generateContent = async () => { called = true; return { text: '{}' }; };
 for (const text of ['', '   ', 'x'.repeat(10001)]) {
  await assert.rejects(() => translateScriptCue({ text, kind: 'dialog', model: 'fixture', generateContent }));
 }
 assert.equal(called, false);
});
