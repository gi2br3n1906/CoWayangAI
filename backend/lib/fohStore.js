'use strict';

const ALIASES_COLLECTION = 'fohStreamAliases';
const STREAMS_COLLECTION = 'fohStreams';
const KEYS_COLLECTION = 'fohStreamKeys';

function conflict(message) {
    return Object.assign(new Error(message), { statusCode: 409 });
}

// A missing cursor is the legacy/live-mode revision. All callers must supply
// the revision they observed before starting asynchronous work.
function cursorMatches(cursor, expected, subtitleMode) {
    if (!expected || typeof expected !== 'object') return false;
    return (cursor?.scriptId ?? null) === expected.scriptId &&
        (cursor?.scriptRevision ?? null) === expected.scriptRevision &&
        (cursor?.revision ?? 0) === expected.cursorRevision &&
        (expected.mode === undefined || (cursor?.mode ?? null) === expected.mode) &&
        (expected.subtitleMode === undefined || (subtitleMode ?? 'legacy') === expected.subtitleMode);
}

function validCursor(cursor, previous) {
    return cursor && typeof cursor.scriptId === 'string' && cursor.scriptId.length > 0 &&
        typeof cursor.scriptRevision === 'string' && cursor.scriptRevision.length > 0 &&
        Number.isSafeInteger(cursor.act) && cursor.act >= 1 &&
        typeof cursor.cueId === 'string' && cursor.cueId.length > 0 &&
        Number.isSafeInteger(cursor.offset) && cursor.offset >= 0 &&
        ['auto', 'manual'].includes(cursor.mode) &&
        cursor.revision === (previous?.revision ?? 0) + 1;
}

