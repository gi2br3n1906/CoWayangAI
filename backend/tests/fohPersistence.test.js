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
            const writes = [];
            const transaction = {
                async get(document) { return snapshot(document); },
                set(document, data) { writes.push(() => documents.set(document.key, data)); },
                update(document, patch) { writes.push(() => documents.set(document.key, { ...documents.get(document.key), ...patch })); },
            };
            const result = await callback(transaction);
            writes.forEach(write => write());
            return result;
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
    await first.updateSubtitle('tmii-stable', { jawa: 'Sugeng', indonesia: 'Selamat', inggris: 'Welcome' }, 11);

    const restarted = createFirestoreFohStore({ db });
    const [record] = await restarted.listByOwner('owner-a');
    assert.equal(record.streamKey, 'tmii-stable');
    assert.equal(record.subtitle.indonesia, 'Selamat');
    const resumed = await restarted.createOrResume({ streamKey: 'tmii-stable', ownerUid: 'owner-a', outputs, tokenHash: 'hash-new', now: 12 });
    assert.equal(resumed.outputs.indonesia.outputPath, '/foh-output/tmii-indo');
    assert.equal(resumed.subtitle.jawa, 'Sugeng');
    assert.equal(resumed.uploadTokenHash, 'hash-new');
    assert.equal(resumed.status, 'active');
});

test('ending persists empty subtitles for later readers and resume', async () => {
    const db = fakeFirestore();
    const store = createFirestoreFohStore({ db });
    await store.createOrResume({ streamKey: 'tmii-stable', ownerUid: 'owner-a', outputs, tokenHash: 'hash', now: 10 });
    await store.updateSubtitle('tmii-stable', { jawa: 'J', indonesia: 'I', inggris: 'E' }, 11);
    assert.equal(await store.end('tmii-stable', 'owner-a', 12), true);
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
    assert.equal(await store.end('tmii-stable', 'owner-b', 12), false);
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
