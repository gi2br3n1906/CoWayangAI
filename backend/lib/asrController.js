const { InputError, seconds, videoUrl: validateUrl, language: validateLanguage } = require('./input');

// Compatibility HTTP endpoints still select ONE video per Node process.
// This is intentionally not a distributed or user-isolated ASR implementation.
function createAsrController(post) {
    let tail = Promise.resolve();
    let closing = false;
    let closePromise;
    const run = operation => {
        if (closing) return Promise.reject(Object.assign(new Error('ASR controller is shutting down'), { statusCode: 503 }));
        const task = tail.then(operation);
        tail = task.catch(() => {}); // sequencing only; callers still receive the rejection
        return task;
    };
    const state = { videoUrl: null, startTime: 0, targetLanguage: 'id' };
    const stop = async () => {
        if (!state.videoUrl) return;
        await post('/stop-asr', { videoUrl: state.videoUrl, startTime: state.startTime });
        state.videoUrl = null;
        state.startTime = 0;
    };
    const start = async (url, time = 0, targetLanguage = state.targetLanguage, sessionId = null) => {
        const videoUrl = validateUrl(url);
        const startTime = seconds(time);
        const language = validateLanguage(targetLanguage);
        // Validate the replacement BEFORE stopping the currently working video.
        await stop();
        await post('/start-asr', { videoUrl, sessionId, startTime, targetLanguage: language });
        Object.assign(state, { videoUrl, sessionId, startTime, targetLanguage: language });
    };
    const update = async (time = 0, targetLanguage = state.targetLanguage) => {
        if (!state.videoUrl) throw new InputError('Tidak ada video aktif');
        await start(state.videoUrl, time, targetLanguage);
    };
    const changeLanguage = async value => {
        const language = validateLanguage(value);
        if (state.videoUrl) await start(state.videoUrl, state.startTime, language);
        else state.targetLanguage = language;
    };
    const close = () => {
        if (closePromise) return closePromise;
        closing = true;
        closePromise = tail.then(stop);
        return closePromise;
    };
    return {
        state,
        start: (...args) => run(() => start(...args)),
        stop: () => run(stop),
        update: (...args) => run(() => update(...args)),
        changeLanguage: value => run(() => changeLanguage(value)),
        close
    };
}

module.exports = { createAsrController };
