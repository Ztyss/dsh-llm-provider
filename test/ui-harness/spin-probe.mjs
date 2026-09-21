// 定向验证（用户批注）：进入模型服务页面、plan 快照后台异步刷新期间，
// 卡片上的 ↻ 刷新按钮也旋转（pv_spin），刷新完成后停止。
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? join(here, 'client.js'), join(here, 'client.js'))
const outDir = join(tmpdir(), 'dsh-lp-spin')
mkdirSync(outDir, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=9354`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-sp-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 40s 未完成，强制退出'); process.exit(2) }, 40000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function versionInfo() {
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch('http://127.0.0.1:9354/json/version'); if (res.ok) return res.json() } catch {}
    await sleep(200)
  }
  throw new Error('chrome down')
}
class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.id = 0
    this.pending = new Map()
    this.ready = new Promise((resolve) => { this.socket.onopen = () => resolve() })
    this.socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error !== undefined) reject(new Error(JSON.stringify(message.error)))
        else resolve(message.result)
      }
    }
  }
  send(method, params = {}) {
    this.id += 1
    const id = this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text + ' ' + JSON.stringify(result.exceptionDetails.exception?.description ?? ''))
    return result.result.value
  }
  async waitFor(selector, timeoutMs = 10000) {
    const started = Date.now()
    for (;;) {
      const found = await this.eval(`document.querySelector(${JSON.stringify(selector)}) !== null`)
      if (found === true) return true
      if (Date.now() - started > timeoutMs) throw new Error('waitFor 超时：' + selector)
      await sleep(150)
    }
  }
}
await versionInfo()
const list = await (await fetch('http://127.0.0.1:9354/json/list')).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1500, deviceScaleFactor: 1, mobile: false })
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') + '?planDelay=2000' })
// 卡片（路由骨架）先出现，此时 plan 快照还在 2s 延迟窗口里 → ↻ 应处于旋转态
await cdp.waitFor('.pv_iconBtn')
const during = await cdp.eval(`(function(){
  var btns = document.querySelectorAll('.pv_iconBtn')
  var spinning = 0
  for (var i = 0; i < btns.length; i += 1) if (btns[i].className.indexOf('pv_spin') !== -1) spinning += 1
  return JSON.stringify({ buttons: btns.length, spinning: spinning })
})()`)
console.log('刷新窗口内：' + during)
await sleep(2300)
const after = await cdp.eval(`(function(){
  var btns = document.querySelectorAll('.pv_iconBtn')
  var spinning = 0
  for (var i = 0; i < btns.length; i += 1) if (btns[i].className.indexOf('pv_spin') !== -1) spinning += 1
  return JSON.stringify({ buttons: btns.length, spinning: spinning })
})()`)
console.log('刷新完成后：' + after)
const d = JSON.parse(during)
const a = JSON.parse(after)
// 聚焦样式（用户批注）：输入框聚焦不加外圈 outline，自身边框加黑加粗（inset 阴影模拟 2px）
await cdp.eval(`(function(){ var h = document.querySelector('.pv_pc .pv_pcHead'); if (h) h.click() })()`)
await cdp.waitFor('.pv_row input.pv_key')
await cdp.eval(`(function(){ var el = document.querySelector('.pv_row input.pv_key'); if (el) el.focus() })()`)
await sleep(120)
const focusProbe = await cdp.eval(`(function(){
  var el = document.querySelector('.pv_row input.pv_key')
  var s = getComputedStyle(el)
  return JSON.stringify({ outline: s.outlineStyle, borderColor: s.borderColor, shadow: s.boxShadow })
})()`)
console.log('聚焦样式：' + focusProbe)
const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png', clip: await cdp.eval(`(function(){
  var b = document.querySelector('.pv_row input.pv_key').closest('.pv_row').getBoundingClientRect()
  return { x: b.x - 2, y: b.y - 2, width: b.width + 4, height: b.height + 4, scale: 1 }
})()`) })
writeFileSync(join(outDir, 'focus-border.png'), Buffer.from(shot2.data, 'base64'))
// 视觉证据：自绘下拉展开态（用户批注：原生弹层与页面视觉不协调）
await cdp.eval(`(function(){ var t = document.querySelector('.pv_selTrigger'); if (t) t.click() })()`)
await cdp.waitFor('.pv_selMenu')
await sleep(200)
const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: await cdp.eval(`(function(){
  var b = document.querySelector('.pv_sel').getBoundingClientRect()
  var m = document.querySelector('.pv_selMenu').getBoundingClientRect()
  return { x: b.x - 2, y: b.y - 2, width: Math.max(b.width, m.width) + 4, height: b.height + m.height + 12, scale: 1 }
})()`) })
writeFileSync(join(outDir, 'pv-select-open.png'), Buffer.from(shot3.data, 'base64'))
await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
await sleep(150)
const ok = d.spinning > 0 && a.spinning === 0
const f = JSON.parse(focusProbe)
const okFocus = f.outline === 'none' && f.borderColor.indexOf('0, 0, 0, 0.62') !== -1 && f.shadow.indexOf('inset') !== -1
console.log((ok ? 'PASS' : 'FAIL') + ': 后台刷新期间 ↻ 旋转、完成后停止；' + (okFocus ? 'PASS' : 'FAIL') + ': 聚焦=边框加黑加粗无外圈')
process.exit(ok && okFocus ? 0 : 1)
