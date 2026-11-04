'use strict';

const crypto = require('node:crypto');
const { previewScriptAudio } = require('./fohScriptPreview');
const { validateScriptIndex } = require('./fohScriptIndex');
const { selectCandidates, transition } = require('./fohScriptMatcher');
const { matchScriptAudio } = require('./fohScriptAudioMatch');
const { translateScriptCue } = require('./fohScriptTranslation');
const bundledScriptIndex = require('../data/naskah-bambang-sumantri-provisional.json');
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{2,47}$/;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_CONTEXT_LENGTH = 2000;
const SILENCE_RMS_THRESHOLD = 0.002;
const OUTPUT_LANGUAGES = ['jawa', 'indonesia', 'inggris'];
const ALLOWED_MODELS = new Set(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
const OUTPUT_SUFFIXES = { jawa: 'jawa', indonesia: 'indo', inggris: 'inggris' };
function createFohBroadcaster({ io, googleGenAi, env = process.env, now = Date.now, randomBytes = crypto.randomBytes, logger = console, authenticate, store, providerTimeoutMs }) {
    let lastNow = 0;
    const previewOwners = new Set();
    const clock = () => (lastNow = Math.max(lastNow, now()));
    const hasText = subtitle => OUTPUT_LANGUAGES.some(language => typeof subtitle[language] === 'string' && subtitle[language].trim());
    const historyItem = (subtitle, updatedAt) => ({ id: crypto.randomUUID(), updatedAt, ...Object.fromEntries(OUTPUT_LANGUAGES.map(language => [language, subtitle[language] || ''])) });
    const verifyRequest = async req => {
        if (typeof authenticate !== 'function') return null;
        const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
        if (!match) return null;
        let claims;
        try { claims = await authenticate(match[1]); }
        catch { throw Object.assign(new Error('Firebase authentication is unavailable'), { statusCode: 503 }); }
        return claims && typeof claims.uid === 'string' && claims.uid ? claims : null;
    };

    let durableStore = store;
    const getStore = () => {
        if (!durableStore) {
            const { getFirebaseAdminServices } = require('./firebaseAuth');
            const { createFirestoreFohStore } = require('./fohStore');
            durableStore = createFirestoreFohStore({ db: getFirebaseAdminServices().db });
        }
        return durableStore;
    };
    const tokenHash = token => crypto.createHash('sha256').update(String(token || '')).digest('hex');
    const scriptHash = index => crypto.createHash('sha256').update(JSON.stringify([index.id, index.revision, index.cues.map(cue => [cue.id, cue.order, cue.act, cue.kind, cue.text, cue.page])])).digest('hex');

    const streamFromRecord = record => ({
        streamKey: record.streamKey,
        ownerUid: record.ownerUid,
        updatedAt: record.subtitle?.updatedAt || 0,
        jawa: record.subtitle?.jawa || '',
        indonesia: record.subtitle?.indonesia || '',
        inggris: record.subtitle?.inggris || '',
        uploadTokenHash: record.uploadTokenHash || null,
        subtitleMode: record.subtitleMode || 'legacy', scriptCursor: record.scriptCursor || null, scriptIndex: record.scriptIndex || null,
        clients: new Set(),
        processing: false,
        history: record.status !== 'ended' && record.subtitle?.updatedAt > 0 && clock() - record.subtitle.updatedAt <= 12000 && record.subtitle.updatedAt <= clock() && hasText(record.subtitle) ? [historyItem(record.subtitle, record.subtitle.updatedAt)] : [],
        outputAliases: new Map(Object.values(record.outputs || {}).map(output => [output.streamKey, output.language])),
    });
    const hydrateStream = record => {
        const existing = streams.get(record.streamKey);
        if (!existing) {
            const created = streamFromRecord(record);
            streams.set(record.streamKey, created);
            return created;
        }
        if (!existing.ownerUid) existing.history = streamFromRecord(record).history;
        Object.assign(existing, {
            ownerUid: record.ownerUid,
            updatedAt: record.subtitle?.updatedAt || 0,
            jawa: record.subtitle?.jawa || '',
            indonesia: record.subtitle?.indonesia || '',
            inggris: record.subtitle?.inggris || '',
            uploadTokenHash: record.uploadTokenHash || null,
            subtitleMode: record.subtitleMode || 'legacy', scriptCursor: record.scriptCursor || null, scriptIndex: record.scriptIndex || null,
        });
        existing.outputAliases = new Map(Object.values(record.outputs || {}).map(output => [output.streamKey, output.language]));
        return existing;
    };
    const streams = new Map();
    const aliases = new Map();
    const registerAliases = stream => {
        for (const [key, language] of stream.outputAliases) {
            aliases.set(key, { parentKey: stream.streamKey, language });
            const placeholder = streams.get(key);
            if (placeholder && !placeholder.ownerUid && placeholder !== stream) {
                for (const client of placeholder.clients) {
                    client.language = language;
                    client.stream = stream;
                    stream.clients.add(client);
                }
                placeholder.clients.clear();
                streams.delete(key);
            }
        }
    };
    const getConfig = () => ({ apiKey: env.GEMINI_API_KEY || '', model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite' });
    const validKey = key => typeof key === 'string' && KEY_PATTERN.test(key);
    const timingSafeEqual = (left, right) => {
        const a = Buffer.from(String(left || ''));
        const b = Buffer.from(String(right || ''));
        return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
    };
    const getStream = key => {
        let stream = streams.get(key);
        if (!stream) {
            stream = { streamKey: key, updatedAt: 0, jawa: '', indonesia: '', inggris: '', uploadTokenHash: null, subtitleMode: 'legacy', scriptCursor: null, scriptIndex: null, clients: new Set(), processing: false, outputAliases: new Map(), history: [] };
            streams.set(key, stream);
        }
        return stream;
    };
    const outputKey = (streamKey, language) => {
        const suffix = OUTPUT_SUFFIXES[language];
        const plain = `${streamKey}-${suffix}`;
        if (plain.length <= 48) return plain;
        const digest = crypto.createHash('sha1').update(`${streamKey}:${language}`).digest('hex').slice(0, 6);
        const prefixLength = 48 - suffix.length - digest.length - 2;
        return `${streamKey.slice(0, prefixLength).replace(/-+$/, '')}-${digest}-${suffix}`;
    };
    const outputDescriptors = streamKey => Object.fromEntries(OUTPUT_LANGUAGES.map(language => {
        const key = outputKey(streamKey, language);
        return [language, { language, streamKey: key, outputPath: `/foh-output/${key}`, jsonPath: `/api/foh-stream/${key}/latest`, ssePath: `/api/foh-stream/${key}/sse` }];
    }));
    const resolveOutput = async key => {
        const stream = streams.get(key);
        if (stream) return { stream, language: null, streamKey: key };
        const alias = aliases.get(key);
        if (alias) {
            const parent = streams.get(alias.parentKey);
            if (parent) return { stream: parent, language: alias.language, streamKey: key };
        }
        const resolved = await getStore().getOutput(key);
        if (!resolved) {
            const alias = aliases.get(key);
            const parent = alias && streams.get(alias.parentKey);
            return parent ? { stream: parent, language: alias.language, streamKey: key } : null;
        }
        const parent = hydrateStream(resolved.record);
        registerAliases(parent);
        return { stream: parent, language: resolved.language, streamKey: resolved.streamKey };
    };
    const payloadFor = (stream, streamKey = stream.streamKey, language = null) => {
        const serverNow = clock();
        stream.history = (stream.history || []).filter(item => item.updatedAt <= serverNow && serverNow - item.updatedAt <= 12000);
        return {
        streamKey,
        updatedAt: stream.updatedAt,
        jawa: !language || language === 'jawa' ? stream.jawa : '',
        indonesia: !language || language === 'indonesia' ? stream.indonesia : '',
        inggris: !language || language === 'inggris' ? stream.inggris : '',
        serverNow,
        history: stream.history.map(item => language ? { id: item.id, updatedAt: item.updatedAt, [language]: item[language] } : { ...item }),
    }; };
    const publish = stream => {
        const payload = payloadFor(stream);
        io.to(`foh:${stream.streamKey}`).emit('foh-subtitle', payload);
        for (const [aliasKey, language] of stream.outputAliases) io.to(`foh:${aliasKey}`).emit('foh-subtitle', payloadFor(stream, aliasKey, language));
        for (const client of stream.clients) client.res.write(`data: ${JSON.stringify(payloadFor(stream, client.streamKey, client.language))}\n\n`);
    };
    const parseGeminiResponse = response => {
        const result = JSON.parse(response?.text || '');
        if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid Gemini response');
        const transcript = typeof result.transcript === 'string' ? result.transcript : result.jawa;
        return {
            jawa: typeof transcript === 'string' ? transcript.slice(0, 2000) : '',
            indonesia: typeof result.indonesia === 'string' ? result.indonesia.slice(0, 2000) : '',
            inggris: typeof result.inggris === 'string' ? result.inggris.slice(0, 2000) : '',
        };
    };
    const wavHasSignal = bytes => {
        if (!Buffer.isBuffer(bytes) || bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return true;
        let offset = 12; let dataStart = -1; let dataEnd = -1; let audioFormat = 0; let bitsPerSample = 0;
        while (offset + 8 <= bytes.length) {
            const chunkId = bytes.toString('ascii', offset, offset + 4); const chunkSize = bytes.readUInt32LE(offset + 4); const start = offset + 8; const end = Math.min(bytes.length, start + chunkSize);
            if (chunkId === 'fmt ' && end - start >= 16) { audioFormat = bytes.readUInt16LE(start); bitsPerSample = bytes.readUInt16LE(start + 14); }
            if (chunkId === 'data') { dataStart = start; dataEnd = end; break; }
            offset = start + chunkSize + (chunkSize % 2);
        }
        if (audioFormat !== 1 || bitsPerSample !== 16 || dataStart < 0 || dataEnd - dataStart < 2) return true;
        let sum = 0; let samples = 0;
        for (let index = dataStart; index + 1 < dataEnd; index += 2) { const sample = bytes.readInt16LE(index) / 32768; sum += sample * sample; samples++; }
        return samples === 0 || Math.sqrt(sum / samples) >= SILENCE_RMS_THRESHOLD;
    };
    const transcribe = async ({ bytes, mimeType, context, model = getConfig().model, signal }) => {
        const { apiKey } = getConfig();
        if (!apiKey) throw Object.assign(new Error('GEMINI_API_KEY is not configured on the backend'), { status: 503 });
        let sdk = googleGenAi;
        if (!sdk) {
            try { sdk = require('@google/genai'); }
            catch { throw Object.assign(new Error('Install @google/genai in the backend service'), { status: 503 }); }
        }
        const client = new sdk.GoogleGenAI({ apiKey });
        const response = await client.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [
                { inlineData: { mimeType, data: bytes.toString('base64') } },
                { text: `Transcribe any human spoken voice as the performer's dialogue in transcript. If the audio contains only gamelan, music, or instruments without human speech, return empty strings. Translate the spoken dialogue into Indonesian in indonesia and English in inggris. Preserve Javanese or other original speech in transcript. Use the context to resolve names and terms, but never invent dialogue. Context: ${context || '(none)'}` },
            ] }],
            config: {
                abortSignal: signal,
                thinkingConfig: { thinkingLevel: 'low' },
                responseMimeType: 'application/json',
                responseSchema: { type: 'OBJECT', properties: { transcript: { type: 'STRING' }, indonesia: { type: 'STRING' }, inggris: { type: 'STRING' } }, required: ['transcript', 'indonesia', 'inggris'] },
            },
        });
        return parseGeminiResponse(response);
    };
    const error = (res, status, message) => res.status(status).json({ error: message });
    const installSocket = io => {
        io.on('connection', socket => {
            socket.on('foh-subscribe', async data => {
                try {
                    const streamKey = data?.streamKey;
                    if (!validKey(streamKey)) return socket.emit('foh-error', { message: 'Invalid stream key' });
                    const output = await resolveOutput(streamKey);
                    socket.join(`foh:${streamKey}`);
                    if (output?.stream.updatedAt) socket.emit('foh-subtitle', payloadFor(output.stream, streamKey, output.language));
                } catch {
                    socket.emit('foh-error', { message: 'FOH output is temporarily unavailable' });
                }
            });
        });
    };
    const installRoutes = app => {
        app.post('/api/foh-stream/session', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            const { streamKey = '' } = req.body || {};
            const key = streamKey || `foh-${randomBytes(5).toString('hex')}`;
            if (!validKey(key)) return error(res, 400, 'Stream key must be 3-48 lowercase letters, digits, or hyphens');
            const outputs = outputDescriptors(key);
            const uploadToken = randomBytes(32).toString('hex');
            let record;
            try { record = await getStore().createOrResume({ streamKey: key, ownerUid: claims.uid, outputs, tokenHash: tokenHash(uploadToken), now: now() }); }
            catch (cause) { return error(res, cause.statusCode || 503, cause.statusCode ? cause.message : 'FOH storage unavailable'); }
            const stream = hydrateStream(record);
            registerAliases(stream);
            return res.json({ streamKey: key, uploadToken, outputPath: `/foh-output/${key}`, jsonPath: `/api/foh-stream/${key}/latest`, ssePath: `/api/foh-stream/${key}/sse`, outputs, scriptCursor: record.scriptCursor ?? null, subtitleMode: record.subtitleMode || 'legacy', scriptIndex: record.scriptIndex ?? null });
        });
        app.get('/api/foh-streams', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            try {
                const records = await getStore().listByOwner(claims.uid);
                return res.json({ streams: records.map(record => ({ streamKey: record.streamKey, status: record.status, outputs: record.outputs, updatedAt: record.updatedAt, subtitle: record.subtitle, scriptCursor: record.scriptCursor ?? null, subtitleMode: record.subtitleMode || 'legacy' })) });
            } catch { return error(res, 503, 'FOH storage unavailable'); }
        });
        app.post('/api/foh-stream/:streamKey/resume', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            const key = req.params.streamKey;
            if (!validKey(key)) return error(res, 400, 'Invalid stream key');
            const owned = await getStore().getOwnedStream(key, claims.uid);
            if (!owned) return error(res, 404, 'FOH stream not found');
            const uploadToken = randomBytes(32).toString('hex');
            try {
                const record = await getStore().createOrResume({ streamKey: key, ownerUid: claims.uid, outputs: owned.outputs, tokenHash: tokenHash(uploadToken), now: now() });
                const stream = hydrateStream(record);
                registerAliases(stream);
                return res.json({ streamKey: key, uploadToken, outputPath: `/foh-output/${key}`, jsonPath: `/api/foh-stream/${key}/latest`, ssePath: `/api/foh-stream/${key}/sse`, outputs: record.outputs, status: record.status, scriptCursor: record.scriptCursor ?? null, subtitleMode: record.subtitleMode || 'legacy', scriptIndex: record.scriptIndex ?? null });
            } catch (cause) { return error(res, cause.statusCode || 503, cause.statusCode ? cause.message : 'FOH storage unavailable'); }
        });
        app.delete('/api/foh-stream/:streamKey/session', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            const stream = streams.get(req.params.streamKey) || await resolveOwnedStream(req.params.streamKey, claims.uid);
            const uploadToken = req.get('x-foh-token') || '';
            if (!stream || stream.ownerUid !== claims.uid || !timingSafeEqual(tokenHash(uploadToken), stream.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
            const previous = stream.processing || Promise.resolve();
            let release;
            stream.processing = new Promise(resolve => { release = resolve; });
            await previous;
            try {
                if (!timingSafeEqual(tokenHash(uploadToken), stream.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
                const endedAt = clock();
                if (!await getStore().end(stream.streamKey, claims.uid, endedAt, tokenHash(uploadToken))) return error(res, 401, 'Invalid stream credentials');
                stream.uploadTokenHash = null;
                stream.updatedAt = endedAt;
                stream.jawa = ''; stream.indonesia = ''; stream.inggris = '';
                stream.history = [];
                publish(stream);
                return res.json({ ok: true });
            } catch { return error(res, 503, 'FOH storage unavailable'); }
            finally { release(); }
        });
        // Cursor state is private to the authenticated stream owner.
        app.get('/api/foh-stream/:streamKey/script-position', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            const key = req.params.streamKey, uploadToken = req.get('x-foh-token') || '';
            if (!validKey(key)) return error(res, 400, 'Invalid stream key');
            try {
                const current = await getStore().getOwnedStream(key, claims.uid);
                if (!current || current.status !== 'active' || !timingSafeEqual(tokenHash(uploadToken), current.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
                return res.json({ cursor: current.scriptCursor ?? null });
            } catch { return error(res, 503, 'FOH storage unavailable'); }
        });
        app.get('/api/foh-scripts', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            return res.json({ scripts: [{ id: bundledScriptIndex.id, revision: bundledScriptIndex.revision, title: 'Bambang Sumantri (provisional)', reviewRequired: true, cueCount: bundledScriptIndex.cues.length }] });
        });
        app.get('/api/foh-scripts/:scriptId', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            if (req.params.scriptId !== bundledScriptIndex.id) return error(res, 404, 'Script not found');
            return res.json(bundledScriptIndex);
        });
        app.post('/api/foh-stream/:streamKey/script-mode', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            const key = req.params.streamKey, uploadToken = req.get('x-foh-token') || '';
            if (!validKey(key)) return error(res, 400, 'Invalid stream key');
            let current;
            try { current = await getStore().getOwnedStream(key, claims.uid); } catch { return error(res, 503, 'FOH storage unavailable'); }
            if (!current || current.status !== 'active' || !timingSafeEqual(tokenHash(uploadToken), current.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
            const { mode, expectedRevision } = req.body || {};
            if (!['legacy', 'script'].includes(mode) || !Number.isSafeInteger(expectedRevision) || expectedRevision !== (current.scriptCursor?.revision ?? 0)) return error(res, 409, 'Position changed; reload the current cursor');
            const scriptIndex = current.scriptIndex || bundledScriptIndex;
            if (mode === 'script' && !validateScriptIndex(scriptIndex).valid) return error(res, 400, 'Invalid saved script index');

            const cursor = current.scriptCursor;
            if (mode === 'script' && (!cursor || cursor.scriptId !== scriptIndex.id || cursor.scriptRevision !== scriptIndex.revision)) return error(res, 409, 'Save a starting cue before enabling script mode');
            const expectedCursor = { scriptId: cursor?.scriptId ?? null, scriptRevision: cursor?.scriptRevision ?? null, cursorRevision: cursor?.revision ?? 0, mode: cursor?.mode ?? null };
            try {
                const saved = await getStore().updateState({ streamKey: key, ownerUid: claims.uid, tokenHash: tokenHash(uploadToken), expectedCursor, scriptIndex, subtitleMode: mode, now: clock() });
                if (!saved) return error(res, 409, 'Position or session changed');
            } catch { return error(res, 503, 'FOH storage unavailable'); }
            const stream = hydrateStream(await getStore().getOwnedStream(key, claims.uid));
            stream.subtitleMode = mode; stream.scriptIndex = scriptIndex;
            return res.json({ subtitleMode: mode, scriptIndex, scriptCursor: cursor });
        });
        // Manual cursor controls persist position but never publish subtitles.
        app.post('/api/foh-stream/:streamKey/script-position', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            const key = req.params.streamKey, uploadToken = req.get('x-foh-token') || '';
            if (!validKey(key)) return error(res, 400, 'Invalid stream key');
            let current;
            try { current = await getStore().getOwnedStream(key, claims.uid); }
            catch { return error(res, 503, 'FOH storage unavailable'); }
            if (!current || current.status !== 'active' || !timingSafeEqual(tokenHash(uploadToken), current.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
            const { index, expectedRevision, action, cueId, mode } = req.body || {};
            if (Buffer.byteLength(JSON.stringify(index ?? null), 'utf8') > 1024 * 1024 || !validateScriptIndex(index).valid || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !['seek', 'replace', 'mode'].includes(action) || (action === 'mode' && !['auto', 'manual'].includes(mode))) return error(res, 400, 'Invalid script position input');
            const scriptDigest = scriptHash(index);
            const previous = current.scriptCursor ?? null;
            if ((previous?.revision ?? 0) !== expectedRevision || (previous && action !== 'replace' && (previous.scriptId !== index.id || previous.scriptRevision !== index.revision || previous.scriptDigest !== scriptDigest))) return error(res, 409, 'Script or position changed');
            if (current.subtitleMode === 'script' && previous && (previous.scriptId !== index.id || previous.scriptRevision !== index.revision || previous.scriptDigest !== scriptDigest)) return error(res, 409, 'Disable script mode before replacing its index');
            let next;
            try {
                if (action === 'mode' && previous) {
                    const result = transition({ index, cursor: previous, expectedRevision, setMode: mode });
                    if (result.status !== 'mode_changed') return error(res, 409, 'Script or position changed');
                    next = { ...result.cursor, scriptDigest, offset: previous.offset || 0 };
                    delete next.updatedAt;
                } else if (!previous || action === 'replace') {
                    const cue = (action === 'seek' || (action === 'replace' && previous)) && index.cues.find(item => item.id === cueId);
                    if (!cue) return error(res, 400, 'Initial cue required');
                    next = { scriptId: index.id, scriptRevision: index.revision, scriptDigest, act: cue.act, cueId: cue.id, offset: 0, mode: 'manual', revision: (previous?.revision ?? 0) + 1 };
                } else {
                    const result = transition({ index, cursor: previous, expectedRevision, manualCueId: cueId });
                    if (result.status !== 'manual') return error(res, 409, 'Script or position changed');
                    next = { ...result.cursor, scriptDigest, mode: action === 'seek' ? 'manual' : result.cursor.mode, offset: 0 };
                    delete next.updatedAt;
                }
            } catch { return error(res, 400, 'Invalid script position input'); }
            const updatedAt = clock();
            const expectedCursor = { scriptId: previous?.scriptId ?? null, scriptRevision: previous?.scriptRevision ?? null, cursorRevision: previous?.revision ?? 0, mode: previous?.mode ?? null, subtitleMode: current.subtitleMode || 'legacy' };
            try {
                const saved = await getStore().updateState({ streamKey: key, ownerUid: claims.uid, tokenHash: tokenHash(uploadToken), expectedCursor, scriptCursor: next, scriptIndex: index, now: updatedAt });
                if (!saved) return error(res, 409, 'Session or position changed');
            } catch { return error(res, 503, 'FOH storage unavailable'); }
            return res.json({ cursor: { ...next, updatedAt } });
        });
        app.post('/api/foh-stream/:streamKey/subtitle-mode', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            const key = req.params.streamKey, uploadToken = req.get('x-foh-token') || '';
            if (!validKey(key)) return error(res, 400, 'Invalid stream key');
            let current;
            try { current = await getStore().getOwnedStream(key, claims.uid); } catch { return error(res, 503, 'FOH storage unavailable'); }
            if (!current || current.status !== 'active' || !timingSafeEqual(tokenHash(uploadToken), current.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
            const mode = req.body?.mode;
            if (!['legacy', 'script'].includes(mode)) return error(res, 400, 'Invalid subtitle mode');
            const cursor = current.scriptCursor;

            if (mode === 'script' && (!cursor || !current.scriptIndex || !validateScriptIndex(current.scriptIndex).valid || cursor.scriptId !== current.scriptIndex.id || cursor.scriptRevision !== current.scriptIndex.revision || cursor.scriptDigest !== scriptHash(current.scriptIndex))) return error(res, 409, 'Save a starting cue from a valid script before enabling script mode');
            const expectedCursor = { scriptId: cursor?.scriptId ?? null, scriptRevision: cursor?.scriptRevision ?? null, cursorRevision: cursor?.revision ?? 0, mode: cursor?.mode ?? null, subtitleMode: current.subtitleMode || 'legacy' };
            const updatedAt = clock();
            try {
                const nextCursor = mode === 'script' && cursor ? { ...cursor, mode: 'auto', revision: cursor.revision + 1 } : cursor;
                if (!await getStore().updateState({ streamKey: key, ownerUid: claims.uid, tokenHash: tokenHash(uploadToken), expectedCursor, ...(nextCursor !== cursor ? { scriptCursor: nextCursor } : {}), subtitleMode: mode, subtitle: { jawa: '', indonesia: '', inggris: '' }, now: updatedAt })) return error(res, 409, 'Script position or mode changed');
            } catch { return error(res, 503, 'FOH storage unavailable'); }
            const stream = hydrateStream(await getStore().getOwnedStream(key, claims.uid));
            stream.subtitleMode = mode;
            stream.jawa = ''; stream.indonesia = ''; stream.inggris = ''; stream.history = [];
            stream.updatedAt = updatedAt;
            publish(stream);
            return res.json({ subtitleMode: mode, scriptCursor: stream.scriptCursor });
        });
        // Explicit shadow preview: no cursor writes and no publication.
        app.post('/api/foh-stream/:streamKey/script-preview', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            const key = req.params.streamKey, uploadToken = req.get('x-foh-token') || '';
            if (!validKey(key)) return error(res, 400, 'Invalid stream key');
            let current;
            try { current = await getStore().getOwnedStream(key, claims.uid); }
            catch { return error(res, 503, 'FOH storage unavailable'); }
            if (!current || current.status !== 'active' || !timingSafeEqual(tokenHash(uploadToken), current.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
            const { index, cursor, config, audioBase64, mimeType, model } = req.body || {};
            if (previewOwners.has(claims.uid) || previewOwners.size >= 4) return error(res, 429, 'Script preview is busy');
            if (!ALLOWED_MODELS.has(model) || !['audio/webm', 'audio/ogg', 'audio/wav'].includes(mimeType) || typeof audioBase64 !== 'string' || audioBase64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 || audioBase64.length % 4 !== 0) return error(res, 400, 'Invalid preview input');
            const bytes = Buffer.from(audioBase64, 'base64');
            if (bytes.length < 128 || bytes.length > MAX_AUDIO_BYTES || bytes.toString('base64') !== audioBase64 || Buffer.byteLength(JSON.stringify(index ?? null), 'utf8') > 1024 * 1024 || !validateScriptIndex(index).valid) return error(res, 400, 'Invalid preview input');
            if (current.scriptCursor?.scriptId === index.id && current.scriptCursor?.scriptRevision === index.revision && current.scriptCursor?.scriptDigest !== scriptHash(index)) return error(res, 409, 'Script contents differ from saved position');
            if (!config || ['minScore', 'minMargin'].some(field => !Number.isFinite(config[field]) || config[field] < 0 || config[field] > 1)) return error(res, 400, 'Invalid score thresholds');
            try { selectCandidates({ index, cursor, config }); }
            catch { return error(res, 400, 'Invalid script cursor or candidate windows'); }
            const { apiKey } = getConfig();
            if (!apiKey) return error(res, 503, 'Gemini is not configured');
            let sdk = googleGenAi;
            if (!sdk) {
                try { sdk = require('@google/genai'); }
                catch { return error(res, 503, 'Gemini SDK is unavailable'); }
            }
            // These are per-process bounds, not a distributed rate or spend limit.
            const client = new sdk.GoogleGenAI({ apiKey });
            previewOwners.add(claims.uid);
            const controller = new AbortController();
            const assertActive = async () => {
                let record;
                try { record = await getStore().getOwnedStream(key, claims.uid); }
                catch { throw Object.assign(new Error('FOH storage unavailable'), { status: 503 }); }
                if (!record || record.status !== 'active' || !timingSafeEqual(tokenHash(uploadToken), record.uploadTokenHash || '')) throw Object.assign(new Error('Invalid stream credentials'), { status: 401 });
            };
            let timer, onClose;
            const cancelled = new Promise((_, reject) => {
                onClose = () => { controller.abort(); reject(Object.assign(new Error('Client disconnected'), { status: 499 })); };
                res.once('close', onClose);
                timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('Preview timed out'), { status: 504 })); }, providerTimeoutMs ?? (model === 'gemini-3.8-flash' ? 40000 : 9000));
            });
            try {
                const work = previewScriptAudio({ index, cursor, config, bytes, mimeType, model, generateContent: async request => { await assertActive(); if (controller.signal.aborted) throw Object.assign(new Error('Preview cancelled'), { status: 499 }); return client.models.generateContent(request); }, signal: controller.signal });
                // Do not free a slot merely because the client or timeout gave up;
                // the underlying SDK call may ignore cancellation and still incur cost.
                work.finally(() => previewOwners.delete(claims.uid)).catch(() => {});
                const result = await Promise.race([work, cancelled]);
                await assertActive();
                if (!res.destroyed) return res.json(result);
            } catch (cause) {
                if (!res.destroyed) return error(res, [401, 503, 504].includes(cause.status) ? cause.status : 502, cause.status === 504 ? 'Preview timed out' : cause.status === 401 ? 'Invalid stream credentials' : cause.status === 503 ? 'FOH storage unavailable' : 'Script preview failed');
            } finally { clearTimeout(timer); res.off('close', onClose); }
        });
        app.post('/api/foh-stream/:streamKey/audio', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            const stream = streams.get(req.params.streamKey) || await resolveOwnedStream(req.params.streamKey, claims.uid);
            const uploadToken = req.get('x-foh-token');
            if (!stream || stream.ownerUid !== claims.uid || !validKey(req.params.streamKey) || !timingSafeEqual(tokenHash(uploadToken), stream.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
            const requestedModel = req.get('x-foh-model');
            if (requestedModel !== undefined && !ALLOWED_MODELS.has(requestedModel)) return error(res, 400, 'Invalid FOH model');
            const model = requestedModel ?? getConfig().model;
            const mimeType = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
            if (!['audio/webm', 'audio/ogg', 'audio/wav'].includes(mimeType)) return error(res, 415, 'Unsupported audio format');
            const bytes = req.body;
            if (!Buffer.isBuffer(bytes) || bytes.length < 128 || bytes.length > MAX_AUDIO_BYTES) return error(res, 400, 'Audio chunk must be between 128 bytes and 8 MB');
            const previous = stream.processing || Promise.resolve();
            let release;
            stream.processing = new Promise(resolve => { release = resolve; });
            await previous;
            if (res.destroyed) { release(); return; }
            if (!timingSafeEqual(tokenHash(uploadToken), stream.uploadTokenHash || '')) { release(); return error(res, 401, 'Invalid stream credentials'); }
            const context = String(req.get('x-foh-context') || '').slice(0, MAX_CONTEXT_LENGTH);
            const clientRms = Number(req.get('x-foh-rms'));
            const receivedAt = Date.now();
            logger.log('[FOH] Audio chunk received', { streamKey: req.params.streamKey, mimeType, bytes: bytes.length, clientRms: Number.isFinite(clientRms) ? clientRms : null });
            try {
                let current;
                try { current = await getStore().getOwnedStream(stream.streamKey, claims.uid); }
                catch { return error(res, 503, 'FOH storage unavailable'); }
                if (!current || current.status !== 'active' || !timingSafeEqual(tokenHash(uploadToken), current.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
                const expectedCursor = { scriptId: current.scriptCursor?.scriptId ?? null, scriptRevision: current.scriptCursor?.scriptRevision ?? null, cursorRevision: current.scriptCursor?.revision ?? 0, mode: current.scriptCursor?.mode ?? null, subtitleMode: current.subtitleMode || 'legacy' };
                const persist = async (subtitle, updatedAt) => getStore().updateState({ streamKey: stream.streamKey, ownerUid: claims.uid, tokenHash: tokenHash(uploadToken), expectedCursor, subtitle, now: updatedAt });
                if ((Number.isFinite(clientRms) && clientRms < SILENCE_RMS_THRESHOLD) || (mimeType === 'audio/wav' && !wavHasSignal(bytes))) {
                    const subtitle = { jawa: '', indonesia: '', inggris: '' };
                    const updatedAt = clock();
                    try { if (!await persist(subtitle, updatedAt)) return error(res, 409, 'FOH session or cursor changed'); }
                    catch { return error(res, 503, 'FOH storage unavailable'); }
                    stream.updatedAt = updatedAt; stream.jawa = ''; stream.indonesia = ''; stream.inggris = '';
                    stream.history = [];
                    publish(stream);
                    logger.log('[FOH] Silent chunk skipped Gemini', { streamKey: req.params.streamKey, latencyMs: Date.now() - receivedAt });
                    return res.json({ ok: true, updatedAt: stream.updatedAt, silent: true, subtitle, model });
                }
                logger.log('[FOH] Gemini request started', { streamKey: req.params.streamKey });
                const controller = new AbortController();
                let timer, onClose;
                const cancelled = new Promise((_, reject) => {
                    onClose = () => { reject(Object.assign(new Error('Client disconnected'), { status: 499 })); controller.abort(); };
                    res.once('close', onClose);
                    timer = setTimeout(() => { reject(Object.assign(new Error('Gemini request timed out'), { status: 504 })); controller.abort(); }, providerTimeoutMs ?? (current.subtitleMode === 'script' ? 45000 : model === 'gemini-3.8-flash' ? 40000 : 9000));
                });
                let subtitle, nextCursor, scriptStatus;
                const work = (async () => {
                    if (current.subtitleMode !== 'script') return transcribe({ bytes, mimeType, context, model, signal: controller.signal });
                    const index = current.scriptIndex, cursor = current.scriptCursor;
                    if (!index || !cursor || cursor.scriptDigest !== scriptHash(index) || !validateScriptIndex(index).valid) throw Object.assign(new Error('Script index or cursor is unavailable'), { status: 409 });
                    if (cursor.mode === 'manual') { scriptStatus = 'manual'; return { jawa: '', indonesia: '', inggris: '' }; }
                    const config = { lookBehind: 1, lookAhead: 4, boundarySize: 3, nextActSize: 2, minScore: 0.72, minMargin: 0.18 };
                    const candidates = selectCandidates({ index, cursor, config });
                    const { apiKey } = getConfig();
                    if (!apiKey) throw Object.assign(new Error('Gemini is not configured'), { status: 503 });
                    let sdk = googleGenAi;
                    if (!sdk) { try { sdk = require('@google/genai'); } catch { throw Object.assign(new Error('Gemini SDK is unavailable'), { status: 503 }); } }
                    const client = new sdk.GoogleGenAI({ apiKey });
                    const generateContent = request => client.models.generateContent({ ...request, config: { ...request.config, abortSignal: controller.signal } });
                    const match = await matchScriptAudio({ bytes, mimeType, candidates, model, generateContent, signal: controller.signal });
                    const afterMatch = await getStore().getOwnedStream(stream.streamKey, claims.uid);
                    if (!afterMatch || afterMatch.subtitleMode !== 'script' || afterMatch.scriptCursor?.revision !== cursor.revision || afterMatch.scriptCursor?.mode !== 'auto' || afterMatch.scriptCursor?.scriptDigest !== cursor.scriptDigest) throw Object.assign(new Error('Script position or mode changed'), { status: 409 });
                    const decision = transition({ index, cursor, expectedRevision: cursor.revision, config, ...match });
                    scriptStatus = decision.status;
                    if (decision.status !== 'matched') return { jawa: '', indonesia: '', inggris: '' };
                    const translated = await translateScriptCue({ text: decision.cue.text, kind: decision.cue.kind, model, generateContent: async request => {
                        const latest = await getStore().getOwnedStream(stream.streamKey, claims.uid);
                        if (!latest || latest.subtitleMode !== 'script' || latest.scriptCursor?.revision !== cursor.revision || latest.scriptCursor?.mode !== 'auto' || latest.scriptCursor?.scriptDigest !== cursor.scriptDigest) throw Object.assign(new Error('Script position or mode changed'), { status: 409 });
                        return generateContent(request);
                    }, signal: controller.signal });
                    nextCursor = { ...decision.cursor, scriptDigest: cursor.scriptDigest, offset: cursor.offset || 0 };
                    return translated;
                })();
                try { subtitle = await Promise.race([work, cancelled]); }
                finally { clearTimeout(timer); res.off('close', onClose); }
                if (res.destroyed) return;
                const updatedAt = clock();
                try {
                    const saved = await getStore().updateState({ streamKey: stream.streamKey, ownerUid: claims.uid, tokenHash: tokenHash(uploadToken), expectedCursor, subtitle, ...(nextCursor ? { scriptCursor: nextCursor } : {}), now: updatedAt });
                    if (!saved) {
                        const latest = await getStore().getOwnedStream(stream.streamKey, claims.uid);
                        if (!latest || latest.status !== 'active' || !timingSafeEqual(tokenHash(uploadToken), latest.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
                        return error(res, 409, 'FOH session or cursor changed');
                    }
                }
                catch { return error(res, 503, 'FOH storage unavailable'); }
                stream.updatedAt = updatedAt;
                stream.jawa = subtitle.jawa;
                stream.indonesia = subtitle.indonesia;
                stream.inggris = subtitle.inggris;
                if (nextCursor) stream.scriptCursor = { ...nextCursor, updatedAt };
                if (hasText(subtitle)) stream.history = [...(stream.history || []), historyItem(subtitle, stream.updatedAt)].slice(-3);
                else stream.history = [];
                publish(stream);
                logger.log('[FOH] Gemini request completed', { streamKey: req.params.streamKey, latencyMs: Date.now() - receivedAt, fieldLengths: { jawa: subtitle.jawa.length, indonesia: subtitle.indonesia.length, inggris: subtitle.inggris.length } });
                return res.json({ ok: true, updatedAt: stream.updatedAt, subtitle, model, ...(scriptStatus ? { scriptStatus, scriptCursor: stream.scriptCursor } : {}) });
            } catch (cause) {
                logger.error('[FOH] Gemini transcription failed', {
                    status: cause?.status || 502,
                    name: cause?.name || 'Error',
                    message: String(cause?.message || 'Unknown error').slice(0, 300),
                    mimeType,
                    bytes: bytes.length,
                });
                return error(res, cause.status || 502, cause.status ? cause.message : 'Gemini transcription failed');
            }
            finally { release(); }
        });
        app.get('/api/foh-stream/:streamKey/latest', async (req, res) => {
            if (!validKey(req.params.streamKey)) return error(res, 400, 'Invalid stream key');
            const output = await resolveOutput(req.params.streamKey);
            return res.json(output ? payloadFor(output.stream, output.streamKey, output.language) : payloadFor({ streamKey: req.params.streamKey, updatedAt: 0, jawa: '', indonesia: '', inggris: '', history: [] }));
        });
        app.get('/api/foh-stream/:streamKey/sse', async (req, res) => {
            const key = req.params.streamKey;
            if (!validKey(key)) return error(res, 400, 'Invalid stream key');
            const output = await resolveOutput(key);
            const resolved = output || { stream: getStream(key), streamKey: key, language: null };
            const { stream } = resolved;
            res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
            res.flushHeaders?.();
            if (stream.updatedAt) res.write(`data: ${JSON.stringify(payloadFor(stream, key, resolved.language))}\n\n`);
            const client = { res, streamKey: key, language: resolved.language, stream };
            stream.clients.add(client);
            const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20000);
            res.on('close', () => { clearInterval(heartbeat); client.stream.clients.delete(client); });
        });
    };
    async function resolveOwnedStream(key, ownerUid) {
        if (!validKey(key)) return null;
        const record = await getStore().getOwnedStream(key, ownerUid);
        if (!record) return null;
        const stream = hydrateStream(record);
        registerAliases(stream);
        return stream;
    }

    return { installRoutes, installSocket, streams, validKey, transcribe, wavHasSignal, MAX_AUDIO_BYTES };
}

module.exports = { createFohBroadcaster, KEY_PATTERN, MAX_AUDIO_BYTES, MAX_CONTEXT_LENGTH, SILENCE_RMS_THRESHOLD };
