# Node session lifecycle and API contract

## Running and testing

- `npm start` starts the HTTP/Socket.IO server. `PORT` defaults to `3000`; `PORT=0` selects an ephemeral port.
- Importing `backend/index.js` exports `createBackend`, `app`, `server`, `io`, `sessionManager`, `start`, and `shutdown` without listening, spawning Python, loading dotenv, or installing signal handlers.
- `createBackend({ autoSpawn: false, cleanupIntervalMs: 0 })` is suitable for integration tests. Tests exercise real local HTTP and Socket.IO WebSocket connections with local upstream service fixtures. Python processes are injected test doubles, not real ASR inference.
- `npm test` runs `node --test tests/*.test.js`. The dependency-free WebSocket test client needs Node 22 or newer; this audit was executed with Node 26.7.0.
- Local Python paths are relative to the repository by default, or configurable with `PYTHON_BACKEND_DIR` and `PYTHON_EXECUTABLE`. `AUTO_START_PYTHON=false` and `AUTO_START_ASR=false` retain external-service operation. Missing scripts are skipped with a warning rather than retried forever.
- `shutdown()` is idempotent: disallows new HTTP commands, disposes reservations/timers, cancels child restart timers immediately, drains Socket.IO ASR operations, stops the compatibility HTTP ASR selection, terminates owned children with bounded escalation, and closes HTTP/Socket.IO even when child termination fails. Failures are not reported as successful shutdown.

## HTTP contract (no socket ID required)

All existing ASR HTTP routes remain unauthenticated compatibility endpoints. **They do not require `socketId` or `sessionId`, including `/api/stop-asr` with `{}`.** A REST client's Socket.IO connection state is not a prerequisite. This preserves existing frontend calls but is not a multi-user ownership guarantee.

- `/api/analyze`: `{ videoUrl, startTime?, startMinute?, targetLanguage? }`. Explicit `startTime` takes precedence; `startMinute` remains a decimal minute fallback. Optional AI failure still allows ASR-only success and is exposed as `pythonAvailable: false`.
- `/api/start-asr`: `{ videoUrl, startTime?, targetLanguage? }`.
- `/api/update-asr-time`: `{ startTime?, targetLanguage? }` applies to the compatibility selection; returns 400 if no video is selected.
- `/api/change-language`: `{ targetLanguage }` applies to the same selection.
- `/api/stop-asr`: `{}` stops the compatibility HTTP selection. It is not a scoped stop of the VideoPlayer's separate live-stream session.
- `/api/seek-analysis`: `{ startTime? }` applies to the compatibility selection. It awaits AI stop before restarting AI/ASR; a failed stop aborts restart rather than being swallowed.

Time values accept non-negative numeric seconds, decimal numeric strings, `MM:SS`, or `HH:MM:SS`, including fractional seconds. Clock seconds/minutes after a colon must be below 60. Omitted time defaults to zero; invalid, negative, empty, null, or nonfinite values are rejected. Languages are `id` or `en`. Video URLs must use the YouTube hostname allowlist, HTTP(S), no credentials or non-default port, and a valid 11-character video ID. Whitespace is rejected rather than repaired at the API boundary.

ASR commands are awaited. Success remains `{ status: 'success', ... }`; invalid input is HTTP 400; command upstream network/HTTP/application-level failure is HTTP 502 with `{ status: 'error', message }`; new HTTP requests during shutdown receive 503. HTTP 200 upstream bodies with `success: false` or `status: 'error'` are failures. Legacy HTTP ASR operations are serialized, and ASR calls for the same URL are ordered so an in-flight start cannot complete after its stop.

## Socket.IO contract

