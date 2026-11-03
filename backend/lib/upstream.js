function createUpstreamPost(client, baseUrl, timeout = 5000) {
    return async (path, body) => {
        const response = await client.post(`${baseUrl}${path}`, body, { timeout });
        if (response.data?.success === false || response.data?.status === 'error') {
            throw new Error('Upstream service rejected the request');
        }
        return response;
    };
}

function serializeByVideo(post) {
    const tails = new Map();
    return (path, body) => {
        const key = body.videoUrl || '__global__';
        const task = (tails.get(key) || Promise.resolve()).catch(() => {}).then(() => post(path, body));
        tails.set(key, task);
        const release = () => { if (tails.get(key) === task) tails.delete(key); };
        task.then(release, release);
        return task;
    };
}

module.exports = { createUpstreamPost, serializeByVideo };
