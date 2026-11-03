const assert = require('node:assert/strict');

// Minimal real Socket.IO client over Engine.IO websocket, no new dependencies.
async function connect(t, base) {
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket');
    const queued = [];
    const waiting = new Map();
    const deliver = (name, data) => {
        const waiters = waiting.get(name);
        if (waiters?.length) waiters.shift()(data);
        else queued.push({ name, data });
    };
    socket.addEventListener('message', event => {
        const packet = String(event.data);
        if (packet.startsWith('0')) socket.send('40');
        else if (packet === '2') socket.send('3');
        else if (packet.startsWith('40')) deliver('connect', JSON.parse(packet.slice(2)));
        else if (packet.startsWith('42')) {
            const [name, data] = JSON.parse(packet.slice(2));
            deliver(name, data);
        } else if (packet.startsWith('43')) {
            const index = packet.indexOf('[');
            deliver(`ack:${packet.slice(2, index)}`, JSON.parse(packet.slice(index))[0]);
        }
    });
    function next(name, timeout = 1500) {
        const index = queued.findIndex(item => item.name === name);
        if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0].data);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`No ${name} received`)), timeout);
            const callback = data => { clearTimeout(timer); resolve(data); };
            const waiters = waiting.get(name) || [];
            waiters.push(callback);
            waiting.set(name, waiters);
        });
    }
    const info = await next('connect');
    let ackId = 0;
    const client = {
        id: info.sid, next,
        send(name, data = {}) { socket.send('42' + JSON.stringify([name, data])); },
        async request(name, data = {}) {
            const id = ++ackId;
            socket.send(`42${id}` + JSON.stringify([name, data]));
            return next(`ack:${id}`);
        },
        async close() {
            if (socket.readyState === WebSocket.CLOSED) return;
            const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
            socket.close();
            await closed;
        }
    };
    t.after(() => client.close());
    assert.ok(client.id);
    return client;
}

module.exports = { connect };
