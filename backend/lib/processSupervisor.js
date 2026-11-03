const { spawn: defaultSpawn } = require('node:child_process');

class ProcessSupervisor {
    constructor(specs, { spawn = defaultSpawn, restartDelayMs = 5000, killTimeoutMs = 3000, logger = console } = {}) {
        this.specs = specs;
        this.spawn = spawn;
        this.restartDelayMs = restartDelayMs;
        this.killTimeoutMs = killTimeoutMs;
        this.logger = logger;
        this.children = new Map();
        this.restartTimers = new Map();
        this.started = false;
        this.stopping = false;
        this.stopPromise = null;
    }

    start() {
        if (this.started || this.stopping) return;
        this.started = true;
        for (const spec of this.specs) this.startChild(spec);
    }

    scheduleRestart(spec) {
        if (this.stopping || this.restartTimers.has(spec.name)) return;
        const timer = setTimeout(() => {
            this.restartTimers.delete(spec.name);
            if (!this.stopping) this.startChild(spec);
        }, this.restartDelayMs);
        timer.unref();
        this.restartTimers.set(spec.name, timer);
    }

    startChild(spec) {
        if (this.stopping || this.children.has(spec.name)) return;
        let child;
        try { child = this.spawn(spec.command, spec.args, spec.options); }
        catch (error) {
            this.logger.error(`[Process] ${spec.name}: ${error.message}`);
            this.scheduleRestart(spec);
            return;
        }
        this.children.set(spec.name, child);
        child.on('error', error => this.logger.error(`[Process] ${spec.name}: ${error.message}`));
        // close, not exit: wait until the child's stdio handles are closed.
        child.once('close', () => {
            if (this.children.get(spec.name) !== child) return;
            this.children.delete(spec.name);
            this.scheduleRestart(spec);
        });
    }

    stopChild(child) {
        return new Promise((resolve, reject) => {
            let timer;
            let finished = false;
            const finish = error => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                child.removeListener('close', onClose);
                if (error) reject(error); else resolve();
            };
            const onClose = () => finish();
            child.once('close', onClose);
            timer = setTimeout(() => {
                try { child.kill('SIGKILL'); }
                catch (error) { finish(error); return; }
                // Fail honestly if even forced termination cannot be confirmed.
                if (!finished) {
                    timer = setTimeout(() => finish(new Error('Child termination was not confirmed')), this.killTimeoutMs);
                }
            }, this.killTimeoutMs);
            try {
                if (!child.kill('SIGTERM')) finish(new Error('Unable to terminate child process'));
            } catch (error) { finish(error); }
        });
    }

    haltRestarts() {
        this.stopping = true;
        for (const timer of this.restartTimers.values()) clearTimeout(timer);
        this.restartTimers.clear();
    }

    stop() {
        if (this.stopPromise) return this.stopPromise;
        this.haltRestarts();
        this.stopPromise = Promise.all([...this.children.values()].map(child => this.stopChild(child))).then(() => undefined);
        return this.stopPromise;
    }
}

module.exports = { ProcessSupervisor };
