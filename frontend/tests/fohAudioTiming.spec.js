import { describe, expect, it } from 'vitest'
import { MAX_UTTERANCE_MS, shouldCutUtterance } from '@/utils/fohAudioTiming'

describe('FOH audio timing', () => {
  it('cuts a continuous utterance at six seconds', () => {
    expect(MAX_UTTERANCE_MS).toBe(6000)
    expect(shouldCutUtterance(5999)).toBe(false)
    expect(shouldCutUtterance(6000)).toBe(true)
    expect(shouldCutUtterance(8000)).toBe(true)
  })
})
