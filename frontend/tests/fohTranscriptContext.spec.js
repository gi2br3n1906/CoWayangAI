import { describe, expect, it } from 'vitest'
import { addTranscriptContext, encodeTranscriptContext, formatTranscriptContext } from '@/utils/fohTranscriptContext'

describe('FOH rolling transcript context', () => {
  it('keeps only the latest three nonempty transcript chunks', () => {
    expect(addTranscriptContext(['a', 'b', 'c'], 'd')).toEqual(['b', 'c', 'd'])
    expect(addTranscriptContext(['a'], '  ')).toEqual(['a'])
  })

  it('bounds context from the end so the newest words are preserved', () => {
    const context = formatTranscriptContext(['older '.repeat(200), 'newest words'])
    expect(context.length).toBeLessThanOrEqual(1200)
    expect(context.endsWith('newest words')).toBe(true)
  })

  it('encodes Javanese text as an ASCII-safe header value', () => {
    const encoded = encodeTranscriptContext('Sumantri: ꦱꦸꦩꦤ꧀ꦠꦿꦶ')
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe('Sumantri: ꦱꦸꦩꦤ꧀ꦠꦿꦶ')
  })
})
