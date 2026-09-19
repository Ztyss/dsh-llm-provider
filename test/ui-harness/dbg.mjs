// 临时调试：观测就地编辑保存链路（不提交）
import { spawn } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync('C:/Users/39244/.dsh/profiles/web/node_modules/@ztyss/dsh-llm-provider/lib/client.js', join(here, 'client.js'))
const PORT = 9345
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-dbg-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws = null
async function versionInfo() {
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (res.ok) return res.json() } catch {}
    await sleep(200)
  }
  throw new Error('chrome down')
}
class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); this.ready = new Promise((r, j) => { this.socket.onopen = r; this.socket.onerror = j }) }
  send(method, params = {}) {
    this.id += 1
    return new Promise((resolve, reject) => {
      this.pending.set(this.id, { resolve, reject })
      this.socket.send(JSON.stringify({ id: this.id, method, params }))
    })
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false })
    if (result.exceptionDetails !== undefined) throw new Error(JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails))
    return result.result.value
  }
}
try {
  await versionInfo()
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await Promise.race([cdp.ready, sleep(3000)])
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') })
  await sleep(800)
  if (await cdp.eval('window.__ready === true') !== true) throw new Error('harness not ready')
  await cdp.eval(`document.querySelector('.pv_pc .pv_pcHead').click()`)
  await sleep(300)

  // 包一层 fetch 观测
  await cdp.eval(`(function () {
    var of_ = window.fetch
    window.__fetchSeen = []
    window.fetch = function (u, o) { window.__fetchSeen.push(String(u)); return of_.apply(this, arguments) }
  })()`)
  // 输入显示名
  await cdp.eval(`
    var el = document.querySelector('.pv_row input[placeholder="opencode-go"]')
    el.value = '我的网关'
    el.dispatchEvent(new Event('change', { bubbles: true }))
  `)
  await sleep(400)
  const st1 = await cdp.eval(`(function () {
    var box = document.querySelector('.pv_editActs')
    var b = box ? Array.from(box.querySelectorAll('button')).find(function (x) { return x.textContent === '保存修改' }) : undefined
    return { acts: box !== null, btn: b !== undefined, disabled: b ? b.disabled : null, handlers: b && b.__dshHandlers ? Object.keys(b.__dshHandlers) : null }
  })()`)
  console.log('输入后:', JSON.stringify(st1))
  // 手动调用处理器（绕过事件派发）
  const direct = await cdp.eval(`
    (function () {
      var b = Array.from(document.querySelectorAll('.pv_editActs button')).find(function (x) { return x.textContent === '保存修改' })
      var h = b.__dshHandlers ? b.__dshHandlers.onClick : null
      if (h === null) return 'no-handler'
      try { h({ stopPropagation: function () {} }) ; return 'handler-called' } catch (e) { return 'handler-threw: ' + (e && e.message) }
    })()
  `)
  await sleep(600)
  const st2 = await cdp.eval(`({ seen: window.__fetchSeen, last: window.__lastMutate ?? null, calls: (window.__mutateCalls || []).length })`)
  console.log('直接调处理器:', direct)
  console.log('之后观测:', JSON.stringify(st2))
} catch (e) {
  console.log('调试失败:', e && e.message)
} finally {
  kill()
  setTimeout(() => process.exit(0), 100)
}
