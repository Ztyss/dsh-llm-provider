// 定向验证：declared 来源的模型行不再渲染「声明」徽标（cody 本轮修复）
// 夹具 opencode-go/deepseek-flash 的详情 source:'declared'（harness.html:38），
// 修复前展开模型清单必有一枚 .pv_capDeclared；修复后必须为 0 且真徽章照常。
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? join(here, 'client.js'), join(here, 'client.js'))
const outDir = join(tmpdir(), 'dsh-lp-declared')
mkdirSync(outDir, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=9352`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-dp-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 25s 未完成，强制退出'); process.exit(2) }, 25000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function versionInfo() {
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch('http://127.0.0.1:9352/json/version'); if (res.ok) return res.json() } catch {}
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
await versionInfo()
const list = await (await fetch('http://127.0.0.1:9352/json/list')).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1400, deviceScaleFactor: 1, mobile: false })
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') })
await sleep(1200)
// 展开第一张卡 → 打开模型清单
await cdp.eval(`(function(){ var cols = document.querySelectorAll('.pv_pcCaretCol'); if (cols.length > 0) cols[0].click() })()`)
await sleep(300)
await cdp.eval(`(function(){ var h = document.querySelector('.pv_pc .pv_mHead'); if (h !== null) h.click() })()`)
await sleep(300)
const probe = await cdp.eval(`(function(){
  var rows = Array.prototype.map.call(document.querySelectorAll('.pv_mRow'), function (row) {
    var caps = row.querySelector('.pv_mCaps')
    return {
      id: (row.querySelector('.pv_mId') || {}).textContent,
      declaredBadge: caps !== null ? caps.querySelectorAll('.pv_capDeclared').length : -1,
      capBadges: caps !== null ? caps.querySelectorAll('.pv_capMini').length : -1,
      capsText: caps !== null ? caps.textContent : ''
    }
  })
  return JSON.stringify({
    rows: rows,
    declaredTotal: document.querySelectorAll('.pv_capDeclared').length,
    sourceTipInDom: document.body.innerHTML.indexOf('能力来自这条路由的声明') !== -1 || 'tip仅悬浮时渲染'
  })
})()`)
console.log('probe=' + probe)
const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: await cdp.eval(`(function(){
  var b = document.querySelector('.pv_mBox').getBoundingClientRect()
  return { x: b.x - 2, y: b.y - 2, width: b.width + 4, height: b.height + 4, scale: 1 }
})()`) })
writeFileSync(join(outDir, 'mbox-list.png').replace(/\\\\/g, '/'), Buffer.from(shot.data, 'base64'))
const p = JSON.parse(probe)
const ok = p.declaredTotal === 0 && p.rows.some(function (r) { return r.declaredBadge === 0 && r.capBadges > 0 })
console.log((ok ? 'PASS' : 'FAIL') + ': declaredTotal=' + p.declaredTotal + ' rows=' + JSON.stringify(p.rows))
process.exit(ok ? 0 : 1)
