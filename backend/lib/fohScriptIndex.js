const KINDS = new Set(['dialog', 'sulukan', 'ada-ada', 'janturan', 'pocapan', 'other']);

function validateScriptIndex(index, pages) {
 const errors = [];
 const fail = (path, message) => errors.push({ path, message });
 if (!index || typeof index !== 'object' || Array.isArray(index)) return { valid: false, errors: [{ path: 'index', message: 'must be an object' }] };
 for (const field of ['id', 'revision']) if (typeof index[field] !== 'string' || !index[field].trim()) fail(field, 'must be a nonempty string');
 if (!Array.isArray(index.cues) || !index.cues.length) fail('cues', 'must be a nonempty array');
 if (Array.isArray(index.cues) && index.cues.length > 2000) return { valid: false, errors: [{ path: 'cues', message: 'at most 2000 cues are supported' }] };
 if (Array.isArray(index.cues) && index.cues.reduce((n, cue) => n + (Array.isArray(cue?.spans) ? cue.spans.length : 0), 0) > 4000) return { valid: false, errors: [{ path: 'cues', message: 'at most 4000 source spans are supported' }] };
 const ids = new Set();
 let previousAct = 0, previousPage = 0;
 const usedRanges = new Map();
 for (const [i, cue] of (Array.isArray(index.cues) ? index.cues : []).entries()) {
  const path = `cues[${i}]`;
  if (!cue || typeof cue !== 'object' || Array.isArray(cue)) { fail(path, 'must be an object'); continue; }
  if (typeof cue.id !== 'string' || !cue.id.trim()) fail(`${path}.id`, 'must be a nonempty string');
  else if (ids.has(cue.id)) fail(`${path}.id`, 'duplicate id');
  else ids.add(cue.id);
  if (cue.order !== i + 1) fail(`${path}.order`, 'must be contiguous and 1-based');
  if (!Number.isSafeInteger(cue.act) || cue.act < 1 || cue.act < previousAct || (previousAct && cue.act > previousAct + 1) || (!previousAct && cue.act !== 1)) fail(`${path}.act`, 'must be an ordered 1-based act without gaps');
  else previousAct = cue.act;
  if (!KINDS.has(cue.kind)) fail(`${path}.kind`, 'unknown kind');
  if (typeof cue.text !== 'string' || !cue.text.trim()) fail(`${path}.text`, 'must be nonempty');
  if (!Number.isSafeInteger(cue.page) || cue.page < 1 || cue.page < previousPage) fail(`${path}.page`, 'must be a nondecreasing 1-based page');
  else previousPage = cue.page;
  if (cue.spans !== undefined) {
   if (!Array.isArray(cue.spans) || !cue.spans.length) fail(`${path}.spans`, 'must be a nonempty array');
   else {
    let text = '', lastPage = 0, lastEnd = 0;
    for (const [j, span] of cue.spans.entries()) {
     const p = `${path}.spans[${j}]`;
     if (!span || !Number.isSafeInteger(span.page) || span.page < 1 || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start || span.page < lastPage || (span.page === lastPage && span.start < lastEnd) || (j === 0 && span.page !== cue.page)) { fail(p, 'invalid or unordered span'); continue; }
     lastPage = span.page; lastEnd = span.end;
     const ranges = usedRanges.get(span.page) || [];
     ranges.push({ start: span.start, end: span.end, path: p }); usedRanges.set(span.page, ranges);
     if (pages !== undefined) {
      if (!pages || typeof pages[span.page] !== 'string' || span.end > pages[span.page].length) fail(p, 'source range missing or out of bounds');
      else text += pages[span.page].slice(span.start, span.end);
     }
    }
    if (pages !== undefined && text !== cue.text) fail(`${path}.text`, 'does not equal exact source spans');
   }
  } else if (pages !== undefined && typeof cue.text === 'string') {
   if (!pages || typeof pages[cue.page] !== 'string') fail(`${path}.page`, 'source page missing');
   else if (!pages[cue.page].includes(cue.text)) fail(`${path}.text`, 'not an exact substring of source page');
  }
 }
 for (const ranges of usedRanges.values()) {
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  let previousEnd = -1;
  for (const range of ranges) {
   if (range.start < previousEnd) fail(range.path, 'overlaps another source span');
   previousEnd = Math.max(previousEnd, range.end);
  }
 }
 return { valid: !errors.length, errors };
}

// A draft is deliberately not a playable index: paragraph boundaries and acts
// cannot be inferred reliably from PDF text. Offsets use JS UTF-16 indices.
function createReviewDraft({ id, revision, pages }) {
 if (typeof id !== 'string' || !id.trim() || typeof revision !== 'string' || !revision.trim() || !Array.isArray(pages) || pages.some(p => typeof p !== 'string')) throw new TypeError('id, revision and string pages are required');
 const blocks = [];
 for (const [i, page] of pages.entries()) {
  const chunks = page.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) || [];
  let start = 0;
  for (const text of chunks) {
   if (!text) continue;
   const signals = [];
   for (const [kind, pattern] of [['sulukan', /\bsuluk(?:an)?\b/i], ['ada-ada', /\bada[ -]ada\b/i], ['janturan', /\bjanturan\b/i], ['pocapan', /\bpocapan\b/i]]) if (pattern.test(text)) signals.push(kind);
   blocks.push({ page: i + 1, start, end: start + text.length, text, signals, classification: 'unclassified', reviewRequired: true });
   start += text.length;
  }
 }
 return { id, revision, cues: [], reviewRequired: true, blocks };
}

module.exports = { validateScriptIndex, createReviewDraft };
