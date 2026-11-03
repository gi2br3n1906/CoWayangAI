import { describe, it, expect } from 'vitest'
import { getYouTubeVideoId, parseTimeToSeconds, normalizeSubtitle } from '../src/utils/video.js'
describe('video input validation', () => {
 it('accepts canonical YouTube URL variants', () => {
  for (const url of ['https://youtube.com/watch?v=aOtB-yw9GSE', 'https://youtu.be/aOtB-yw9GSE', 'https://www.youtube.com/live/aOtB-yw9GSE', 'https://youtube.com/shorts/aOtB-yw9GSE']) expect(getYouTubeVideoId(url)).toBe('aOtB-yw9GSE')
 })
 it('rejects spoofed hosts, credentials, schemes and malformed IDs', () => {
  for (const url of ['https://evil.test/watch?v=aOtB-yw9GSE', 'https://youtube.com.evil.test/watch?v=aOtB-yw9GSE', 'https://user@youtube.com/watch?v=aOtB-yw9GSE', 'ftp://youtube.com/watch?v=aOtB-yw9GSE', 'https://youtu.be/!!!!!!!!!!!']) expect(getYouTubeVideoId(url)).toBeNull()
 })
 it('preserves seconds and validates timestamp segments', () => {
  expect(parseTimeToSeconds('1:02:03')).toBe(3723)
  expect(parseTimeToSeconds('02:30')).toBe(150)
  expect(parseTimeToSeconds(75)).toBe(75)
  for (const value of ['2:90', '-1', 'banana', '1:2:3:4']) expect(() => parseTimeToSeconds(value)).toThrow()
 })
 it('preserves zero subtitle timestamp and rejects invalid input', () => {
  expect(normalizeSubtitle({ text: 'dialog', start_time: 0, end_time: 4, timestamp: '01:00' }).start_time).toBe(0)
  expect(normalizeSubtitle({ text: 'bad', start_time: -1 })).toBeNull()
 })
 it('preserves fractional ASR timestamps instead of dropping valid subtitles', () => {
  expect(normalizeSubtitle({ text: 'dialog', start_time: 12.5, end_time: 18.75 })).toMatchObject({ start_time: 12.5, end_time: 18.75 })
  expect(parseTimeToSeconds('1:02.5')).toBe(62.5)
  expect(parseTimeToSeconds('1:02:03.25')).toBe(3723.25)
  for (const value of ['1.5:20', '0:60', Infinity, NaN, '1e5']) expect(() => parseTimeToSeconds(value)).toThrow()
 })
})
