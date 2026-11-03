'use strict';

let firebaseAdminApp;

function getFirebaseAdminServices() {
    const admin = require('firebase-admin');
    firebaseAdminApp ||= admin.apps[0] || admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return { auth: admin.auth(firebaseAdminApp), db: admin.firestore(firebaseAdminApp) };
}

function createFirebaseTokenVerifier({ auth } = {}) {
    let firebaseAuth = auth;
    return async token => {
        if (typeof token !== 'string' || !token) return null;
        firebaseAuth ||= getFirebaseAdminServices().auth;
        try {
            return await firebaseAuth.verifyIdToken(token);
        } catch {
            return null;
        }
    };
}

module.exports = { createFirebaseTokenVerifier, getFirebaseAdminServices };
