// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import FohAdminView from '@/views/FohAdminView.vue'
import { api } from '@/services/api'
vi.mock('@/services/api', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('@/firebase', () => ({ auth: { currentUser: null } }))

describe('FOH admin script preview integration', () => {
 it('shows restored cursor in preview only after a stream is active', async () => {
  const cursor = { scriptId:'s', scriptRevision:'v1', act:2, cueId:'cue2', offset:0, mode:'manual', revision:3 }
  Object.defineProperty(navigator, 'mediaDevices', { configurable:true, value:{ enumerateDevices:vi.fn().mockResolvedValue([]) } })
  api.get.mockResolvedValue({data:{streams:[]}})
  api.post.mockResolvedValue({data:{streamKey:'stage',uploadToken:'private-token',scriptCursor:cursor}})
  const wrapper=mount(FohAdminView, { global:{ stubs:{ FohScriptPreview:{ name:'FohScriptPreview', props:['streamKey','uploadToken','selectedModel','scriptCursor'], template:'<section data-test="script-preview">Preview</section>' } } } })
  await flushPromises()
  expect(wrapper.find('[data-test="script-preview"]').exists()).toBe(false)
  await wrapper.find('form').trigger('submit'); await flushPromises()
  const preview=wrapper.findComponent({name:'FohScriptPreview'})
  expect(preview.exists()).toBe(true)
  expect(preview.props()).toMatchObject({streamKey:'stage',uploadToken:'private-token',selectedModel:'gemini-3.5-flash-lite',scriptCursor:cursor})
  expect(wrapper.html()).not.toContain('private-token')
  wrapper.unmount(); delete navigator.mediaDevices
 })

 it('does not rotate a session twice when create is triggered concurrently', async () => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable:true, value:{ enumerateDevices:vi.fn().mockResolvedValue([]) } })
  api.get.mockResolvedValue({data:{streams:[]}})
  let resolve; api.post.mockReset().mockImplementation(()=>new Promise(done=>{resolve=done}))
  const wrapper=mount(FohAdminView,{global:{stubs:{FohScriptPreview:true}}}); await flushPromises()
  const first=wrapper.vm.createSession(); const second=wrapper.vm.createSession()
  expect(api.post).toHaveBeenCalledTimes(1)
  resolve({data:{streamKey:'stage',uploadToken:'token'}})
  await Promise.all([first,second]); await flushPromises()
  wrapper.unmount(); delete navigator.mediaDevices
 })
})
