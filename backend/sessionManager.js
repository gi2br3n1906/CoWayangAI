/**
 * Session Manager for Multi-User Worker Pool
 * 
 * Features:
 * - Worker pool management (20 workers max)
 * - Session tracking with reconnect support (5 min window)
 * - Round-robin worker assignment
 * - Auto-cleanup on disconnect
 */

const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const MAX_WORKERS = 20;
const RECONNECT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

class SessionManager extends EventEmitter {
    constructor({ cleanupIntervalMs = 60000 } = {}) {
        super();
        this.disposed = false;
        // Worker pool: workerId -> { sessionId, status, videoUrl, assignedAt }
        this.workers = new Map();
        
        // Session map: sessionId -> { workerId, socketId, videoUrl, createdAt, lastActivity }
        this.sessions = new Map();
        
        // Pending reconnect: sessionId -> { workerId, videoUrl, disconnectedAt }
        this.pendingReconnect = new Map();
        
        // Round-robin counter
        this.nextWorkerIndex = 0;
        
        // Initialize worker pool
        for (let i = 1; i <= MAX_WORKERS; i++) {
            this.workers.set(`worker-${i}`, {
                sessionId: null,
                status: 'offline', // Only registered Python sockets supply capacity.
                videoUrl: null,
                assignedAt: null,
                pythonSocketId: null,
                captureLocal: false
            });
        }

        // Cleanup expired reconnect sessions every minute
        this.cleanupTimer = cleanupIntervalMs > 0 ? setInterval(() => this.cleanupExpiredSessions(), cleanupIntervalMs) : null;
        this.cleanupTimer?.unref();
    }
    
    /**
     * Generate an opaque cryptographic bearer reconnect capability
     */
    generateSessionId() {
        return `sess_${randomUUID()}`;
    }
    
    /**
     * Get next available worker using round-robin
     * @returns {string|null} Worker ID or null if all busy
     */
    getAvailableWorker() {
        const workerIds = Array.from(this.workers.keys());
        const startIndex = this.nextWorkerIndex;
        
        // Try round-robin from current index
        for (let i = 0; i < MAX_WORKERS; i++) {
            const index = (startIndex + i) % MAX_WORKERS;
            const workerId = workerIds[index];
            const worker = this.workers.get(workerId);
            
            if (worker.status === 'idle' && worker.pythonSocketId) {
                this.nextWorkerIndex = (index + 1) % MAX_WORKERS;
                return workerId;
            }
        }
        
        return null; // All workers busy
    }

    getAvailableCaptureWorker() {
        const available = [...this.workers.entries()].filter(([, worker]) =>
            worker.status === 'idle' && worker.pythonSocketId && worker.captureLocal);
        if (!available.length) return null;
        const [workerId] = available[0];
        return workerId;
    }
    
