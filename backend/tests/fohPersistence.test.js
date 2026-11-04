const test = require('node:test');
const assert = require('node:assert/strict');
const { createFirestoreFohStore } = require('../lib/fohStore');
const { createFirebaseTokenVerifier } = require('../lib/firebaseAuth');

function fakeFirestore() {
    const documents = new Map();
    const ref = (collection, id) => ({
        collection,
        id,
        key: `${collection}/${id}`,
        async get() { return snapshot(this); },
        async update(patch) { documents.set(this.key, { ...documents.get(this.key), ...patch }); },
    });
    const snapshot = document => ({ exists: documents.has(document.key), data: () => documents.get(document.key) });
    const collections = new Map();
    const db = {
        collection(name) {
            if (!collections.has(name)) collections.set(name, {
                doc: id => ref(name, id),
                where(field, operator, value) {
                    assert.equal(operator, '==');
                    return { async get() { return { docs: [...documents.entries()].filter(([key, record]) => key.startsWith(`${name}/`) && record[field] === value).map(([, data]) => ({ data: () => data })) }; } };
                },
            });
            return collections.get(name);
        },
        async runTransaction(callback) {
            for (;;) {
                const reads = new Map();
                const writes = [];
                const transaction = {
                    async get(document) { reads.set(document.key, documents.get(document.key)); return snapshot(document); },
                    set(document, data) { writes.push(() => documents.set(document.key, data)); },
                    update(document, patch) { writes.push(() => documents.set(document.key, { ...documents.get(document.key), ...patch })); },
                };
                const result = await callback(transaction);
                if (db._beforeCommit) { const hook = db._beforeCommit; db._beforeCommit = null; await hook(); }
                if ([...reads].some(([key, value]) => documents.get(key) !== value)) continue;
                writes.forEach(write => write());
                return result;
            }
        },
        async _get(document) { return snapshot(document); },
    };
    return db;
}

const outputs = {
    jawa: { language: 'jawa', streamKey: 'tmii-jawa', outputPath: '/foh-output/tmii-jawa' },
    indonesia: { language: 'indonesia', streamKey: 'tmii-indo', outputPath: '/foh-output/tmii-indo' },
    inggris: { language: 'inggris', streamKey: 'tmii-inggris', outputPath: '/foh-output/tmii-inggris' },
};

test('Firestore stream state survives store recreation and owner can rotate its upload token', async () => {
    const db = fakeFirestore();
    const first = createFirestoreFohStore({ db });
    await first.createOrResume({ streamKey: 'tmii-stable', ownerUid: 'owner-a', outputs, tokenHash: 'hash-old', now: 10 });
    await first.updateState({ streamKey:'tmii-stable', ownerUid:'owner-a', tokenHash:'hash-old', expectedCursor:{scriptId:null,scriptRevision:null,cursorRevision:0}, subtitle:{ jawa: 'Sugeng', indonesia: 'Selamat', inggris: 'Welcome' }, now:11 });

    const restarted = createFirestoreFohStore({ db });
    const [record] = await restarted.listByOwner('owner-a');
    assert.equal(record.streamKey, 'tmii-stable');
    assert.equal(record.subtitle.indonesia, 'Selamat');
    const resumed = await restarted.createOrResume({ streamKey: 'tmii-stable', ownerUid: 'owner-a', outputs, tokenHash: 'hash-new', now: 12 });
    assert.equal(resumed.outputs.indonesia.outputPath, '/foh-output/tmii-indo');
    assert.equal(resumed.subtitle.jawa, 'Sugeng');
    assert.equal(resumed.uploadTokenHash, 'hash-new');
    assert.equal(resumed.status, 'active');
    assert.equal(resumed.subtitleMode, 'legacy');
});

test('ending persists empty subtitles for later readers and resume', async () => {
    const db = fakeFirestore();
    const store = createFirestoreFohStore({ db });
    await store.createOrResume({ streamKey: 'tmii-stable', ownerUid: 'owner-a', outputs, tokenHash: 'hash', now: 10 });
    await store.updateState({ streamKey:'tmii-stable', ownerUid:'owner-a', tokenHash:'hash', expectedCursor:{scriptId:null,scriptRevision:null,cursorRevision:0}, subtitle:{ jawa: 'J', indonesia: 'I', inggris: 'E' }, now:11 });
    assert.equal(await store.end('tmii-stable', 'owner-a', 12, 'hash'), true);
    const restarted = createFirestoreFohStore({ db });
    assert.deepEqual((await restarted.getOutput('tmii-indo')).record.subtitle, { jawa: '', indonesia: '', inggris: '', updatedAt: 12 });
    const resumed = await restarted.createOrResume({ streamKey: 'tmii-stable', ownerUid: 'owner-a', outputs, tokenHash: 'new', now: 13 });
    assert.deepEqual(resumed.subtitle, { jawa: '', indonesia: '', inggris: '', updatedAt: 12 });
});

