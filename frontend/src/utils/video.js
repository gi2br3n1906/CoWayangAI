const hosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'])
export function getYouTubeVideoId(value) {
 try {
  const url = new URL(String(value).trim())
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
  let id = null
  if (url.hostname === 'youtu.be') id = url.pathname.split('/')[1]
  else if (hosts.has(url.hostname)) {
   if (url.pathname === '/watch') id = url.searchParams.get('v')
   else if (/^\/(embed|live|shorts|v)\//.test(url.pathname)) id = url.pathname.split('/')[2]
  }
  return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null
 } catch { return null }
}
export function parseTimeToSeconds(value) {
 if (value == null || value === '') return 0
 const parts = String(value).trim().split(':')
 if (parts.length > 3 || parts.some((part, index) => !(index === parts.length - 1 ? /^\d+(?:\.\d+)?$/ : /^\d+$/).test(part)) || parts.slice(1).some(part => Number(part) >= 60)) throw new Error('Gunakan waktu mulai dalam detik atau format HH:MM:SS.')
 const seconds = parts.reduce((time, part) => time * 60 + Number(part), 0)
 if (!Number.isFinite(seconds) || seconds > Number.MAX_SAFE_INTEGER) throw new Error('Waktu mulai terlalu besar.')
 return seconds
}
export function normalizeSubtitle(data) {
 if (!data || typeof data.text !== 'string') return null
 try {
  const start = parseTimeToSeconds(data.start_time ?? data.timestamp ?? 0)
  const end = parseTimeToSeconds(data.end_time ?? start + 4)
  if (end < start) return null
  const id = `${start}:${end}:${data.text}`
  return { ...data, id, start_time: start, end_time: end, receivedAt: Date.now() }
 } catch { return null }
}
