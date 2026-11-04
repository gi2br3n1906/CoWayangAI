// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import FohAdminView from '@/views/FohAdminView.vue'

vi.mock('@/services/api', () => ({ api: {
  get: vi.fn().mockResolvedValue({ data: { streams: [] } }),
  post: vi.fn().mockResolvedValue({ data: { streamKey: 'stage', uploadToken: 'private-token' } }),
  delete: vi.fn(),
} }))

describe('FOH admin output history', () => {
  it('generates new per-language links with selectable history without exposing the token', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: vi.fn().mockResolvedValue([]) } })
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mount(FohAdminView)
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const selector = wrapper.get('select[aria-describedby="foh-history-notice"]')
    expect(selector.element.value).toBe('2')
    const links = () => wrapper.findAll('.foh-language-card input[readonly]').map(input => input.element.value)
    expect(links()).toHaveLength(3)
    expect(links().map(link => new URL(link).searchParams.get('history'))).toEqual(['2', '2', '2'])
    const previous = links()[0]
    await wrapper.find('.foh-language-card button').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith(previous)
    for (const count of ['1', '3']) {
      await selector.setValue(count)
      expect(links().map(link => new URL(link).searchParams.get('history'))).toEqual([count, count, count])
    }
    expect(new URL(previous).searchParams.get('history')).toBe('2')
    expect(wrapper.get('#foh-history-notice').text()).toMatch(/salin.*link.*baru/i)
    expect(wrapper.html()).not.toContain('private-token')
    expect(links().join()).not.toContain('private-token')
    wrapper.unmount()
  })
})