- `/api/worker-status` and `worker-status-update` retain `total`, `available`, `busy`, `offline`, `pendingReconnect`, `activeSessions`, and `workers` (`id`, `status`, `hasSession`, `hasPython`). `total` is configured capacity (20), not connected capacity. Unregistered workers are offline; only registered idle Python sockets are assignable.
- `register-worker` accepts `{ workerId }`. IDs are `worker-1` through `worker-20`; another live socket cannot replace a registration, and one socket cannot claim multiple worker IDs.
- `start-live-stream` accepts `{ videoUrl, existingSessionId?, currentTime?, startTime?, targetLanguage? }`; currentTime takes precedence over startTime. The assigned Python worker alone receives `start-processing`. There is no fallback broadcast to arbitrary sockets.
- `session-created` preserves existing fields and adds `success` and `shouldStart`. A duplicate request for the same socket/video has `shouldStart: false`; it does not restart Python/ASR. A socket must end its session before changing video.
- Disconnected frontend sessions reserve their worker for five minutes. Reconnecting with the opaque session ID and exactly matching video URL restores the reservation without a second processing start. An active session cannot be taken over by another socket. Expired reservations send targeted stop commands and release capacity; Python worker disconnect invalidates both active and reserved sessions.
- Session IDs are cryptographically random **bearer reconnect capabilities**, not account authentication. Keep them private.
- `end-session`, `stop-live-stream`, `player-time`, `player-seek`, and `player-state` require ownership by the currently connected frontend socket. An omitted session ID resolves only that socket's own session; it never causes a broadcast. The VideoPlayer's separate session socket must send these controls itself; a different application socket does not own it.
- Only the assigned registered Python socket may publish `ai-boxes`, `stream-started`, or `stream-error`. Legacy missing session IDs resolve only to that worker's assignment rather than a global broadcast.
- Socket commands support optional acknowledgement callbacks. Invalid/cross-owner input emits `session-error` with `type` such as `invalid_input`, `forbidden`, or `session_conflict`; no capacity emits `server_full`. ASR failures emit `asr-error` with `sessionId`, `operation`, and a message. AI can continue after an ASR failure: live-start acknowledgement reports `asrStarted: false`, and seek/state acknowledgements report `asrUpdated: false` instead of silently claiming ASR success.

## Remaining risks and limits

1. **Legacy REST analysis/ASR selection is still process-global and unauthenticated.** Another user can change/stop it. REST calls and VideoPlayer sessions can interfere when they use the same URL. Do not interpret `{}` stop as per-user ownership.
2. **ASR identity remains video-URL-based upstream**, not session/account based. Multiple viewers of the same video share ASR controls; ordering prevents races but does not isolate their playback positions/languages. Unrelated client disconnects no longer issue global `stop-all`.
3. **`/api/webhook` is still unauthenticated and broadcasts `ai-result` to all clients.** It requires authentication and session-scoped upstream payloads before safe public multi-user deployment.
4. **Worker registration is not authenticated.** Socket binding prevents replacing an occupied worker but does not establish that the first registrant is a trusted Python process. CORS remains permissive, with no account authentication/rate limiting. Public analysis URLs now have a YouTube allowlist; this is not a substitute for authentication or upstream egress controls.
5. Worker availability means registered Socket.IO presence, not ASR readiness or a completed processing-stop acknowledgement. Separate Python lifecycle regressions test bounded cancellation/replacement with dependency stubs; they do not prove deployed inference readiness. An AI start can remain active upstream when subsequent ASR startup fails; no cross-service transactional rollback is attempted.
6. State and reconnect reservations are in-memory and single-Node-process. Restart loses them; multiple replicas require shared routing/state. Python source is present under `backend-ai/`, but real model startup and cross-service inference were not exercised. The PM2 ASR definition instead points to the unresolved `asrllmserve` gitlink; see the root `CODEBASE_SUMMARY.md` for deployment blockers.
7. Shutdown owns only directly spawned children; descendant process-tree management and external-service AI cleanup are not a distributed process supervisor. Large existing HTTP/frame limits and graceful server draining still require deployment-level timeouts and abuse controls.
