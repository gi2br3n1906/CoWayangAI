'use strict';

const crypto = require('node:crypto');
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{2,47}$/;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_CONTEXT_LENGTH = 2000;
const SILENCE_RMS_THRESHOLD = 0.002;
const OUTPUT_LANGUAGES = ['jawa', 'indonesia', 'inggris'];
const OUTPUT_SUFFIXES = { jawa: 'jawa', indonesia: 'indo', inggris: 'inggris' };

function createFohBroadcaster({ io, googleGenAi, env = process.env, now = Date.now, randomBytes = crypto.randomBytes, logger = console, authenticate, store }) {
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
    const streamFromRecord = record => ({
        streamKey: record.streamKey,
        ownerUid: record.ownerUid,
        updatedAt: record.subtitle?.updatedAt || 0,
        jawa: record.subtitle?.jawa || '',
        indonesia: record.subtitle?.indonesia || '',
        inggris: record.subtitle?.inggris || '',
        uploadTokenHash: record.uploadTokenHash || null,
        clients: new Set(),
        processing: false,
        outputAliases: new Map(Object.values(record.outputs || {}).map(output => [output.streamKey, output.language])),
    });
    const hydrateStream = record => {
        const existing = streams.get(record.streamKey);
        if (!existing) {
            const created = streamFromRecord(record);
            streams.set(record.streamKey, created);
            return created;
        }
        Object.assign(existing, {
            ownerUid: record.ownerUid,
            updatedAt: record.subtitle?.updatedAt || 0,
            jawa: record.subtitle?.jawa || '',
            indonesia: record.subtitle?.indonesia || '',
            inggris: record.subtitle?.inggris || '',
            uploadTokenHash: record.uploadTokenHash || null,
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
            stream = { streamKey: key, updatedAt: 0, jawa: '', indonesia: '', inggris: '', uploadTokenHash: null, clients: new Set(), processing: false, outputAliases: new Map() };
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
    const payloadFor = (stream, streamKey = stream.streamKey, language = null) => ({
        streamKey,
        updatedAt: stream.updatedAt,
        jawa: !language || language === 'jawa' ? stream.jawa : '',
        indonesia: !language || language === 'indonesia' ? stream.indonesia : '',
        inggris: !language || language === 'inggris' ? stream.inggris : '',
    });
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
    const transcribe = async ({ bytes, mimeType, context }) => {
        const { apiKey, model } = getConfig();
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
            return res.json({ streamKey: key, uploadToken, outputPath: `/foh-output/${key}`, jsonPath: `/api/foh-stream/${key}/latest`, ssePath: `/api/foh-stream/${key}/sse`, outputs });
        });
        app.get('/api/foh-streams', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            try {
                const records = await getStore().listByOwner(claims.uid);
                return res.json({ streams: records.map(record => ({ streamKey: record.streamKey, status: record.status, outputs: record.outputs, updatedAt: record.updatedAt, subtitle: record.subtitle })) });
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
                return res.json({ streamKey: key, uploadToken, outputPath: `/foh-output/${key}`, jsonPath: `/api/foh-stream/${key}/latest`, ssePath: `/api/foh-stream/${key}/sse`, outputs: record.outputs, status: record.status });
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
                const endedAt = now();
                if (!await getStore().end(stream.streamKey, claims.uid, endedAt)) return error(res, 401, 'Invalid stream credentials');
                stream.uploadTokenHash = null;
                stream.updatedAt = endedAt;
                stream.jawa = ''; stream.indonesia = ''; stream.inggris = '';
                publish(stream);
                return res.json({ ok: true });
            } catch { return error(res, 503, 'FOH storage unavailable'); }
            finally { release(); }
        });
        app.post('/api/foh-stream/:streamKey/audio', async (req, res) => {
            const claims = await verifyRequest(req);
            if (!claims) return error(res, 401, 'Authentication required');
            const stream = streams.get(req.params.streamKey) || await resolveOwnedStream(req.params.streamKey, claims.uid);
            const uploadToken = req.get('x-foh-token');
            if (!stream || stream.ownerUid !== claims.uid || !validKey(req.params.streamKey) || !timingSafeEqual(tokenHash(uploadToken), stream.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
            const mimeType = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
            if (!['audio/webm', 'audio/ogg', 'audio/wav'].includes(mimeType)) return error(res, 415, 'Unsupported audio format');
            const bytes = req.body;
            if (!Buffer.isBuffer(bytes) || bytes.length < 128 || bytes.length > MAX_AUDIO_BYTES) return error(res, 400, 'Audio chunk must be between 128 bytes and 8 MB');
            const previous = stream.processing || Promise.resolve();
            let release;
            stream.processing = new Promise(resolve => { release = resolve; });
            await previous;
            if (!timingSafeEqual(tokenHash(uploadToken), stream.uploadTokenHash || '')) { release(); return error(res, 401, 'Invalid stream credentials'); }
            const context = String(req.get('x-foh-context') || '').slice(0, MAX_CONTEXT_LENGTH);
            const clientRms = Number(req.get('x-foh-rms'));
            const receivedAt = Date.now();
            logger.log('[FOH] Audio chunk received', { streamKey: req.params.streamKey, mimeType, bytes: bytes.length, clientRms: Number.isFinite(clientRms) ? clientRms : null });
            try {
                if ((Number.isFinite(clientRms) && clientRms < SILENCE_RMS_THRESHOLD) || (mimeType === 'audio/wav' && !wavHasSignal(bytes))) {
                    const subtitle = { jawa: '', indonesia: '', inggris: '' };
                    stream.updatedAt = now(); stream.jawa = ''; stream.indonesia = ''; stream.inggris = '';
                    try { await getStore().updateSubtitle(stream.streamKey, subtitle, stream.updatedAt); }
                    catch { release(); return error(res, 503, 'FOH storage unavailable'); }
                    publish(stream);
                    logger.log('[FOH] Silent chunk skipped Gemini', { streamKey: req.params.streamKey, latencyMs: Date.now() - receivedAt });
                    return res.json({ ok: true, updatedAt: stream.updatedAt, silent: true, subtitle });
                }
                logger.log('[FOH] Gemini request started', { streamKey: req.params.streamKey });
                const subtitle = await transcribe({ bytes, mimeType, context });
                let current;
                try { current = await getStore().getOwnedStream(stream.streamKey, claims.uid); }
                catch { return error(res, 503, 'FOH storage unavailable'); }
                if (!current || !timingSafeEqual(tokenHash(uploadToken), current.uploadTokenHash || '')) return error(res, 401, 'Invalid stream credentials');
                stream.uploadTokenHash = current.uploadTokenHash;
                stream.updatedAt = now();
                stream.jawa = subtitle.jawa;
                stream.indonesia = subtitle.indonesia;
                stream.inggris = subtitle.inggris;
                try { await getStore().updateSubtitle(stream.streamKey, subtitle, stream.updatedAt); }
                catch { return error(res, 503, 'FOH storage unavailable'); }
                publish(stream);
                logger.log('[FOH] Gemini request completed', { streamKey: req.params.streamKey, latencyMs: Date.now() - receivedAt, fieldLengths: { jawa: subtitle.jawa.length, indonesia: subtitle.indonesia.length, inggris: subtitle.inggris.length } });
                return res.json({ ok: true, updatedAt: stream.updatedAt, subtitle });
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
            return res.json(output ? payloadFor(output.stream, output.streamKey, output.language) : { streamKey: req.params.streamKey, updatedAt: 0, jawa: '', indonesia: '', inggris: '' });
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
