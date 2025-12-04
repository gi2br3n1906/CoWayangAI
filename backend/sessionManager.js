/**
 * Session Manager for Multi-User Worker Pool
 * 
 * Features:
 * - Worker pool management (5 workers max)
 * - Session tracking with reconnect support (5 min window)
 * - Round-robin worker assignment
 * - Auto-cleanup on disconnect
 */

const MAX_WORKERS = 5;
const RECONNECT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

class SessionManager {
    constructor() {
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
                status: 'idle', // idle, busy, offline
                videoUrl: null,
                assignedAt: null,
                pythonSocketId: null
            });
        }
        
        console.log(`[SessionManager] Initialized with ${MAX_WORKERS} workers`);
        
        // Cleanup expired reconnect sessions every minute
        setInterval(() => this.cleanupExpiredSessions(), 60000);
    }
    
    /**
     * Generate unique session ID using timestamp
     */
    generateSessionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `sess_${timestamp}_${random}`;
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
            
            if (worker.status === 'idle') {
                this.nextWorkerIndex = (index + 1) % MAX_WORKERS;
                return workerId;
            }
        }
        
        return null; // All workers busy
    }
    
    /**
     * Request a new session for a user
     * @param {string} socketId - Socket ID of the frontend client
     * @param {string} videoUrl - YouTube video URL
     * @param {string} existingSessionId - Optional, for reconnect attempts
     * @returns {object} { success, sessionId, workerId, message }
     */
    requestSession(socketId, videoUrl, existingSessionId = null) {
        // Check for reconnect attempt
        if (existingSessionId) {
            const pending = this.pendingReconnect.get(existingSessionId);
            if (pending) {
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
                        
                        console.log(`[SessionManager] ♻️ Reconnected session ${existingSessionId} to ${workerId}`);
                        
                        return {
                            success: true,
                            sessionId: existingSessionId,
                            workerId,
                            reconnected: true,
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
                console.log(`[SessionManager] ⚠️ Socket ${socketId} already has session ${sessId}`);
                return {
                    success: true,
                    sessionId: sessId,
                    workerId: session.workerId,
                    message: 'Using existing session'
                };
            }
        }
        
        // Get available worker
        const workerId = this.getAvailableWorker();
        
        if (!workerId) {
            const status = this.getStatus();
            console.log(`[SessionManager] ❌ All workers busy (${status.busy}/${status.total})`);
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
        
        console.log(`[SessionManager] ✅ Created session ${sessionId} on ${workerId}`);
        console.log(`[SessionManager]    Video: ${videoUrl}`);
        console.log(`[SessionManager]    Status: ${this.getStatus().available}/${MAX_WORKERS} available`);
        
        return {
            success: true,
            sessionId,
            workerId,
            message: 'Session created'
        };
    }
    
    /**
     * End a session and release worker
     * @param {string} sessionId - Session ID to end
     * @param {string} reason - Reason for ending (user_action, video_ended, disconnect, timeout)
     */
    endSession(sessionId, reason = 'user_action') {
        const session = this.sessions.get(sessionId);
        
        if (!session) {
            console.log(`[SessionManager] ⚠️ Session ${sessionId} not found`);
            return false;
        }
        
        const { workerId } = session;
        const worker = this.workers.get(workerId);
        
        if (worker) {
            worker.sessionId = null;
            worker.status = 'idle';
            worker.videoUrl = null;
            worker.assignedAt = null;
        }
        
        this.sessions.delete(sessionId);
        this.pendingReconnect.delete(sessionId);
        
        console.log(`[SessionManager] 🛑 Ended session ${sessionId} (${reason})`);
        console.log(`[SessionManager]    Released ${workerId}`);
        console.log(`[SessionManager]    Status: ${this.getStatus().available}/${MAX_WORKERS} available`);
        
        return true;
    }
    
    /**
     * Handle socket disconnect - move to pending reconnect
     * @param {string} socketId - Disconnected socket ID
     */
    handleDisconnect(socketId) {
        for (const [sessionId, session] of this.sessions) {
            if (session.socketId === socketId) {
                console.log(`[SessionManager] 📴 Socket disconnected for session ${sessionId}`);
                
                // Move to pending reconnect
                this.pendingReconnect.set(sessionId, {
                    workerId: session.workerId,
                    videoUrl: session.videoUrl,
                    createdAt: session.createdAt,
                    disconnectedAt: Date.now()
                });
                
                // Keep worker reserved but mark session as pending
                this.sessions.delete(sessionId);
                
                console.log(`[SessionManager]    Waiting for reconnect (5 min window)`);
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
        let cleaned = 0;
        
        for (const [sessionId, pending] of this.pendingReconnect) {
            if (now - pending.disconnectedAt > RECONNECT_WINDOW_MS) {
                // Release the worker
                const worker = this.workers.get(pending.workerId);
                if (worker && worker.sessionId === sessionId) {
                    worker.sessionId = null;
                    worker.status = 'idle';
                    worker.videoUrl = null;
                    worker.assignedAt = null;
                }
                
                this.pendingReconnect.delete(sessionId);
                cleaned++;
                console.log(`[SessionManager] 🧹 Cleaned expired session ${sessionId}`);
            }
        }
        
        if (cleaned > 0) {
            console.log(`[SessionManager]    Status: ${this.getStatus().available}/${MAX_WORKERS} available`);
        }
    }
    
    /**
     * Update session activity timestamp
     * @param {string} sessionId - Session ID
     */
    updateActivity(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
        }
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
    registerPythonWorker(workerId, socketId) {
        const worker = this.workers.get(workerId);
        if (worker) {
            worker.pythonSocketId = socketId;
            console.log(`[SessionManager] 🐍 Python worker ${workerId} registered (socket: ${socketId})`);
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
                worker.status = worker.sessionId ? 'busy' : 'idle';
                console.log(`[SessionManager] 🐍 Python worker ${workerId} unregistered`);
                
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
const sessionManager = new SessionManager();

module.exports = { sessionManager, SessionManager };
