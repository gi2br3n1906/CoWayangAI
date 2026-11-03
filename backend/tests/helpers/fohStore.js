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
        async updateSubtitle(streamKey, subtitle, now) {
            const record = streams.get(streamKey);
            if (!record) throw new Error('FOH stream not found');
            record.subtitle = { ...subtitle, updatedAt: now };
            record.updatedAt = now;
        },
        async end(streamKey, ownerUid, now) {
            const record = streams.get(streamKey);
            if (!record || record.ownerUid !== ownerUid) return false;
            record.status = 'ended';
            record.uploadTokenHash = null;
            record.updatedAt = now;
            return true;
        },
    };
}

module.exports = { createTestFohStore };
