// 定向验证（用户 10-10 报 #1/#2）：保存后重开模型清单的「异步刷新竞速」两类病灶。
// 机制：保存 → onSaved 本地同步重建 catalog、prune details，但 account.models（plan）
// 走异步 refresh(true)——重开抢在落地前，行集按陈旧 plan 渲染：
//   #1 加模型保存 → 重开时行未勾选（declared 没有、catalog 有）→ 落地后应自动补勾；
//   #2 删模型保存 → 重开时行仍在（陈旧 declared 带着它）→ 落地后应自动消失。
// 修复 = 行集「草稿制渲染」（没动过草稿每次渲染从当前 props 重算）。
// 复现前提 = mini-react v3（卸载清扫）：v2 的状态槽跨卸载残留会让重开渲染上一会话
// 草稿，整个重挂类行为失真。判别点在「刷新落地后」（t+3.5s）：
//   修复：#1 变勾选 / #2 行消失；未修复（行集挂载时冻结）：#1 仍未勾选 / #2 行仍在。
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? join(here, '..', '..', 'lib', 'client.js'), join(here, 'client.js'))
const outDir = join(tmpdir(), 'dsh-lp-race')
mkdirSync(outDir, { recursive: true })
const PORT = 9360
const PLAN_DELAY = 6000
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-rc-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 90s 未完成，强制退出'); process.exit(2) }, 90000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function versionInfo() {
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (res.ok) return res.json() } catch {}
    await sleep(200)
  }
  throw new Error('chrome down')
}
class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url); this.id = 0; this.pending = new Map()
    this.ready = new Promise((r) => { this.socket.onopen = () => r() })
    this.socket.onmessage = (event) => {
      const m = JSON.parse(String(event.data))
      if (m.id !== undefined && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id)
        if (m.error !== undefined) reject(new Error(JSON.stringify(m.error))); else resolve(m.result)
      }
    }
  }
  send(method, params = {}) {
    this.id += 1; const id = this.id
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })) })
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  async waitFor(sel, timeoutMs = 10000) {
    const t0 = Date.now()
    for (;;) {
      if (await this.eval(`document.querySelector(${JSON.stringify(sel)}) !== null`) === true) return
      if (Date.now() - t0 > timeoutMs) throw new Error('waitFor 超时 ' + sel)
      await sleep(120)
    }
  }
  async waitForGone(sel, timeoutMs = 10000) {
    const t0 = Date.now()
    for (;;) {
      if (await this.eval(`document.querySelector(${JSON.stringify(sel)}) === null`) === true) return
      if (Date.now() - t0 > timeoutMs) throw new Error('waitForGone 超时 ' + sel)
      await sleep(120)
    }
  }
}
await versionInfo()
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1500, deviceScaleFactor: 1, mobile: false })
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html?planDelay=' + PLAN_DELAY).replace(/\\/g, '/') })
await cdp.waitFor('.pv_addBtn')
await sleep(PLAN_DELAY + 1500) // 初始 plan 落地