    /**
     * Request a new session for a user
     * @param {string} socketId - Socket ID of the frontend client
     * @param {string} videoUrl - YouTube video URL
     * @param {string} existingSessionId - Optional, for reconnect attempts
     * @returns {object} { success, sessionId, workerId, message }
     */
    requestSession(socketId, videoUrl, existingSessionId = null) {
        if (this.disposed) return { success: false, type: 'shutting_down', message: 'Server is shutting down' };
        this.cleanupExpiredSessions();
        const owned = this.getSessionBySocket(socketId);
        if (owned && (owned.videoUrl !== videoUrl || (existingSessionId && owned.sessionId !== existingSessionId))) {
            return { success: false, type: 'session_conflict', message: 'End the current session before changing video' };
        }
        const active = this.sessions.get(existingSessionId);
        if (active && active.socketId !== socketId) {
            return { success: false, type: 'forbidden', message: 'Session belongs to another socket' };
        }
        // Check for reconnect attempt
        if (existingSessionId) {
            const pending = this.pendingReconnect.get(existingSessionId);
            if (pending) {
                if (pending.videoUrl !== videoUrl) {
                    return { success: false, type: 'session_conflict', message: 'Reconnect video does not match' };
                }
                const elapsed = Date.now() - pending.disconnectedAt;
                if (elapsed < RECONNECT_WINDOW_MS) {
                    // Reconnect to existing session
                    const workerId = pending.workerId;
                    const worker = this.workers.get(workerId);
                    
                    if (worker && worker.status !== 'offline') {
                        // Restore session
                        this.sessions.set(existingSessionId, {
                            workerId,
                            socketId,
                            videoUrl: pending.videoUrl,
                            createdAt: pending.createdAt || Date.now(),
                            lastActivity: Date.now()
                        });
                        
                        worker.sessionId = existingSessionId;
                        worker.status = 'busy';
                        
                        this.pendingReconnect.delete(existingSessionId);

                        return {
                            success: true,
                            sessionId: existingSessionId,
                            workerId,
                            reconnected: true,
                            shouldStart: false,
                            message: 'Reconnected to existing session'
                        };
                    }
                }
                // Expired or worker offline, cleanup
                this.pendingReconnect.delete(existingSessionId);
            }
        }
        
        // Check if socket already has a session
        for (const [sessId, session] of this.sessions) {
            if (session.socketId === socketId) {
                return {
                    success: true,
                    sessionId: sessId,
                    workerId: session.workerId,
                    shouldStart: false,
                    message: 'Using existing session'
                };
            }
        }
        
        // Get available worker
        const isCaptureSource = /^(camera|mic):\/\//.test(videoUrl);
        const workerId = isCaptureSource ? this.getAvailableCaptureWorker() : this.getAvailableWorker();
        
        if (!workerId) {
            const status = this.getStatus();
            return {
                success: false,
                sessionId: null,
                workerId: null,
                message: `Server penuh (${status.busy}/${status.total} slot terpakai). Silakan coba lagi nanti.`,
                status
            };
        }
        
        // Create new session
        const sessionId = this.generateSessionId();
        const worker = this.workers.get(workerId);
        
        worker.sessionId = sessionId;
        worker.status = 'busy';
        worker.videoUrl = videoUrl;
        worker.assignedAt = Date.now();
        
        this.sessions.set(sessionId, {
            workerId,
            socketId,
            videoUrl,
            createdAt: Date.now(),
            lastActivity: Date.now()
        });

        return {
            success: true,
            sessionId,
            workerId,
            shouldStart: true,
            message: 'Session created'
        };
    }
    
    /**
     * End a session and release worker
     * @param {string} sessionId - Session ID to end
     * @param {string} reason - Reason for ending (user_action, video_ended, disconnect, timeout)
     */
    endSession(sessionId, reason = 'user_action') {
        const session = this.sessions.get(sessionId) || this.pendingReconnect.get(sessionId);
        
        if (!session) {
            return false;
        }
        
        const { workerId } = session;
        const worker = this.workers.get(workerId);
        const pythonSocketId = worker?.pythonSocketId;
        
        if (worker) {
            worker.sessionId = null;
            worker.status = worker.pythonSocketId ? 'idle' : 'offline';
            worker.videoUrl = null;
            worker.assignedAt = null;
        }
        
        this.sessions.delete(sessionId);
        this.pendingReconnect.delete(sessionId);
        this.emit('session-ended', { sessionId, ...session, pythonSocketId, reason });

        return true;
    }
    
    /**
     * Handle socket disconnect - move to pending reconnect
     * @param {string} socketId - Disconnected socket ID
     */
    handleDisconnect(socketId) {
        for (const [sessionId, session] of this.sessions) {
            if (session.socketId === socketId) {
                
                // Move to pending reconnect
                this.pendingReconnect.set(sessionId, {
                    workerId: session.workerId,
                    videoUrl: session.videoUrl,
                    createdAt: session.createdAt,
                    disconnectedAt: Date.now()
                });
                
                // Keep worker reserved but mark session as pending
                this.sessions.delete(sessionId);
                
                return sessionId;
            }
        }
        return null;
    }
    
