import { describe, expect, it } from 'vitest'
import { MAX_UTTERANCE_MS, shouldCutUtterance } from '@/utils/fohAudioTiming'

describe('FOH audio timing', () => {
  it('cuts a continuous utterance at four seconds', () => {
    expect(MAX_UTTERANCE_MS).toBe(4000)
    expect(shouldCutUtterance(3999)).toBe(false)
    expect(shouldCutUtterance(4000)).toBe(true)
    expect(shouldCutUtterance(6000)).toBe(true)
  })
})
