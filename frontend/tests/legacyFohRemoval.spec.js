import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TopNavbar from '../src/components/TopNavbar.vue'

const appRoot = resolve(process.cwd(), '..')

describe('legacy foh scheme removal', () => {
  it('does not expose the removed FOH worker shortcut in the navbar', () => {
    const wrapper = mount(TopNavbar, {
      global: {
        provide: { 'product-locale': ref('id') },
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    })
    expect(wrapper.find('.navbar-foh').exists()).toBe(false)
    wrapper.unmount()
  })

  it('contains no foh:// scheme in runtime source', () => {
    const files = [
      'frontend/src/App.vue',
      'frontend/src/components/VideoPlayer.vue',
      'frontend/src/composables/useAnalysis.js',
      'backend/lib/input.js',
      'backend/sessionManager.js',
      'backend/lib/socketHandlers.js',
      'backend-ai/asr_wav2vec2_jv.py',
      'backend-ai/live_stream_worker.py',
    ]
    for (const file of files) {
      const source = readFileSync(`${appRoot}/${file}`, 'utf8')
      expect(source, file).not.toContain('foh://')
    }
  })
})