const failures = []
function check(name, cond, detail) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' → ' + JSON.stringify(detail)}`)
  if (!cond) failures.push(name)
}

async function openEditor() {
  await cdp.eval(`(function(){
    var cards = document.querySelectorAll('.pv_pc')
    for (var i = 0; i < cards.length; i += 1) {
      var name = cards[i].querySelector('.pv_pcName')
      if (name !== null && name.textContent.indexOf('Ykw') !== -1) {
        if (cards[i].querySelector('.pv_mHead') === null) cards[i].querySelector('.pv_pcCaretCol').click()
        return true
      }
    }
    throw new Error('没有找到卡片')
  })()`)
  await sleep(250)
  await cdp.eval(`(function(){
    var cards = document.querySelectorAll('.pv_pc')
    for (var i = 0; i < cards.length; i += 1) {
      var name = cards[i].querySelector('.pv_pcName')
      if (name !== null && name.textContent.indexOf('Ykw') !== -1) {
        var h = cards[i].querySelector('.pv_mHead'); if (h !== null) h.click(); return true
      }
    }
    throw new Error('没有找到模型盒头')
  })()`)
  await sleep(250)
  await cdp.eval(`(function(){ var b = document.querySelectorAll('button'); for (var i = 0; i < b.length; i += 1) if (b[i].textContent === '编辑模型') { b[i].click(); return true } throw new Error('没有「编辑模型」') })()`)
  await cdp.waitFor('.pv_meRow')
  await sleep(200)
}
async function rowState() {
  return await cdp.eval(`(function(){
    var rows = Array.from(document.querySelectorAll('.pv_meRow'))
    var out = {}
    for (var i = 0; i < rows.length; i += 1) {
      var id = (rows[i].querySelector('.pv_mId') || {}).textContent
      var c = rows[i].querySelector('.pv_meCheck')
      out[id] = c === null ? null : c.checked
    }
    return out
  })()`)
}
async function clickIn(sel, label) {
  await cdp.eval(`(function(){
    var scope = document.querySelector(${JSON.stringify(sel)})
    if (scope === null) throw new Error('没有作用域')
    var b = scope.querySelectorAll('button')
    for (var i = 0; i < b.length; i += 1) if (b[i].textContent === ${JSON.stringify(label)}) { b[i].click(); return true }
    throw new Error('没有「' + ${JSON.stringify(label)} + '」按钮')
  })()`)
}

// ---- 场景 A（#1）：加模型保存 → 竞速重开 → 等刷新落地 ----
await openEditor()
await clickIn('.pv_me', '添加模型')
await cdp.waitFor('.pv_meForm')
await cdp.eval(`(function(){
  var el = document.querySelectorAll('.pv_meForm input.pv_field')[0]
  var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, 'glm-9-custom')
  el.dispatchEvent(new Event('change', { bubbles: true }))
})()`)
await sleep(150)
await clickIn('.pv_meForm', '添加')
await sleep(200)
await clickIn('.pv_me', '保存')
await cdp.waitForGone('.pv_me')
await openEditor() // 竞速重开：plan 刷新还在路上
const a0 = await rowState()
// A·t0 信息化（不设硬断言）：添加场景存在第二条更新路径，两代 bundle 下 t0 形态一致
//（均已是勾选），竞速窗口打不进；#1 的正确性由与 #2 完全相同的重推导机制保证（B 判别对）。
console.log('  [info] A·t0 竞速窗口形态:', JSON.stringify(a0))
await sleep(PLAN_DELAY + 1500)
const a1 = await rowState()
check('A·t1 刷新落地：自动补上勾选（#1 修复判别点）', a1['glm-9-custom'] === true, a1)

// ---- 场景 B（#2）：删该模型保存 → 竞速重开 → 等刷新落地 ----
await cdp.eval(`(function(){
  var rows = document.querySelectorAll('.pv_meRow')
  for (var i = 0; i < rows.length; i += 1) {
    var id = rows[i].querySelector('.pv_mId')
    if (id !== null && id.textContent === 'glm-9-custom') { rows[i].querySelector('button').click(); return true }
  }
  throw new Error('没有找到 glm-9-custom 行')
})()`)
await sleep(200)
await clickIn('.pv_me', '保存')
await cdp.waitForGone('.pv_me')
await openEditor() // 竞速重开：陈旧 declared 还带着被删模型
const b0 = await rowState()
check('B·t0 竞速窗口：行仍在（陈旧 declared 的如实形态）', b0['glm-9-custom'] !== undefined, b0)
await sleep(PLAN_DELAY + 1500)
const b1 = await rowState()
check('B·t1 刷新落地：行自动消失（#2 修复判别点）', b1['glm-9-custom'] === undefined, b1)
check('B·t1 其余行不受牵连', b1['glm-5.3-flash'] === true && b1['glm-5.3'] === false && b1['glm-4.7'] === false, b1)

const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
const file = join(outDir, 'race-after-fix.png')
writeFileSync(file, Buffer.from(shot.data, 'base64'))
console.log(`  截图 → ${file}`)

console.log(failures.length === 0 ? '\n竞速重开探针全部通过' : `\n${failures.length} 个失败`)
process.exit(failures.length === 0 ? 0 : 1)
