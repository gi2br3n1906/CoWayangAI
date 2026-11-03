const { InputError, seconds, videoUrl } = require('./input');

function installSocketHandlers(io, sessions, { asrPost, operationMode = 'local', workerSharedSecret = '', logger = console }) {
    const tasks = new Set();
    const track = promise => {
        const task = Promise.resolve(promise).catch(error => logger.error(`[Socket] ${error.message}`));
        tasks.add(task);
        task.finally(() => tasks.delete(task));
        return task;
    };
    const status = () => io.emit('worker-status-update', sessions.getStatus());
    const reject = message => Object.assign(new Error(message), { type: 'forbidden' });
    const hasVideoReservation = videoUrl => [...sessions.sessions.values(), ...sessions.pendingReconnect.values()].some(session => session.videoUrl === videoUrl);

    const onEnded = event => {
        if (event.pythonSocketId) io.to(event.pythonSocketId).emit('stop-processing', { sessionId: event.sessionId });
        if (event.socketId) {
            io.to(event.socketId).emit('session-ended', { sessionId: event.sessionId, reason: event.reason });
            if (event.reason === 'worker_offline') io.to(event.socketId).emit('stream-error', { sessionId: event.sessionId, message: 'Python worker disconnected' });
        }
        if (event.pythonSocketId && (event.videoUrl.startsWith('camera://') || event.videoUrl.startsWith('mic://'))) io.to(event.pythonSocketId).emit('stop-asr', { sessionId: event.sessionId });
        if (!hasVideoReservation(event.videoUrl) && !event.videoUrl.startsWith('camera://') && !event.videoUrl.startsWith('mic://')) {
            track(asrPost('/stop-asr', { videoUrl: event.videoUrl }).catch(error => {
                if (event.socketId) io.to(event.socketId).emit('asr-error', { sessionId: event.sessionId, operation: 'stop', message: 'ASR server request failed' });
                logger.error(`[ASR] stop failed: ${error.message}`);
            }));
        }
    };
    sessions.on('session-ended', onEnded);

    io.on('connection', socket => {
        const owned = data => {
            const sessionId = data.sessionId || sessions.getSessionBySocket(socket.id)?.sessionId;
            const session = sessions.getSession(sessionId);
            if (!session || session.socketId !== socket.id || socket.isPythonWorker) throw reject('Session belongs to another socket');
            return { sessionId, session, worker: sessions.getWorkerBySession(sessionId) };
        };
        const workerOwned = data => {
            const registered = sessions.workers.get(socket.workerId);
            const sessionId = data.sessionId || registered?.sessionId;
            const session = sessions.getSession(sessionId) || sessions.pendingReconnect.get(sessionId);
            if (!socket.isPythonWorker || !registered || registered.pythonSocketId !== socket.id || registered.sessionId !== sessionId || session?.workerId !== socket.workerId) {
                throw reject('Only the assigned Python worker may publish results');
            }
            return { sessionId, session };
        };
        const command = (worker, name, data) => {
            if (!worker?.pythonSocketId) throw Object.assign(new Error('Python worker is offline'), { type: 'worker_offline' });
            io.to(worker.pythonSocketId).emit(name, data);
        };
        const on = (name, handler) => socket.on(name, (data = {}, ack) => {
            if (typeof data === 'function') { ack = data; data = {}; }
            track(Promise.resolve().then(() => {
                if (!data || typeof data !== 'object' || Array.isArray(data)) throw new InputError('Event payload must be an object');
                return handler(data);
            }).then(result => {
                if (typeof ack === 'function') ack(result || { success: true });
            }).catch(error => {
                const result = { success: false, type: error.type || (error.statusCode === 400 ? 'invalid_input' : 'upstream_error'), message: error.statusCode === 400 || error.type ? error.message : 'Upstream service request failed' };
                socket.emit('session-error', result);
                if (typeof ack === 'function') ack(result);
            }));
        });
        const asr = async (operation, sessionId, payload) => {
            try { await asrPost(`/${operation}-asr`, payload); return true; }
            catch (error) {
                socket.emit('asr-error', { sessionId, operation, message: 'ASR server request failed' });
                logger.error(`[ASR] ${operation} failed: ${error.message}`);
                return false;
            }
        };

        on('register-worker', data => {
            if (operationMode === 'hybrid') {
                if (!workerSharedSecret || typeof data.sharedSecret !== 'string') throw reject('Worker authentication failed');
                const supplied = Buffer.from(data.sharedSecret); const expected = Buffer.from(workerSharedSecret);
                if (supplied.length !== expected.length || !require('node:crypto').timingSafeEqual(supplied, expected)) throw reject('Worker authentication failed');
            }
            const success = !sessions.getSessionBySocket(socket.id) && sessions.registerPythonWorker(data.workerId, socket.id, data.captureLocal === true);
            if (success) { socket.workerId = data.workerId; socket.isPythonWorker = true; status(); }
            const result = success ? { success: true, workerId: data.workerId } : { success: false, error: 'Invalid or occupied worker ID' };
            socket.emit('worker-registered', result);
            return result;
        });
        on('start-live-stream', async data => {
            if (socket.isPythonWorker) throw reject('Python workers cannot request frontend sessions');
            const source = videoUrl(data.videoUrl);

            const startTime = seconds(data.currentTime ?? data.startTime ?? 0);
            const language = data.targetLanguage || 'id';
            if (!['id', 'en'].includes(language)) throw new InputError('Use language id or en');
            const result = sessions.requestSession(socket.id, data.videoUrl, data.existingSessionId);
            if (!result.success) {
                socket.emit('session-error', { ...result, type: result.type || 'server_full' });
                return result;
            }
            socket.sessionId = result.sessionId;
            socket.emit('session-created', { ...result, reconnected: !!result.reconnected });
            status();
            if (!result.shouldStart) return result;
            const session = sessions.getSession(result.sessionId);
            session.startTime = startTime;
            session.targetLanguage = language;
            command(sessions.getWorkerBySession(result.sessionId), 'start-processing', { sessionId: result.sessionId, workerId: result.workerId, videoUrl: session.videoUrl, startTime });
            const worker = sessions.getWorkerBySession(result.sessionId);
            if (session.videoUrl.startsWith('camera://') || session.videoUrl.startsWith('mic://')) {
                command(worker, 'start-asr', { sessionId: result.sessionId, videoUrl: session.videoUrl, startTime, targetLanguage: language });
                return { ...result, asrStarted: true };
            }
            const asrStarted = await asr('start', result.sessionId, { videoUrl: session.videoUrl, sessionId: result.sessionId, startTime, targetLanguage: language });
            return { ...result, asrStarted };
        });
        const end = data => {
            const { sessionId } = owned(data);
            sessions.endSession(sessionId, data.reason || 'user_action');
            return { success: true, sessionId };
        };
        on('end-session', end);
        on('stop-live-stream', end);
        on('player-time', data => {
            const { sessionId, worker } = owned(data);
            const time = seconds(data.time ?? data.currentTime ?? 0);
            command(worker, 'player-time', { ...data, sessionId, time });
            sessions.updateActivity(sessionId);
        });
        on('player-seek', async data => {
            const { sessionId, session, worker } = owned(data);
            const time = seconds(data.time);
            session.lastSeekAt = Date.now();
            session.startTime = time;
            command(worker, 'player-seek', { ...data, sessionId, time });
            if (/^(camera|mic):\/\//.test(session.videoUrl)) return { success: true, asrUpdated: true };
            return { success: true, asrUpdated: await asr('seek', sessionId, { videoUrl: session.videoUrl, seekTime: time }) };
        });
        on('player-state', async data => {
            const { sessionId, session, worker } = owned(data);
            if (!['playing', 'paused', 'stopped', 'ended'].includes(data.state)) throw new InputError('Invalid player state');
            const time = seconds(data.time ?? 0);
            command(worker, 'player-state', { ...data, sessionId, time });
            if (data.state === 'ended') return end({ sessionId, reason: 'video_ended' });
            if (data.state === 'playing' && Date.now() - (session.lastSeekAt ?? -Infinity) < 2000) return { success: true, debounced: true };
            const operation = data.state === 'playing' ? 'resume' : 'pause';
            if (/^(camera|mic):\/\//.test(session.videoUrl)) return { success: true, asrUpdated: true };
            return { success: true, asrUpdated: await asr(operation, sessionId, { videoUrl: session.videoUrl, ...(operation === 'resume' ? { currentTime: time } : {}) }) };
        });
        for (const name of ['ai-boxes', 'stream-started', 'stream-error']) on(name, data => {
            const { sessionId, session } = workerOwned(data);
            if (session.socketId) {
                const target = io.to(session.socketId);
                (name === 'ai-boxes' ? target.volatile : target).emit(name, { ...data, sessionId });
                sessions.updateActivity(sessionId);
            }
            if (name === 'stream-error') sessions.endSession(sessionId, 'error');
        });
        socket.on('disconnect', () => {
            if (socket.isPythonWorker) sessions.unregisterPythonWorker(socket.id);
            else sessions.handleDisconnect(socket.id);
            status();
        });
    });
    return {
        async drain() { while (tasks.size) await Promise.all([...tasks]); },
        detach() { sessions.removeListener('session-ended', onEnded); }
    };
}

module.exports = { installSocketHandlers };