test('Firestore stream key cannot be claimed or ended by another account', async () => {
    const store = createFirestoreFohStore({ db: fakeFirestore() });
    await store.createOrResume({ streamKey: 'tmii-stable', ownerUid: 'owner-a', outputs, tokenHash: 'hash-a', now: 10 });
    await assert.rejects(
        store.createOrResume({ streamKey: 'tmii-stable', ownerUid: 'owner-b', outputs, tokenHash: 'hash-b', now: 11 }),
        error => error.statusCode === 409,
    );
    assert.equal(await store.end('tmii-stable', 'owner-b', 12, 'hash-a'), false);
    assert.equal((await store.listByOwner('owner-a'))[0].status, 'active');
});

test('Firestore stream key cannot collide with another streams language output alias', async () => {
    const store = createFirestoreFohStore({ db: fakeFirestore() });
    await store.createOrResume({ streamKey: 'tmii', ownerUid: 'owner-a', outputs, tokenHash: 'hash-a', now: 10 });
    await assert.rejects(
        store.createOrResume({ streamKey: 'tmii-jawa', ownerUid: 'owner-b', outputs: { jawa: { language: 'jawa', streamKey: 'tmii-jawa-jawa' } }, tokenHash: 'hash-b', now: 11 }),
        error => error.statusCode === 409,
    );
});

test('Firebase token verifier rejects invalid tokens and returns verified claims', async () => {
    const verifier = createFirebaseTokenVerifier({ auth: { verifyIdToken: async token => {
        if (token !== 'valid') throw new Error('invalid token');
        return { uid: 'verified-owner' };
    } } });
    assert.equal(await verifier(''), null);
    assert.equal(await verifier('invalid'), null);
    assert.deepEqual(await verifier('valid'), { uid: 'verified-owner' });
});

test('cursor and subtitle commit together, survive resume and reject stale revisions or credentials', async () => {
    const db = fakeFirestore();
    const first = createFirestoreFohStore({ db });
    const base = { streamKey:'tmii-stable', ownerUid:'owner-a', tokenHash:'old' };
    const empty = { scriptId:null, scriptRevision:null, cursorRevision:0 };
    const cursor = { scriptId:'script-1', scriptRevision:'r1', act:2, cueId:'cue-4', offset:3, mode:'manual', revision:1 };
    await first.createOrResume({ ...base, outputs, now:10 });
    assert.equal(await first.updateState({ ...base, expectedCursor:empty, scriptCursor:cursor, subtitle:{jawa:'J',indonesia:'I',inggris:'E'}, now:11 }), true);
    const second = createFirestoreFohStore({ db });
    const resumed = await second.createOrResume({ ...base, outputs, tokenHash:'new', now:12 });
    assert.deepEqual(resumed.scriptCursor, { ...cursor, updatedAt:11 });
    assert.equal(resumed.subtitle.jawa, 'J');
    assert.equal(await first.updateState({ ...base, expectedCursor:{scriptId:'script-1',scriptRevision:'r1',cursorRevision:1}, subtitle:{jawa:'stale'}, now:13 }), false);
    assert.equal(await first.end('tmii-stable','owner-a',13,'old'), false);
    const current = { ...base, tokenHash:'new' };
    assert.equal(await second.updateState({ ...current, expectedCursor:empty, subtitle:{jawa:'stale'}, now:14 }), false);
    assert.equal(await second.updateState({ ...current, expectedCursor:{scriptId:'script-1',scriptRevision:'other',cursorRevision:1}, subtitle:{jawa:'stale'}, now:14 }), false);
    assert.equal(await second.updateState({ ...current, ownerUid:'owner-b', expectedCursor:{scriptId:'script-1',scriptRevision:'r1',cursorRevision:1}, subtitle:{jawa:'stale'}, now:14 }), false);
    assert.equal((await second.getOwnedStream('tmii-stable','owner-a')).subtitle.jawa, 'J');
    assert.equal(await second.end('tmii-stable','owner-a',15,'new'), true);
    assert.equal(await second.updateState({ ...current, expectedCursor:{scriptId:'script-1',scriptRevision:'r1',cursorRevision:1}, subtitle:{jawa:'stale'}, now:16 }), false);
});

test('transaction retry rejects a write read before a concurrent token rotation', async () => {
    const db = fakeFirestore();
    const store = createFirestoreFohStore({ db });
    await store.createOrResume({ streamKey:'tmii-stable', ownerUid:'owner-a', outputs, tokenHash:'old', now:1 });
    let release, enter;
    const entered = new Promise(resolve => { enter = resolve; });
    db._beforeCommit = async () => { enter(); await new Promise(resolve => { release = resolve; }); };
    const stale = store.updateState({ streamKey:'tmii-stable', ownerUid:'owner-a', tokenHash:'old', expectedCursor:{scriptId:null,scriptRevision:null,cursorRevision:0}, subtitle:{jawa:'stale'}, now:2 });
    await entered;
    await store.createOrResume({ streamKey:'tmii-stable', ownerUid:'owner-a', outputs, tokenHash:'new', now:3 });
    release();
    assert.equal(await stale, false);
    const record = await store.getOwnedStream('tmii-stable','owner-a');
    assert.equal(record.uploadTokenHash, 'new');
    assert.equal(record.subtitle.jawa, '');
});
