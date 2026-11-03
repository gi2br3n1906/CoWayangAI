import { it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LiveTranscription from '../src/components/LiveTranscription.vue'
it('scrolls the subtitle panel only once when the active subtitle changes', async () => {
 const outsideScroll = vi.fn(), insideScroll = vi.fn()
 Element.prototype.scrollIntoView = outsideScroll
 Element.prototype.scrollTo = insideScroll
 const subtitles = [{ id: 'first', timestamp: '00:00', start_time: 0, end_time: 4, text: 'Dialog pertama', isCurrent: true }]
 const wrapper = mount(LiveTranscription, { props: { subtitles, currentTime: 1 } })
 await wrapper.setProps({ currentTime: 2 })
 expect(outsideScroll).not.toHaveBeenCalled()
 expect(insideScroll.mock.calls.length).toBeLessThanOrEqual(1)
 wrapper.unmount()
})
