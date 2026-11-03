class InputError extends Error {
    constructor(message) { super(message); this.statusCode = 400; }
}

// Public time values are seconds, or MM:SS / HH:MM:SS (fractional seconds allowed).
function seconds(value = 0) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$|^\d+:\d{1,2}(?:\.\d+)?$|^\d+:\d{1,2}:\d{1,2}(?:\.\d+)?$/.test(value)) {
        throw new InputError('Time must be non-negative seconds or MM:SS / HH:MM:SS');
    }
    const parts = value.split(':').map(Number);
    if (parts.length > 1 && parts.slice(1).some(part => part >= 60)) throw new InputError('Clock minutes and seconds must be below 60');
    const result = parts.reduce((total, part) => total * 60 + part, 0);
    if (!Number.isFinite(result)) throw new InputError('Time must be finite');
    return result;
}

function analysisStart(body) {
    if (body.startTime !== undefined) return seconds(body.startTime);
    if (body.startMinute === undefined) return 0;
    if (typeof body.startMinute !== 'number' && (typeof body.startMinute !== 'string' || !/^\d+(?:\.\d+)?$/.test(body.startMinute))) {
        throw new InputError('startMinute must be a non-negative number');
    }
    return seconds(Number(body.startMinute) * 60);
}

const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
function videoUrl(value) {
    if (typeof value !== 'string' || !value || value.length > 4096 || value !== value.trim()) throw new InputError('Use a valid YouTube video URL');
    if (/^(camera|mic):\/\/[0-9]+$/.test(value)) return value;
    let parsed;
    try { parsed = new URL(value); } catch { throw new InputError('Use a valid YouTube video URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port) throw new InputError('Use a valid YouTube video URL');
    let id;
    if (parsed.hostname === 'youtu.be') id = parsed.pathname.split('/')[1];
    else if (youtubeHosts.has(parsed.hostname)) {
        if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
        else if (/^\/(embed|live|shorts|v)\//.test(parsed.pathname)) id = parsed.pathname.split('/')[2];
    }
    if (!/^[a-zA-Z0-9_-]{11}$/.test(id || '')) throw new InputError('Use a valid YouTube video URL');
    return value;
}

function language(value = 'id') {
    if (!['id', 'en'].includes(value)) throw new InputError('Use language id or en');
    return value;
}

module.exports = { InputError, seconds, analysisStart, videoUrl, language };