function createFirestoreFohStore({ db }) {
    if (!db) throw new TypeError('Firestore database is required');
    const streams = db.collection(STREAMS_COLLECTION);
    const aliases = db.collection(ALIASES_COLLECTION);
    const keys = db.collection(KEYS_COLLECTION);

    return {
        async createOrResume({ streamKey, ownerUid, outputs, tokenHash, now }) {
            const streamRef = streams.doc(streamKey);
            const aliasRefs = Object.values(outputs).map(output => aliases.doc(output.streamKey));
            const keyRefs = [keys.doc(streamKey), ...Object.values(outputs).map(output => keys.doc(output.streamKey))];
            return db.runTransaction(async transaction => {
                const [streamSnapshot, ...snapshots] = await Promise.all([
                    transaction.get(streamRef),
                    ...aliasRefs.map(ref => transaction.get(ref)),
                    ...keyRefs.map(ref => transaction.get(ref)),
                ]);
                const aliasSnapshots = snapshots.slice(0, aliasRefs.length);
                const keySnapshots = snapshots.slice(aliasRefs.length);
                const current = streamSnapshot.exists ? streamSnapshot.data() : null;
                if (current && current.ownerUid !== ownerUid) throw conflict('Stream key is already in use');
                const primaryReservation = keySnapshots[0];
                if (primaryReservation.exists && (primaryReservation.data().parentKey !== streamKey || primaryReservation.data().kind !== 'primary')) {
                    throw conflict('Stream key is reserved for another output');
                }
                for (let index = 0; index < aliasSnapshots.length; index++) {
                    const reservation = keySnapshots[index + 1];
                    if (reservation.exists && (reservation.data().parentKey !== streamKey || reservation.data().kind !== 'alias')) {
                        throw conflict('A language output stream key is already in use');
                    }
                }
                for (const snapshot of aliasSnapshots) {
                    if (snapshot.exists && snapshot.data().parentKey !== streamKey) throw conflict('A language output stream key is already in use');
                }
                const record = {
                    schemaVersion: 1,
                    streamKey,
                    ownerUid,
                    outputs,
                    status: 'active',
                    uploadTokenHash: tokenHash,
                    createdAt: current?.createdAt || now,
                    updatedAt: now,
                    subtitle: current?.subtitle || { jawa: '', indonesia: '', inggris: '', updatedAt: 0 },
                    scriptCursor: current?.scriptCursor ?? null,
                    scriptIndex: current?.scriptIndex ?? null,
                    subtitleMode: current?.subtitleMode ?? 'legacy',
                };
                transaction.set(streamRef, record);
                transaction.set(keyRefs[0], { parentKey: streamKey, kind: 'primary', ownerUid });
                Object.values(outputs).forEach(output => {
                    transaction.set(aliases.doc(output.streamKey), { parentKey: streamKey, language: output.language });
                    transaction.set(keys.doc(output.streamKey), { parentKey: streamKey, kind: 'alias', ownerUid });
                });
                return record;
            });
        },

        async listByOwner(ownerUid) {
            const snapshot = await streams.where('ownerUid', '==', ownerUid).get();
            return snapshot.docs.map(document => document.data()).sort((left, right) => right.updatedAt - left.updatedAt);
        },

        async getOwnedStream(streamKey, ownerUid) {
            const snapshot = await streams.doc(streamKey).get();
            if (!snapshot.exists || snapshot.data().ownerUid !== ownerUid) return null;
            return snapshot.data();
        },

        async getOutput(key) {
            const streamSnapshot = await streams.doc(key).get();
            if (streamSnapshot.exists) return { record: streamSnapshot.data(), language: null, streamKey: key };
            const aliasSnapshot = await aliases.doc(key).get();
            if (!aliasSnapshot.exists) return null;
            const alias = aliasSnapshot.data();
            const parentSnapshot = await streams.doc(alias.parentKey).get();
            if (!parentSnapshot.exists) return null;
            return { record: parentSnapshot.data(), language: alias.language, streamKey: key };
        },

        async updateState({ streamKey, ownerUid, tokenHash, expectedCursor, scriptCursor, scriptIndex, subtitle, subtitleMode, now }) {
            const streamRef = streams.doc(streamKey);
            return db.runTransaction(async transaction => {
                const snapshot = await transaction.get(streamRef);
                const record = snapshot.exists ? snapshot.data() : null;
                if (!record || record.ownerUid !== ownerUid || record.status !== 'active' || !tokenHash || record.uploadTokenHash !== tokenHash || !cursorMatches(record.scriptCursor, expectedCursor, record.subtitleMode)) return false;
                if (scriptCursor !== undefined && !validCursor(scriptCursor, record.scriptCursor)) throw new TypeError('Invalid script cursor');
                if (scriptIndex !== undefined && (!scriptIndex || typeof scriptIndex.id !== 'string' || !Array.isArray(scriptIndex.cues))) throw new TypeError('Invalid script index');
                if (subtitleMode !== undefined && !['legacy', 'script'].includes(subtitleMode)) throw new TypeError('Invalid subtitle mode');
                if (scriptCursor === undefined && scriptIndex === undefined && subtitle === undefined && subtitleMode === undefined) throw new TypeError('No state update supplied');
                const patch = { updatedAt: now };
                if (scriptCursor !== undefined) patch.scriptCursor = { ...scriptCursor, updatedAt: now };
                if (scriptCursor === null) patch.scriptCursor = null;
                if (scriptIndex !== undefined) patch.scriptIndex = scriptIndex;
                if (subtitle !== undefined) patch.subtitle = { ...subtitle, updatedAt: now };
                if (subtitleMode !== undefined) patch.subtitleMode = subtitleMode;
                transaction.update(streamRef, patch);
                return true;
            });
        },

        async end(streamKey, ownerUid, now, tokenHash) {
            const streamRef = streams.doc(streamKey);
            return db.runTransaction(async transaction => {
                const snapshot = await transaction.get(streamRef);
                if (!snapshot.exists || snapshot.data().ownerUid !== ownerUid || snapshot.data().status !== 'active' || !tokenHash || snapshot.data().uploadTokenHash !== tokenHash) return false;
                transaction.update(streamRef, { status: 'ended', uploadTokenHash: null, endedAt: now, updatedAt: now, subtitle: { jawa: '', indonesia: '', inggris: '', updatedAt: now } });
                return true;
            });
        },
    };
}

module.exports = { createFirestoreFohStore, cursorMatches, validCursor };
