'use strict';

const { validateScriptIndex } = require('./fohScriptIndex');
const { selectCandidates, transition } = require('./fohScriptMatcher');
const { matchScriptAudio } = require('./fohScriptAudioMatch');
const { translateScriptCue } = require('./fohScriptTranslation');

// Preview only: this function never persists a cursor or publishes subtitles.
async function previewScriptAudio({ index, cursor, config, bytes, mimeType, model, generateContent, signal }) {
    if (!validateScriptIndex(index).valid) throw new TypeError('Invalid script index');
    const candidates = selectCandidates({ index, cursor, config });
    if (cursor.mode !== 'auto') return { status: 'manual', cursor };
    const match = await matchScriptAudio({ bytes, mimeType, candidates, model, generateContent, signal });
    const result = transition({ index, cursor, expectedRevision: cursor.revision, config, ...match });
    if (result.status !== 'matched') return result;
    const subtitle = await translateScriptCue({ text: result.cue.text, kind: result.cue.kind, model, generateContent, signal });
    return { ...result, subtitle };
}

module.exports = { previewScriptAudio };
