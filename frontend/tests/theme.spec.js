import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
const css = readFileSync('src/assets/main.css', 'utf8')
const root = css.match(/:root\s*\{([^}]+)\}/)[1]
const token = name => root.match(new RegExp(`--${name}:\\s*(#[a-fA-F0-9]{6})`))?.[1].toUpperCase()
function luminance(hex) {
 const channels = hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
 return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
describe('deep maroon theme', () => {
 it('uses semantic wine tokens and dark color scheme', () => {
  for (const [name, value] of Object.entries({ canvas: '#1F070E', sidebar: '#300C18', panel: '#3A0F1D', text: '#FFFFFF', muted: '#D4B5BC', primary: '#C43859', gold: '#F1C46B' })) expect(token(name), name).toBe(value)
  expect(root).toContain('color-scheme: dark')
  expect(root).toContain('--cream: var(--text)')
 })
 it('meets AA text contrast and retains a dark video surface', () => {
  for (const surface of ['canvas', 'sidebar', 'panel']) {
   for (const text of ['text', 'muted']) expect(contrast(token(text), token(surface)), `${text}/${surface}`).toBeGreaterThanOrEqual(4.5)
  }
  expect(contrast(token('on-primary'), token('primary'))).toBeGreaterThanOrEqual(4.5)
  expect(root).toContain('--player-bg: #080609')
 })
})