    /**
     * Cleanup expired pending reconnect sessions
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        
        for (const [sessionId, pending] of this.pendingReconnect) {
            if (now - pending.disconnectedAt >= RECONNECT_WINDOW_MS) {
                this.endSession(sessionId, 'reconnect_timeout');
            }
        }
        
    }
    
    /**
     * Update session activity timestamp
     * @param {string} sessionId - Session ID
     */
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
        for (const id of [...this.sessions.keys(), ...this.pendingReconnect.keys()]) {
            this.endSession(id, 'shutdown');
        }
    }

    updateActivity(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
        }
    }
    
    /**
     * Update socket ID for a session (when socket reconnects)
     * @param {string} sessionId - Session ID
     * @param {string} newSocketId - New socket ID
     */
    updateSocketId(sessionId, newSocketId) {
        const session = this.sessions.get(sessionId);
        if (session && session.socketId === newSocketId) {
            session.socketId = newSocketId;
            return true;
        }
        return false;
    }
    
    /**
     * Get session by socket ID
     * @param {string} socketId - Socket ID
     * @returns {object|null} Session info or null
     */
    getSessionBySocket(socketId) {
        for (const [sessionId, session] of this.sessions) {
            if (session.socketId === socketId) {
                return { sessionId, ...session };
            }
        }
        return null;
    }
    
    /**
     * Get session info
     * @param {string} sessionId - Session ID
     * @returns {object|null} Session info or null
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    
    /**
     * Register Python worker socket
     * @param {string} workerId - Worker ID (e.g., "worker-1")
     * @param {string} socketId - Python socket ID
     */
    registerPythonWorker(workerId, socketId, captureLocal = false) {
        const worker = this.workers.get(workerId);
        if (this.disposed || !socketId || !worker || (worker.pythonSocketId && worker.pythonSocketId !== socketId)) return false;
        for (const [id, registered] of this.workers) {
            if (id !== workerId && registered.pythonSocketId === socketId) return false;
        }
        if (worker) {
            worker.pythonSocketId = socketId;
            worker.captureLocal = captureLocal === true;
            worker.status = worker.sessionId ? 'busy' : 'idle';
            return true;
        }
        return false;
    }
    
    /**
     * Unregister Python worker
     * @param {string} socketId - Python socket ID
     */
    unregisterPythonWorker(socketId) {
        for (const [workerId, worker] of this.workers) {
            if (worker.pythonSocketId === socketId) {
                worker.pythonSocketId = null;
                worker.captureLocal = false;
                worker.status = 'offline';
                
                // If worker had a session, end it
                if (worker.sessionId) {
                    this.endSession(worker.sessionId, 'worker_offline');
                }
                return workerId;
            }
        }
        return null;
    }
    
    /**
     * Get worker pool status
     * @returns {object} Status info
     */
    getStatus() {
        let idle = 0, busy = 0, offline = 0;
        const workers = [];
        
        for (const [workerId, worker] of this.workers) {
            if (worker.status === 'idle') idle++;
            else if (worker.status === 'busy') busy++;
            else offline++;
            
            workers.push({
                id: workerId,
                status: worker.status,
                hasSession: !!worker.sessionId,
                hasPython: !!worker.pythonSocketId
            });
        }
        
        return {
            total: MAX_WORKERS,
            available: idle,
            busy,
            offline,
            pendingReconnect: this.pendingReconnect.size,
            activeSessions: this.sessions.size,
            workers
        };
    }
    
    /**
     * Get worker by session ID
     * @param {string} sessionId - Session ID
     * @returns {object|null} Worker info or null
     */
    getWorkerBySession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            return {
                workerId: session.workerId,
                ...this.workers.get(session.workerId)
            };
        }
        return null;
    }
}

// Singleton instance
const sessionManager = new SessionManager({ cleanupIntervalMs: 0 });

module.exports = { sessionManager, SessionManager };
