import { describe, expect, it } from 'vitest'
import { buildLanguageOutputUrl, parseSubtitleColor } from '@/utils/fohOutput'

describe('FOH language output URLs', () => {
  it('keeps each language on its own stream key and carries the chosen text color', () => {
    expect(buildLanguageOutputUrl('http://localhost:5174', '/foh-output/show-jawa', 'jawa', '#ffe082'))
      .toBe('http://localhost:5174/foh-output/show-jawa?bg=transparent&lang=jawa&size=xl&align=bottom&color=%23ffe082')
  })

  it('adds an explicitly selected history count without altering other parameters', () => {
    for (const count of [1, 2, 3]) {
      const url = new URL(buildLanguageOutputUrl('http://localhost:5174', '/foh-output/show-jawa', 'jawa', '#ffe082', count))
      expect(url.searchParams.get('history')).toBe(String(count))
      expect(url.searchParams.get('color')).toBe('#ffe082')
      expect(url.searchParams.get('lang')).toBe('jawa')
    }
  })

  it('accepts safe hex and named colors while rejecting arbitrary CSS', () => {
    expect(parseSubtitleColor('#abc')).toBe('#abc')
    expect(parseSubtitleColor('gold')).toBe('#ffd700')
    expect(parseSubtitleColor('red;position:fixed')).toBe('#ffffff')
  })
})
