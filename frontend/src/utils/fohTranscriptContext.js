export const TRANSCRIPT_CONTEXT_CHUNKS = 3
export const MAX_TRANSCRIPT_CONTEXT_LENGTH = 1200

export function addTranscriptContext(history, transcript) {
  const next = Array.isArray(history) ? history.slice(-TRANSCRIPT_CONTEXT_CHUNKS) : []
  const value = typeof transcript === 'string' ? transcript.trim() : ''
  if (value) next.push(value)
  return next.slice(-TRANSCRIPT_CONTEXT_CHUNKS)
}

export function formatTranscriptContext(history) {
  let text = (Array.isArray(history) ? history : []).filter(value => typeof value === 'string' && value.trim()).join('\n')
  if (text.length > MAX_TRANSCRIPT_CONTEXT_LENGTH) text = text.slice(-MAX_TRANSCRIPT_CONTEXT_LENGTH)
  return text
}

export function encodeTranscriptContext(value) {
  const bytes = new TextEncoder().encode(String(value || ''))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function decodeTranscriptContext(value) {
  try {
    const binary = atob(String(value || ''))
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch { return '' }
}
