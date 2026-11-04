// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { api } from '@/services/api'
import { describe, it, expect, vi } from 'vitest'
import FohScriptPreview from '@/components/FohScriptPreview.vue'

vi.mock('@/services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/firebase', () => ({ auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('firebase-token') } } }))

const index = { id: 'play', revision: 'v1', cues: [
  { id: 'a', order: 1, act: 1, kind: 'dialog', text: 'first line', page: 1 },
  { id: 'b', order: 2, act: 1, kind: 'dialog', text: 'second line', page: 1 },
] }
const props = { streamKey: 'stage / 1', uploadToken: 'secret', selectedModel: 'test-model' }
const noScriptCatalog = () => api.get.mockResolvedValue({ data: { scripts: [] } })
async function audio(wrapper, file = new File(['s'.repeat(128)], 'voice.wav', { type: 'audio/wav' })) {
  const input = wrapper.get('[data-test="audio"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
}

describe('FOH script shadow preview', () => {
  it('authenticates script catalog and script detail requests', async () => {
    api.get.mockReset()
      .mockResolvedValueOnce({ data: { scripts: [{ id:'play', title:'Lakon', cueCount:2 }] } })
      .mockResolvedValueOnce({ data: index })
    const wrapper = mount(FohScriptPreview, { props })
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/foh-scripts', { headers:{ Authorization:'Bearer firebase-token' } }))
    await wrapper.get('[data-test="script-catalog"]').setValue('play')
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/foh-scripts/play', { headers:{ Authorization:'Bearer firebase-token' } }))
    await flushPromises()
    expect(JSON.parse(wrapper.get('[data-test="index"]').element.value)).toEqual(index)
    wrapper.unmount()
  })

  it('sends only on preview with a selected cue and renders the result', async () => {
    noScriptCatalog()
    api.post.mockReset().mockResolvedValue({ data: { status: 'matched', cue: index.cues[1], subtitle: { jawa: 'second line', indonesia: 'baris kedua' } } })
    const wrapper = mount(FohScriptPreview, { props })
    await wrapper.get('[data-test="index"]').setValue(JSON.stringify(index))
    await wrapper.get('[data-test="cue"]').setValue('b')
    await audio(wrapper)
    expect(api.post).not.toHaveBeenCalled()
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    await flushPromises()
    const [url, body, options] = api.post.mock.calls[0]
    expect(url).toBe('/api/foh-stream/stage%20%2F%201/script-preview')
    expect(options.headers['x-foh-token']).toBe('secret')
    expect(options.headers.Authorization).toBe('Bearer firebase-token')
    expect(body).toMatchObject({ index, cursor: { scriptId: 'play', scriptRevision: 'v1', revision: 0, act: 1, cueId: 'b', mode: 'auto' }, audioBase64: btoa('s'.repeat(128)), mimeType: 'audio/wav', model: 'test-model' })
    expect(body.config).toEqual({ lookBehind: 1, lookAhead: 2, boundarySize: 1, nextActSize: 1, minScore: 0.7, minMargin: 0.2 })
    expect(wrapper.text()).toContain('matched')
    expect(wrapper.text()).toContain('baris kedua')
    expect(wrapper.text()).toContain('second line')
    expect(wrapper.html()).not.toContain('secret')
    expect(wrapper.emitted('preview')).toBeUndefined()
  })
  it('shows a raw text preview for each act and saves that act starting cue explicitly', async () => {
    noScriptCatalog()
    api.post.mockReset().mockResolvedValue({ data: { cursor: { scriptId:'play', scriptRevision:'v1', act:2, cueId:'c', mode:'manual', revision:1 } } })
    const multiAct = { ...index, cues:[...index.cues,
      { id:'c', order:3, act:2, kind:'dialog', text:'raw act two, opening\n', page:4 },
      { id:'d', order:4, act:2, kind:'dialog', text:'raw act two, ending\n', page:5 },
    ] }
    const wrapper = mount(FohScriptPreview, { props })
    await wrapper.get('[data-test="index"]').setValue(JSON.stringify(multiAct))
    expect(wrapper.find('[data-test="act-button-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="act-button-2"]').exists()).toBe(true)
    await wrapper.get('[data-test="act-button-2"]').trigger('click')
    expect(wrapper.get('[data-test="act-range"]').text()).toContain('c → d')
    expect(wrapper.get('[data-test="act-raw-text"]').element.textContent).toBe('raw act two, opening\nraw act two, ending\n')
    expect(wrapper.get('[data-test="cue"]').element.value).toBe('c')
    expect(api.post).not.toHaveBeenCalled()
    await wrapper.get('[data-test="save-position"]').trigger('click')
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1]).toMatchObject({ action:'seek', cueId:'c' })
    wrapper.unmount()
  })
  it('does not send audio if the session changes while the file is being read', async () => {
    noScriptCatalog()
    api.post.mockReset()
    const original = FileReader.prototype.readAsDataURL
    let finish
    FileReader.prototype.readAsDataURL = function () { finish = () => { Object.defineProperty(this, 'result', { value: 'data:audio/wav;base64,c291bmQ=' }); this.onload() } }
    try {
      const wrapper = mount(FohScriptPreview, { props })
      await wrapper.get('[data-test="index"]').setValue(JSON.stringify(index))
      await audio(wrapper)
      await wrapper.get('form').trigger('submit')
      await wrapper.setProps({ streamKey: 'different', uploadToken: 'new-token' })
      finish()
      await flushPromises()
      expect(api.post).not.toHaveBeenCalled()
    } finally { FileReader.prototype.readAsDataURL = original }
  })
  it('shows backend errors without disclosing the upload token', async () => {
    noScriptCatalog()
    api.post.mockReset().mockRejectedValue({ response: { data: { error: 'Invalid credentials secret' } } })
    const wrapper = mount(FohScriptPreview, { props })
    await wrapper.get('[data-test="index"]').setValue(JSON.stringify(index))
    await audio(wrapper)
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(wrapper.get('[role="alert"]').text()).toBe('Invalid credentials [redacted]')
    expect(wrapper.html()).not.toContain('secret')
  })
  it('uses a matching saved cursor and warns for a different revision', async () => {
    noScriptCatalog()
    api.post.mockReset().mockResolvedValue({ data: { status: 'manual' } })
    const saved = { scriptId: 'play', scriptRevision: 'v1', revision: 4, act: 1, cueId: 'b', mode: 'manual' }
    const wrapper = mount(FohScriptPreview, { props: { ...props, scriptCursor: saved } })
    await wrapper.get('[data-test="index"]').setValue(JSON.stringify(index))
    await audio(wrapper)
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][1].cursor).toEqual({ ...saved, mode:'auto' })
    await flushPromises()
    expect(wrapper.text()).toContain('manual')
    await wrapper.setProps({ scriptCursor: { ...saved, scriptRevision: 'old' } })
    expect(wrapper.text()).toMatch(/cursor does not match/i)
  })
  it('rejects oversize and invalid inputs without sending', async () => {
    noScriptCatalog()
    api.post.mockReset()
    const wrapper = mount(FohScriptPreview, { props })
    await wrapper.get('[data-test="index"]').setValue('{bad json')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toMatch(/valid reviewed/i)
    await wrapper.get('[data-test="index"]').setValue(JSON.stringify(index))
    await audio(wrapper, new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.wav'))
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toMatch(/at most 8 MB/i)
    await audio(wrapper)
    await wrapper.get('[data-test="minScore"]').setValue('1.5')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toMatch(/thresholds/i)
    expect(api.post).not.toHaveBeenCalled()
  })
  it('warns when no reviewed index is loaded and does not send audio', () => {
    noScriptCatalog()
    const wrapper = mount(FohScriptPreview, { props: { streamKey: 'stage', uploadToken: 'secret', selectedModel: 'model' } })
    expect(wrapper.text()).toMatch(/valid script index/i)
    expect(wrapper.text()).toMatch(/shadow/i)
    expect(wrapper.html()).not.toContain('secret')
  })

  it('loads an index JSON file and warns if it is provisional', async () => {
    noScriptCatalog()
    const wrapper = mount(FohScriptPreview, { props })
    const file = new File([JSON.stringify({ ...index, reviewRequired:true })], 'script.json', { type:'application/json' })
    const input = wrapper.get('[data-test="index-file"]')
    Object.defineProperty(input.element, 'files', { configurable:true, value:[file] })
    await input.trigger('change')
    await vi.waitFor(() => expect(wrapper.find('[data-test="cue"]').exists()).toBe(true))
    expect(wrapper.text()).toMatch(/cue diambil dari teks dokumen/i)
    wrapper.unmount()
  })

  it('saves an operator-selected position without triggering model preview', async () => {
    noScriptCatalog()
    const cursor = { scriptId:'play', scriptRevision:'v1', act:1, cueId:'b', offset:0, mode:'manual', revision:1 }
    api.post.mockReset().mockResolvedValue({data:{cursor}})
    const wrapper = mount(FohScriptPreview, { props })
    await wrapper.get('[data-test="index"]').setValue(JSON.stringify(index))
    await wrapper.get('[data-test="cue"]').setValue('b')
    await wrapper.get('[data-test="save-position"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('cursorChanged')).toBeTruthy())
    const [url,body,options] = api.post.mock.calls[0]
    expect(url).toBe('/api/foh-stream/stage%20%2F%201/script-position')
    expect(body).toEqual({ index, expectedRevision:0, action:'seek', cueId:'b' })
    expect(options.headers['x-foh-token']).toBe('secret')
    expect(wrapper.emitted('cursorChanged')[0]).toEqual([cursor])
    wrapper.unmount()
  })

  it('rejects files smaller than the backend audio minimum before calling Gemini', async () => {
    api.post.mockReset()
    const wrapper = mount(FohScriptPreview, { props })
    await wrapper.get('[data-test="index"]').setValue(JSON.stringify(index))
    await audio(wrapper, new File(['tiny'], 'tiny.wav', { type:'audio/wav' }))
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toMatch(/128/)
    expect(api.post).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reloads the saved cursor when another operator wins a save race', async () => {
    const cursor={ scriptId:'play',scriptRevision:'v1',act:1,cueId:'a',mode:'manual',revision:2 }
    api.post.mockReset().mockRejectedValue({response:{status:409,data:{error:'position changed'}}})
    api.get.mockReset().mockResolvedValue({data:{scripts:[]}})
    const wrapper=mount(FohScriptPreview,{props})
    await vi.waitFor(()=>expect(api.get).toHaveBeenCalledWith('/api/foh-scripts',{headers:{Authorization:'Bearer firebase-token'}}))
    await flushPromises()
    api.get.mockResolvedValue({data:{cursor}})
    await wrapper.get('[data-test="index"]').setValue(JSON.stringify(index))
    await wrapper.get('[data-test="save-position"]').trigger('click')
    await vi.waitFor(()=>expect(wrapper.emitted('cursorChanged')).toBeTruthy())
    expect(api.get.mock.calls.map(call=>call[0])).toContain('/api/foh-stream/stage%20%2F%201/script-position')
    expect(wrapper.emitted('cursorChanged')[0]).toEqual([cursor])
    expect(wrapper.get('[role="alert"]').text()).toMatch(/posisi.*diperbarui/i)
    wrapper.unmount()
  })

  it('keeps the latest selected index when older file reads finish first', async () => {
    noScriptCatalog()
    const original = FileReader.prototype.readAsText, reads=[]
    FileReader.prototype.readAsText = function(file) { reads.push({ reader:this, file }) }
    try {
      const wrapper=mount(FohScriptPreview,{props})
      const input=wrapper.get('[data-test="index-file"]')
      Object.defineProperty(input.element,'files',{configurable:true,value:[new File(['a'],'a.json')]}); await input.trigger('change')
      Object.defineProperty(input.element,'files',{configurable:true,value:[new File(['b'],'b.json')]}); await input.trigger('change')
      Object.defineProperty(reads[0].reader,'result',{value:JSON.stringify({...index,id:'older'})}); reads[0].reader.onload()
      Object.defineProperty(reads[1].reader,'result',{value:JSON.stringify({...index,id:'newer'})}); reads[1].reader.onload()
      await flushPromises()
      expect(JSON.parse(wrapper.get('[data-test="index"]').element.value).id).toBe('newer')
      wrapper.unmount()
    } finally { FileReader.prototype.readAsText=original }
  })

  it('requires explicit confirmation to replace the saved script', async () => {
    noScriptCatalog()
    const old={scriptId:'old',scriptRevision:'v1',act:1,cueId:'x',mode:'manual',revision:5}
    const replacement={scriptId:'play',scriptRevision:'v1',act:1,cueId:'a',mode:'manual',revision:6}
    const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    api.post.mockReset().mockResolvedValue({data:{cursor:replacement}})
    try {
      const wrapper=mount(FohScriptPreview,{props:{...props,scriptCursor:old}})
      await wrapper.get('[data-test="index"]').setValue(JSON.stringify(index))
      await wrapper.get('[data-test="replace-script"]').trigger('click');expect(api.post).not.toHaveBeenCalled()
      await wrapper.get('[data-test="replace-script"]').trigger('click')
      await vi.waitFor(()=>expect(wrapper.emitted('cursorChanged')).toBeTruthy())
      expect(api.post.mock.calls[0][1]).toMatchObject({action:'replace',expectedRevision:5,cueId:'a'})
      wrapper.unmount()
    } finally { confirm.mockRestore() }
  })
})
