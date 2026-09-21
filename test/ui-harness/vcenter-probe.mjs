// 定向量测：折叠态「模型（N）」头部在框内的竖向居中（cody 本轮修复验证）
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? join(here, 'client.js'), join(here, 'client.js'))
const outDir = join(tmpdir(), 'dsh-lp-vcenter')
mkdirSync(outDir, { recursive: true })

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=9351`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-vc-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 25s 未完成，强制退出'); process.exit(2) }, 25000)
const step = (m) => console.log('[step] ' + m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function versionInfo() {
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch('http://127.0.0.1:9351/json/version'); if (res.ok) return res.json() } catch {}
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
}
step("launching")
await versionInfo()
step("chrome up")
const list = await (await fetch('http://127.0.0.1:9351/json/list')).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
step("ws url got")
await cdp.ready
step("ws open")
step("enabling")
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1400, deviceScaleFactor: 1, mobile: false })
const url = 'file:///' + join(here, 'harness.html').replace(/\\/g, '/')
await cdp.send('Page.navigate', { url })
await sleep(1200)

// 展开第一张 provider 卡（卡片默认折叠，模型框在其内）
step("expanding card")
await cdp.eval(`(function(){ var cols = document.querySelectorAll('.pv_pcCaretCol'); if (cols.length > 0) cols[0].click() })()`)
await sleep(400)
// 找到第一个折叠的模型框，量测头行内文字与框边的上下留白
step("navigated, probing")
const probe = await cdp.eval(`(function(){
  var box = document.querySelector('.pv_mBox')
  if (box === null) return JSON.stringify({ found: false })
  var top = box.querySelector('.pv_mTop'); var head = box.querySelector('.pv_mHead')
  if (top === null || head === null) return JSON.stringify({ found: false })
  var b = box.getBoundingClientRect(), t = top.getBoundingClientRect(), h = head.getBoundingClientRect()
  var span = head.querySelector('span')
  var r = span !== null ? span.getBoundingClientRect() : h
  return JSON.stringify({
    found: true,
    boxH: +(b.height).toFixed(2), topH: +(t.height).toFixed(2),
    textAbove: +(r.top - b.top).toFixed(2), textBelow: +(b.bottom - r.bottom).toFixed(2),
    headCenterDelta: +((h.top + h.bottom) / 2 - (b.top + b.bottom) / 2).toFixed(2),
    headText: span !== null ? span.textContent : ''
  })
})()`)
console.log('probe=' + probe)
const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: await cdp.eval(`(function(){
  var b = document.querySelector('.pv_mBox').getBoundingClientRect()
  return { x: b.x - 2, y: b.y - 2, width: b.width + 4, height: b.height + 4, scale: 1 }
})()`) })
writeFileSync(join(outDir, 'mbox-collapsed.png'), Buffer.from(shot.data, 'base64'))
console.log('shot=' + join(outDir, 'mbox-collapsed.png'))
// 顺带回归断言：折叠态框高 = 头行高 + 2px 边框，上下留白相等
const p = JSON.parse(probe)
if (!p.found) { console.log('FAIL: 没找到 .pv_mBox'); process.exit(1) }
const sym = Math.abs(p.textAbove - p.textBelow) <= 1
console.log((sym ? 'PASS' : 'FAIL') + ': textAbove=' + p.textAbove + ' textBelow=' + p.textBelow + ' headCenterDelta=' + p.headCenterDelta + ' boxH=' + p.boxH + ' topH=' + p.topH)
process.exit(sym ? 0 : 1)
