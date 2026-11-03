import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { preview, createServer } from 'vite'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

// Uses the real built app and Node API, with no model processes, credentials,
// successful AI fixtures, or external ASR services. AI availability is not tested.
const require = createRequire(import.meta.url)
const { createBackend } = require('../../backend/index.js')
const output = fileURLToPath(new URL('./artifacts/', import.meta.url))
await mkdir(output, { recursive: true })
const backend = createBackend({ autoSpawn: false, cleanupIntervalMs: 0, asrServerUrl: 'http://127.0.0.1:1', pythonAiUrl: 'http://127.0.0.1:1', logger: { log() {}, warn() {}, error() {} } })
delete process.env.YOUTUBE_API_KEY
let server, browser, panelServer
const results = [], failures = [], consoleMessages = []
async function check(name, run) {
 try { results.push({ name, passed: true, ...(await run()) }) }
 catch (error) { failures.push({ name, message: error.message }); results.push({ name, passed: false, message: error.message }) }
}
try {
 const address = await backend.start(0, '127.0.0.1')
 const target = `http://127.0.0.1:${address.port}`
 server = await preview({ preview: { port: 4173, host: '127.0.0.1', strictPort: true, proxy: { '/api': target, '/health': target, '/socket.io': { target, ws: true } } } })
 const baseURL = 'http://127.0.0.1:4173'
 browser = await chromium.launch()
 const context = await browser.newContext()
 const page = await context.newPage(); page.setDefaultTimeout(10000)
 page.on('pageerror', error => failures.push({ name: 'uncaught browser exception', message: error.message }))
 page.on('console', message => { if (['error','warning'].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text(), location: message.location().url }) })
 await page.addInitScript(() => {
  window.__shifts = []
  new PerformanceObserver(list => window.__shifts.push(...list.getEntries().map(entry => ({ value: entry.value, recentInput: entry.hadRecentInput })))).observe({ type: 'layout-shift', buffered: true })
 })
 const routes = ['/', '/saved', '/gallery', '/almanac', '/performance', '/settings', '/about', '/missing-route']
 for (const width of [320, 375, 768, 1440]) {
  await page.setViewportSize({ width, height: 1000 })
  for (const route of routes) {
   await check(`route ${route} at ${width}px`, async () => {
    await page.goto(`${baseURL}${route}`)
    await page.locator('main h1').waitFor({ state: 'attached' })
    if (route === '/almanac') await page.locator('.catalog-card').first().waitFor()
    if (route === '/performance') await page.locator('.worker-item').first().waitFor()
    assert.equal(await page.locator('.top-navbar nav').count(), 1)
    assert.equal(await page.locator('header nav:not(.navbar-actions)').count(), 0)
    const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    assert.ok(geometry.content <= geometry.viewport, JSON.stringify(geometry))
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
    const violations = axe.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }))
    assert.equal(violations.length, 0, JSON.stringify(violations))
    if ((width === 320 || width === 375 || width === 1440) && ['/', '/almanac', '/settings'].includes(route)) await page.screenshot({ path: `${output}/${width}-${route === '/' ? 'home' : route.slice(1)}.png`, fullPage: true })
    return { ...geometry, axeViolations: violations.length }
   })
  }
 }
 await check('320px source labels, selectors and invalid URL feedback', async () => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto(baseURL); await page.locator('#video-search').waitFor()
  const panel = await page.locator('.source-panel').boundingBox()
  assert.ok(panel.y < 1000, `Source panel starts too low: ${panel.y}`)
  await page.getByRole('button', { name: 'Tempel URL', exact: true }).focus()
  await page.keyboard.press('Enter')
  const input = page.getByLabel('Tautan video YouTube')
  await input.fill('https://invalid.test')
  await page.getByRole('button', { name: 'Tonton dengan panduan', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert.equal(await input.getAttribute('aria-invalid'), 'true')
  await page.screenshot({ path: `${output}/320-source-url.png`, fullPage: true })
  await page.getByRole('button', { name: 'Cari pertunjukan', exact: true }).focus(); await page.keyboard.press('Enter')
  assert.equal(await page.getByLabel('Cari video wayang').isVisible(), true)
  const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
  assert.ok(geometry.content <= geometry.viewport, JSON.stringify(geometry))
  return { sourceTop: panel.y, ...geometry }
 })
 await page.setViewportSize({ width: 1440, height: 1000 })
 await page.goto(baseURL)
 await page.locator('main h1').waitFor({ state: 'attached' })
 await check('desktop drawer starts closed and backdrop closes without shifting content', async () => {
  const main = page.locator('main'), before = await main.boundingBox()
  assert.equal(await page.locator('#workspace-sidebar[aria-hidden="true"]').count(), 1)
  await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
  await page.locator('#workspace-sidebar.is-open').waitFor()
  assert.equal(await page.locator('.sidebar-backdrop').isVisible(), true)
  await page.locator('.sidebar-backdrop').click({ position: { x: 600, y: 20 } })
  await page.waitForTimeout(250)
  assert.equal(await page.locator('#workspace-sidebar[aria-hidden="true"]').count(), 1)
  assert.deepEqual(await main.boundingBox(), before)
 })
 await check('deep maroon palette and distinct primary control states', async () => {
  const background = locator => locator.evaluate(element => getComputedStyle(element).backgroundColor)
  assert.equal(await background(page.locator('body')), 'rgb(31, 7, 14)')
  assert.equal(await page.locator('#workspace-sidebar[aria-hidden="true"]').count(), 1)
  assert.equal(await background(page.locator('.top-navbar')), 'rgba(36, 10, 19, 0.95)')
  assert.ok(await page.locator('.feed-card').count() >= 8)
  const button = page.locator('.source-form .button-primary')
  assert.equal(await button.isDisabled(), true)
  assert.equal(await background(button), 'rgb(52, 17, 29)')
  await page.locator('#video-search').fill('wayang')
  await page.mouse.move(0, 0); await page.waitForTimeout(200)
  assert.equal(await background(button), 'rgb(196, 56, 89)')
  assert.equal(await button.evaluate(element => getComputedStyle(element).color), 'rgb(255, 255, 255)')
  await button.hover(); await page.waitForTimeout(200)
  assert.equal(await background(button), 'rgb(214, 72, 105)')
  await page.mouse.down(); await page.waitForTimeout(200)
  assert.equal(await background(button), 'rgb(167, 44, 75)')
  await page.mouse.move(0, 0); await page.mouse.up()
  await page.locator('#video-search').focus(); await page.keyboard.press('Tab')
  assert.equal(await button.evaluate(element => element.matches(':focus-visible')), true)
  assert.equal(await button.evaluate(element => getComputedStyle(element).outlineColor), 'rgb(241, 196, 107)')
  await page.locator('#video-search').fill(''); await page.mouse.move(0, 0)
  return { primaryStates: ['default', 'hover', 'pressed', 'keyboard-focus', 'disabled'] }
 })
 await check('mobile navbar search paste language and drawer navigation', async () => {
  await page.setViewportSize({ width: 320, height: 800 }); await page.goto(`${baseURL}/tonton`)
  await page.locator('#video-search').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Tempel URL' }).isVisible(), true)
  assert.equal(await page.getByLabel('Bahasa tampilan').isVisible(), true)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
  await page.getByRole('button', { name: 'Buka navigasi' }).click()
  await page.getByRole('link', { name: 'Almanak wayang' }).click()
  await page.waitForTimeout(250)
  assert.equal(new URL(page.url()).pathname, '/almanac')
  assert.equal(await page.locator('#workspace-sidebar[aria-hidden="true"]').count(), 1)
 })
 await check('video hub responsive grid, local categories, slash and direct card selection', async () => {
  await page.goto(`${baseURL}/tonton`)
  await page.locator('.feed-card').first().waitFor()
  for (const [width, columns] of [[375, 1], [768, 2], [1440, 3], [1920, 4]]) {
   await page.setViewportSize({ width, height: 1000 })
   assert.equal(await page.locator('.feed-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), columns)
   assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  assert.equal(await page.locator('.hero,.featured-empty,.viewer-learning').count(), 0)
  await page.locator('main').click({ position: { x: 24, y: 180 } })
  await page.keyboard.press('/')
  assert.equal(await page.locator('#video-search').evaluate(element => document.activeElement === element), true)
  const total = await page.locator('.feed-card').count()
  await page.getByRole('button', { name: 'Ki Seno Nugroho', exact: true }).click()
  assert.ok(await page.locator('.feed-card').count() > 0)
  assert.ok(await page.locator('.feed-card').count() < total)
  await page.getByRole('button', { name: 'Semua', exact: true }).click()
  assert.equal(await page.locator('.feed-card').count(), total)
  const thumbnail = page.locator('.feed-thumbnail img').first()
  await thumbnail.evaluate(image => image.decode())
  assert.ok(await thumbnail.evaluate(image => image.naturalWidth >= 480))
  await page.locator('.feed-card-action').first().hover()
  await page.screenshot({ path: `${output}/1440-video-hub.png`, fullPage: true })
  await page.locator('.feed-card-action').first().click()
  await page.locator('#video-player-section').waitFor()
  assert.equal(await page.locator('.watch-guide').isVisible(), true)
  await page.getByRole('button', { name: 'Pilih tontonan lain', exact: true }).click()
  await page.locator('#video-url').waitFor()
  return { defaultVideos: total, columns: [1, 2, 3, 4], thumbnail: 'decoded real YouTube image', inferenceVerified: false }
 })
 await check('Indonesian navigation labels preserve routes', async () => {
  for (const [label, path] of [['Tonton', '/tonton'], ['Jelajahi', '/gallery'], ['Tersimpan', '/saved'], ['Informasi layanan', '/performance'], ['Pengaturan', '/settings']]) {
   if (!(await page.locator('#workspace-sidebar.is-open').count())) await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
   const link = page.getByRole('link', { name: label, exact: true })
   const href = await link.getAttribute('href')
   assert.ok(label === 'Tonton' ? ['/','/tonton'].includes(href) : href === path)
   await link.click({ noWaitAfter: true }); await page.waitForTimeout(250)
   assert.equal(new URL(page.url()).pathname, path)
   assert.equal(await page.title(), `${label} · CoWayangAI`)
  }
  await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
  await page.getByRole('link', { name: 'Tonton', exact: true }).click({ noWaitAfter: true }); await page.waitForTimeout(250)
 })
 await check('sidebar navigation and browser history', async () => {
  await page.getByRole('button', { name: 'Buka navigasi', exact: true }).click()
  await page.getByRole('link', { name: 'Jelajahi', exact: true }).click({ noWaitAfter: true }); await page.waitForTimeout(250)
  assert.equal(new URL(page.url()).pathname, '/gallery')
  await page.goBack(); await page.waitForTimeout(150); assert.ok(['/','/tonton'].includes(new URL(page.url()).pathname))
 })
 await check('catalog keyboard dialog and restored focus', async () => {
  await page.goto(`${baseURL}/almanac`)
  const card = page.locator('.catalog-card-button').first()
  await card.focus(); await page.keyboard.press('Enter')
  await page.locator('dialog[open]').waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('dialog[open]').count(), 0)
  assert.equal(await card.evaluate(element => element === document.activeElement), true)
  assert.equal(await page.evaluate(() => document.body.style.overflow), '')
 })
 await page.setViewportSize({ width: 375, height: 1000 })
 await page.goto(baseURL); await page.locator('main h1').waitFor({ state: 'attached' })
 await check('mobile drawer does not shift content and traps focus', async () => {
  const main = page.locator('main')
  const before = await main.boundingBox()
  await page.evaluate(() => { window.__shifts = [] })
  await page.getByRole('button', { name: 'Buka navigasi' }).click()
  await page.locator('#workspace-sidebar.is-open').waitFor()
  await page.waitForTimeout(250) // Wait only for the specified drawer CSS transition.
  const after = await main.boundingBox()
  assert.deepEqual(after, before)
  assert.equal(await page.evaluate(() => document.querySelector('#workspace-sidebar').contains(document.activeElement)), true, 'Drawer focus: ' + await page.evaluate(() => document.activeElement.outerHTML))
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.evaluate(() => document.querySelector('#workspace-sidebar').contains(document.activeElement)), true, 'Drawer focus: ' + await page.evaluate(() => document.activeElement.outerHTML))
  const shifts = await page.evaluate(() => window.__shifts.reduce((total, entry) => total + entry.value, 0))
  assert.equal(shifts, 0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  assert.equal(await page.getByRole('button', { name: 'Buka navigasi' }).evaluate(element => element === document.activeElement), true)
  return { totalLayoutShift: shifts }
 })
 await check('settings persist after reload', async () => {
  await page.goto(`${baseURL}/settings`)
  const checkbox = page.getByLabel('Batas tokoh', { exact: false })
  const initial = await checkbox.isChecked()
  await checkbox.setChecked(!initial); await page.reload()
  assert.equal(await checkbox.isChecked(), !initial)
  await checkbox.setChecked(initial)
 })
 await check('real search unavailability is helpful and has no invented catalog', async () => {
  await page.goto(`${baseURL}/gallery`)
  assert.equal(await page.locator('.video-card').count(), 0)
  await page.locator('[data-beginner-search]').click()
  await page.locator('.notice').waitFor()
  assert.match(await page.locator('.notice').innerText(), /Pencarian belum tersedia/)
  assert.equal(await page.locator('.video-card').count(), 0)
 })
 await check('synthetic search adapter selection opens real viewing UI, then closes', async () => {
  // Explicitly test-only API shape, NOT a verified video/catalog or AI response.
  await page.route('**/api/search-youtube**', route => route.fulfill({ json: { status: 'success', videos: [{ videoId: 'aOtB-yw9GSE', title: 'Synthetic search adapter — not a published catalog', channelTitle: 'Synthetic test channel' }] } }))
  try {
   await page.locator('[data-beginner-search]').click()
   await page.locator('.video-card').first().click()
   await page.waitForURL(url => url.pathname === '/' && url.searchParams.get('open') === '1')
   await page.locator('#video-player-section').waitFor()
   assert.equal(await page.locator('.watch-guide').isVisible(), true)
   assert.equal(await page.locator('.player-frame').isVisible(), true)
   assert.equal(await page.getByText('LIVE AI', { exact: true }).count(), 0)
   await page.getByRole('button', { name: 'Pilih tontonan lain', exact: true }).click()
   await page.locator('#video-url').waitFor()
   assert.equal(await page.getByLabel('Tautan video YouTube').inputValue(), 'https://www.youtube.com/watch?v=aOtB-yw9GSE')
   assert.equal(await page.locator('#video-player-section').count(), 0)
   return { fixtureOnly: true, scope: 'Synthetic search response -> actual route/player shell; not successful playback/inference' }
  } finally { await page.unroute('**/api/search-youtube**') }
 })
 await check('YouTube URL opens viewing even when guidance is unavailable', async () => {
  await page.getByRole('button', { name: 'Tonton dengan panduan', exact: true }).click()
  await page.locator('#video-player-section').waitFor()
  // No inference workers are spawned. An unavailable service must not hide video.
  await page.locator('.player-error').first().waitFor({ timeout: 20000 })
  assert.equal(await page.locator('.player-frame').isVisible(), true)
  assert.equal(await page.locator('.player-frame .player-error').count(), 0)
  assert.equal(await page.locator('.player-frame').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(8, 6, 9)')
  await page.locator('.watch-guide details').nth(2).locator('summary').click()
  assert.match(await page.locator('.context-empty').innerText(), /belum tersedia/)
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: `${output}/375-watch-unavailable.png`, fullPage: true })
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
  const iframeSelectors = await page.locator('.player-frame iframe').evaluateAll(frames => frames.filter(frame => frame.id).map(frame => '#' + frame.id))
  const external = audit.violations.filter(item => item.nodes.every(node => node.target.length > 1 && iframeSelectors.includes(node.target[0])))
  const appViolations = audit.violations.filter(item => !external.includes(item))
  // Retain/report YouTube findings. CoWayang cannot change the cross-origin iframe DOM.
  assert.equal(appViolations.length, 0, JSON.stringify(appViolations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))))
  await page.getByRole('button', { name: 'Pilih tontonan lain', exact: true }).click()
  return { appAxeViolations: appViolations.length, externalYouTubeViolations: external.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) })) }

 })
 await check('interface language persists and does not change translation preference', async () => {
  await page.goto(baseURL)
  await page.getByLabel('Bahasa tampilan').selectOption('en')
  await page.getByRole('heading', { name: 'Watch', exact: true }).waitFor({ state: 'attached' })
  assert.equal(await page.title(), 'Watch · CoWayangAI')
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  await page.reload()
  await page.getByRole('heading', { name: 'Watch', exact: true }).waitFor({ state: 'attached' })
  await page.goto(`${baseURL}/settings`)
  assert.equal(await page.getByLabel('Dialogue translation language', { exact: false }).inputValue(), 'id')
  await page.screenshot({ path: `${output}/375-settings-english.png`, fullPage: true })
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(); assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, failure: node.failureSummary })) }))))
  await page.getByLabel('Interface language').selectOption('id')
 })
 await check('saved signed-out state offers an actual account dialog', async () => {
  await page.goto(`${baseURL}/saved`)
  await page.getByRole('button', { name: 'Masuk akun', exact: true }).click()
  await page.locator('.account-modal button').first().waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.account-modal').count(), 0)
 })
 await check('help modal focus and Escape', async () => {
  await page.keyboard.press('?'); await page.locator('.account-modal button').first().waitFor()
  assert.equal(await page.locator('.account-modal').evaluate(element => element.contains(document.activeElement)), true)
  assert.ok((await page.locator('.account-modal').innerText()).includes('Mundur 10 detik'))
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(); assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, failure: node.failureSummary })) }))))
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.account-modal').count(), 0)
 })
 // Separate test-only Vite entry mounts real panels with synthetic data.
 // It does not exercise successful inference and is not an application route.
 panelServer = await createServer({ server: { port: 0, host: '127.0.0.1', strictPort: false, open: false }, logLevel: 'warn' })
 await panelServer.listen()
 const panelPort = panelServer.httpServer.address().port
 for (const width of [375, 768, 1440]) {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`http://127.0.0.1:${panelPort}/tests/ui-panels.html`)
  await page.locator('.transcription-panel').waitFor()
  for (const state of ['empty', 'long']) {
   await check(`test-only panel ${state} state at ${width}px`, async () => {
    await page.getByRole('button', { name: state === 'long' ? 'Data uji panjang' : 'Tanpa hasil', exact: true }).click()
    if (state === 'long') {
     await page.locator('.subtitle').first().waitFor()
     assert.equal(await page.locator('.transcript-label').count(), 40)
     assert.equal(await page.locator('.translation-label').count(), 26)
     for (const selector of ['.transcription-content', '.detection-list']) {
      const geometry = await page.locator(selector).evaluate(element => ({ scroll: element.scrollHeight, height: element.clientHeight, overflow: getComputedStyle(element).overflowY }))
      assert.ok(geometry.scroll > geometry.height, JSON.stringify(geometry))
      assert.equal(geometry.overflow, 'auto')
      await page.locator(selector).evaluate(element => { element.scrollTop = 150 })
      assert.ok(await page.locator(selector).evaluate(element => element.scrollTop > 0))
     }
     const follow = page.getByRole('checkbox', { name: 'Ikuti dialog terbaru' })
     await follow.focus(); await page.keyboard.press('Space'); assert.equal(await follow.isChecked(), false)
    } else {
     assert.equal(await page.locator('.subtitle').count(), 0)
     assert.equal(await page.locator('.panel-status').innerText(), 'Belum terhubung')
    }
    const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    assert.ok(geometry.content <= geometry.viewport, JSON.stringify(geometry))
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
    assert.equal(axe.violations.length, 0, JSON.stringify(axe.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))))
    await page.screenshot({ path: `${output}/${width}-panels-${state}.png`, fullPage: true })
    return { ...geometry, axeViolations: axe.violations.length, fixtureOnly: true }
   })
  }
 }
 const expectedMessage = message =>
  (message.text.startsWith('Failed to load resource:') && (message.location.includes('/api/search-youtube') || /^https:\/\/(?:www\.)?youtube\.com\//.test(message.location))) ||
  /^https:\/\/(?:www\.)?youtube\.com\//.test(message.location) ||
  message.text === 'The powerPreference option is currently ignored when calling requestAdapter() on Windows. See https://crbug.com/369219127'
 const unexpected = consoleMessages.filter(message => !expectedMessage(message))
 assert.equal(unexpected.length, 0, JSON.stringify(unexpected))
} catch (error) { failures.push({ name: 'harness', message: error.stack }) }
finally {
 await browser?.close()
 await panelServer?.close()
 await server?.close()
 await backend.shutdown()
 const report = { results, failures, consoleMessages, scope: 'Built app + real unavailable local API and real YouTube iframe; synthetic search and real-component panel fixtures explicitly labeled; no successful AI/auth claim. YouTube iframe accessibility and browser warnings recorded separately, not silently discarded.' }
 await writeFile(`${output}/browser-report.json`, JSON.stringify(report, null, 2))
 console.log(JSON.stringify(report, null, 2))
 if (failures.length) process.exitCode = 1
}
