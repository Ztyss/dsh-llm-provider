// 定向验证（用户 11-25 需求）：模型服务页「按 provider 刷新」按钮 → 「全部刷新」。
//
// 旧行为：每张卡片右下有 ↻（POST /provider/refresh 单家实查）；新行为：卡片不再有 ↻，
// 头部工具行（与「添加 provider」同行）有「↻ 刷新全部」——点击走页面级
// GET /plan/status?refresh=1（宿主实查全部账户），期间按钮禁用 + ↻ 旋转，
// 完成弹 toast「已刷新全部 provider」（2.6 秒自动消失，采样要在窗口内）。
// 环境变量：CLIENT_SRC（被测 lib/client.js，缺省本仓库刚 build 的那份）/ CHROME / CDP_PORT
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? join(here, '..', '..', 'lib', 'client.js'), join(here, 'client.js'))
const port = Number(process.env.CDP_PORT ?? 9356)
const chrome = spawn(process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-rf-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 40s 未完成，强制退出'); process.exit(2) }, 40000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function versionInfo() {
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch(`http://127.0.0.1:${port}/json/version`); if (res.ok) return res.json() } catch {}
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
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1500, deviceScaleFactor: 1, mobile: false })
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') + '?planDelay=2000' })
await cdp.waitFor('.pv_pc')
// 页面挂载时的首次 plan 重拉也在延迟窗口里（planRefreshing=true）——等它落地再采样，
// 否则「全部刷新」在这段时间本来就是禁用态，测不出点击语义。
await sleep(2400)
// A. 卡片上不再有 ↻（删除 ★ 仍是 button，只认文本为 ↻ 的那颗）
const cardSpins = await cdp.eval(`(function(){
  var btns = document.querySelectorAll('.pv_metaActs button')
  var spins = 0
  for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent.replace(/\\s+/g, '') === '↻') spins += 1
  return spins
})()`)
// B. 头部工具行出现「刷新全部」
const allBtn = await cdp.eval(`(function(){
  var b = document.querySelector('.pv_refreshAll')
  return JSON.stringify({ exists: b !== null, text: b === null ? '' : b.textContent.replace(/\\s+/g, '') })
})()`)
// C. 点击 → 延迟窗口内禁用 + ↻ 旋转；请求必须是 /plan/status?refresh=1
const clicked = await cdp.eval(`(function(){
  var b = document.querySelector('.pv_refreshAll')
  if (b === null || b.disabled === true) return false
  b.click()
  return true
})()`)
await sleep(350)
const busy = await cdp.eval(`(function(){
  var b = document.querySelector('.pv_refreshAll')
  if (b === null) return JSON.stringify({ disabled: false, spinning: false, calls: 0 })
  var calls = window.__calls.filter(function (c) { return c.indexOf('/plan/status?refresh=1') !== -1 }).length
  return JSON.stringify({ disabled: b.disabled === true, spinning: b.querySelector('.pv_spin') !== null, calls: calls, html: b.outerHTML.slice(0, 300), recent: window.__calls.slice(-4) })
})()`)
// D. 延迟 2s 后：toast 出现、按钮复位（toast 2.6s 自动消失，必须在这里采）
await sleep(2100)
const done = await cdp.eval(`(function(){
  var b = document.querySelector('.pv_refreshAll')
  var t = document.querySelector('.pv_toast')
  return JSON.stringify({
    disabled: b === null ? false : b.disabled === true,
    spinning: b === null ? false : b.querySelector('.pv_spin') !== null,
    toast: t === null ? null : t.textContent,
    calls: window.__calls.filter(function (c) { return c.indexOf('/plan/status?refresh=1') !== -1 }).length,
  })
})()`)
console.log('卡片 ↻ 数量：' + cardSpins)
console.log('全部刷新按钮：' + allBtn)
console.log('点击后（刷新窗口内）：' + busy)
console.log('完成后：' + done)
const a = JSON.parse(allBtn)
const b = JSON.parse(busy)
const d = JSON.parse(done)
const okA = cardSpins === 0
const okB = a.exists === true && a.text === '↻刷新'
const okC = clicked === true && b.disabled === true && b.spinning === true && b.calls >= 1
const okD = d.disabled === false && d.spinning === false && typeof d.toast === 'string' && d.toast.indexOf('已刷新') !== -1 && d.calls >= 1
console.log((okA ? 'PASS' : 'FAIL') + ': 卡片不再有 ↻；' + (okB ? 'PASS' : 'FAIL') + ': 头部「刷新」按钮存在；'
  + (okC ? 'PASS' : 'FAIL') + ': 点击后禁用+旋转且请求 refresh=1；' + (okD ? 'PASS' : 'FAIL') + ': 完成 toast（含家数）+ 按钮复位')
process.exit(okA && okB && okC && okD ? 0 : 1)
