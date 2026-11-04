'use strict';

// Pure policy only: no audio detection, persistence, or publication. All configuration
// is required and uncalibrated; scores are externally supplied [0,1], not probabilities.
// index: {id, revision, cues:[{id, order, act, kind, text, page}]}, in order.
// cursor: {scriptId, scriptRevision, revision, act, cueId, mode:'auto'|'manual'}.
// Windows are cue counts: lookBehind/lookAhead include offsets around cursor;
// boundarySize counts current-act cues including cursor; nextActSize is a prefix.
// transition requires expectedRevision, plus either manualCueId, setMode, or
// evidence:'vocal' and judgments:[{cueId, score}]. It returns {status, cursor,
// cue?}; status is stale, no_match, matched, manual, or mode_changed. Invalid
// state/config throws. Unlisted candidates are not treated as competing matches.
// Caller must atomically recheck revisions when persisting/publishing the result;
// this in-memory comparison cannot protect against concurrent state changes.
function validateIndexCursor(index, cursor) {
  if (!index || typeof index.id !== 'string' || !index.id || index.revision == null || !Array.isArray(index.cues) || !cursor || !Number.isSafeInteger(cursor.revision) || cursor.revision < 0 || !Number.isSafeInteger(cursor.act) || cursor.act < 1 || (cursor.mode !== undefined && !['auto', 'manual'].includes(cursor.mode))) throw new Error('Invalid index or cursor');
  if (cursor.scriptId !== index.id || cursor.scriptRevision !== index.revision) throw new Error('Stale script');
  let order = -Infinity, act = 0;
  const ids = new Set();
  for (const cue of index.cues) {
    if (!cue || typeof cue.id !== 'string' || !cue.id || ids.has(cue.id) || !Number.isSafeInteger(cue.order) || cue.order <= order || !Number.isSafeInteger(cue.act) || cue.act < 1 || cue.act < act || typeof cue.text !== 'string') throw new Error('Invalid cue index');
    ids.add(cue.id); order = cue.order; act = cue.act;
  }
  if (!index.cues.some(c => c.id === cursor.cueId && c.act === cursor.act)) throw new Error('Invalid cursor cue');
}
function validateWindows(config) {
  if (!config || ['lookBehind', 'lookAhead', 'boundarySize', 'nextActSize'].some(k => !Number.isSafeInteger(config[k]) || config[k] < 0)) throw new Error('Invalid candidate windows');
}

function selectCandidates({ index, cursor, config }) {
  validateIndexCursor(index, cursor);
  validateWindows(config);
  const current = index.cues.filter(c => c.act === cursor.act);
  const position = current.findIndex(c => c.id === cursor.cueId);
  const result = current.slice(Math.max(0, position - config.lookBehind), position + config.lookAhead + 1);
  if (current.length - position <= config.boundarySize) {
    result.push(...index.cues.filter(c => c.act === cursor.act + 1).slice(0, config.nextActSize));
  }
  return result;
}

function transition({ index, cursor, expectedRevision, evidence, judgments, config, manualCueId, setMode }) {
  if (!index || !cursor) throw new Error('Invalid index or cursor');
  if (expectedRevision !== cursor.revision || cursor.scriptId !== index.id || cursor.scriptRevision !== index.revision) return { status: 'stale', cursor };
  validateIndexCursor(index, cursor);
  if (manualCueId !== undefined) {
    const cue = index.cues.find(c => c.id === manualCueId);
    if (!cue) throw new Error('Unknown manual cue');
    return { status: 'manual', cue, cursor: { ...cursor, cueId: cue.id, act: cue.act, mode: 'manual', revision: cursor.revision + 1 } };
  }
  if (setMode !== undefined) {
    if (!['auto', 'manual'].includes(setMode)) throw new Error('Invalid mode');
    return { status: 'mode_changed', cursor: { ...cursor, mode: setMode, revision: cursor.revision + 1 } };
  }
  if (cursor.mode !== 'auto') return { status: 'no_match', cursor };
  const eligible = selectCandidates({ index, cursor, config });
  if (['minScore', 'minMargin'].some(k => !Number.isFinite(config[k]) || config[k] < 0 || config[k] > 1)) throw new Error('Invalid score thresholds');
  if (!Array.isArray(judgments) || judgments.some(j => !j || typeof j.cueId !== 'string' || !Number.isFinite(j.score) || j.score < 0 || j.score > 1) || new Set(judgments.map(j => j.cueId)).size !== judgments.length) return { status: 'no_match', cursor };
  const ranked = judgments.filter(j => eligible.some(c => c.id === j.cueId)).sort((a, b) => b.score - a.score);
  if (evidence !== 'vocal' || !ranked.length || ranked[0].score < config.minScore || (ranked[1] && (ranked[0].score === ranked[1].score || ranked[0].score - ranked[1].score < config.minMargin))) {
    return { status: 'no_match', cursor };
  }
  const cue = eligible.find(c => c.id === ranked[0].cueId);
  return { status: 'matched', cue, cursor: { ...cursor, cueId: cue.id, act: cue.act, revision: cursor.revision + 1 } };
}

module.exports = { selectCandidates, transition };
