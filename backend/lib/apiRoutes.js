const { InputError, seconds, analysisStart, videoUrl, language } = require('./input');

function installAsrRoutes(app, { asr, aiPost }) {
    const route = handler => async (req, res) => {
        try { res.json({ status: 'success', ...await handler(req.body || {}) }); }
        catch (error) {
            res.status(error.statusCode === 400 ? 400 : 502).json({ status: 'error', message: error.statusCode === 400 ? error.message : 'Upstream service request failed' });
        }
    };
    app.post('/api/analyze', route(async body => {
        const url = videoUrl(body.videoUrl);
        const startTime = analysisStart(body);
        const targetLanguage = language(body.targetLanguage ?? 'id');
        let pythonAvailable = true;
        try { await aiPost('/start-analysis', { videoUrl: url, startTime }); }
        catch { pythonAvailable = false; }
        await asr.start(url, startTime, targetLanguage);
        return { message: pythonAvailable ? 'AI dan ASR dimulai' : 'ASR dimulai (AI tidak tersedia)', pythonAvailable, startTime, targetLanguage };
    }));
    app.post('/api/start-asr', route(async body => {
        await asr.start(body.videoUrl, body.startTime === undefined ? 0 : body.startTime, body.targetLanguage === undefined ? asr.state.targetLanguage : body.targetLanguage, body.sessionId);
        return { message: 'ASR transcription started', targetLanguage: asr.state.targetLanguage, startTime: asr.state.startTime };
    }));
    app.post('/api/update-asr-time', route(async body => {
        await asr.update(body.startTime === undefined ? 0 : body.startTime, body.targetLanguage === undefined ? asr.state.targetLanguage : body.targetLanguage);
        return { message: 'ASR time updated', targetLanguage: asr.state.targetLanguage, startTime: asr.state.startTime };
    }));
    app.post('/api/change-language', route(async body => {
        if (body.targetLanguage === undefined) language(null);
        await asr.changeLanguage(body.targetLanguage);
        return { message: `Language changed to ${asr.state.targetLanguage}`, targetLanguage: asr.state.targetLanguage };
    }));
    app.post('/api/seek-analysis', route(async body => {
        const startTime = seconds(body.startTime === undefined ? 0 : body.startTime);
        const { videoUrl: url, targetLanguage } = asr.state;
        if (!url) throw new InputError('Tidak ada video aktif');
        await aiPost('/stop-analysis', {});
        await aiPost('/start-analysis', { videoUrl: url, startTime });
        await asr.start(url, startTime, targetLanguage);
        return { message: 'AI seek successful', startTime };
    }));
    app.post('/api/stop-asr', route(async () => {
        await asr.stop();
        return { message: 'ASR stopped' };
    }));
}

module.exports = { installAsrRoutes };
