const { cursorMatches, validCursor } = require('../../lib/fohStore');

function createTestFohStore() {
    const streams = new Map();
    const aliases = new Map();
    return {
        async createOrResume({ streamKey, ownerUid, outputs, tokenHash, now }) {
            const current = streams.get(streamKey);
            if (current && current.ownerUid !== ownerUid) throw Object.assign(new Error('Stream key is already in use'), { statusCode: 409 });
            const record = {
                streamKey, ownerUid, outputs, status: 'active', uploadTokenHash: tokenHash,
                createdAt: current?.createdAt || now, updatedAt: now,
                subtitle: current?.subtitle || { jawa: '', indonesia: '', inggris: '', updatedAt: 0 },
                scriptCursor: current?.scriptCursor ?? null,
                scriptIndex: current?.scriptIndex ?? null,
                subtitleMode: current?.subtitleMode ?? 'legacy',
            };
            streams.set(streamKey, record);
            Object.values(outputs).forEach(output => aliases.set(output.streamKey, { parentKey: streamKey, language: output.language }));
            return structuredClone(record);
        },
        async listByOwner(ownerUid) { return [...streams.values()].filter(record => record.ownerUid === ownerUid).map(record => structuredClone(record)); },
        async getOwnedStream(streamKey, ownerUid) {
            const record = streams.get(streamKey);
            return record?.ownerUid === ownerUid ? structuredClone(record) : null;
        },
        async getOutput(key) {
            const direct = streams.get(key);
            if (direct) return { record: structuredClone(direct), language: null, streamKey: key };
            const alias = aliases.get(key), record = alias && streams.get(alias.parentKey);
            return record ? { record: structuredClone(record), language: alias.language, streamKey: key } : null;
        },
        async updateState({ streamKey, ownerUid, tokenHash, expectedCursor, scriptCursor, scriptIndex, subtitle, subtitleMode, now }) {
            const record = streams.get(streamKey);
            if (!record || record.ownerUid !== ownerUid || record.status !== 'active' || !tokenHash || record.uploadTokenHash !== tokenHash || !cursorMatches(record.scriptCursor, expectedCursor, record.subtitleMode)) return false;
            if (scriptCursor !== undefined && !validCursor(scriptCursor, record.scriptCursor)) throw new TypeError('Invalid script cursor');
            if (subtitleMode !== undefined && !['legacy', 'script'].includes(subtitleMode)) throw new TypeError('Invalid subtitle mode');
            if (scriptCursor === undefined && scriptIndex === undefined && subtitle === undefined && subtitleMode === undefined) throw new TypeError('No state update supplied');
            if (subtitle !== undefined) record.subtitle = { ...subtitle, updatedAt: now };
            if (scriptCursor === null) record.scriptCursor = null;
            else if (scriptCursor !== undefined) record.scriptCursor = { ...scriptCursor, updatedAt: now };
            if (scriptIndex !== undefined) record.scriptIndex = structuredClone(scriptIndex);
            if (subtitleMode !== undefined) record.subtitleMode = subtitleMode;
            record.updatedAt = now;
            return true;
        },
        async end(streamKey, ownerUid, now, tokenHash) {
            const record = streams.get(streamKey);
            if (!record || record.ownerUid !== ownerUid || record.status !== 'active' || !tokenHash || record.uploadTokenHash !== tokenHash) return false;
            record.status = 'ended';
            record.uploadTokenHash = null;
            record.updatedAt = now;
            record.endedAt = now;
            record.subtitle = { jawa: '', indonesia: '', inggris: '', updatedAt: now };
            return true;
        },
    };
}

module.exports = { createTestFohStore };
