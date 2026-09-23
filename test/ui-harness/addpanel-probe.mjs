// 定向验证：添加面板三条用户批注（09-23）
//   ① 发现模型 / 查询配置：API 密钥与 API 地址都填了才可点（此前各只查自己那格）
//   ② custom-gateway 的 API 地址首次输入后不得锁死（此前可填条件看 form.baseURL 当前值，
//      一打字就退回 roField——即使首次输入不完整也改不了）
//   ③ 取消 = 清空本次编辑并收起卡片（此前只收起不清空，旧输入留到下次打开）
// 驱动真 lib/client.js + mini-react 垫片 + harness.html 夹具（custom-gateway 预设在内）。
// ⚠ 面板根与 provider 卡片同为 .pv_pc：所有查询必须 scope 到「含 .pv_pickBtn 的那个 .pv_pc」，
//   否则会撞上卡片区同名「API 地址」行。关键断言走 DOM（按钮 .disabled / URL 行是 input 还是
//   span.pv_ro / 重开后的表单值），并截三张图供人工复核。
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
// 默认用仓库刚构建出的 lib/client.js（worktree 里跑就是本分支产物），可用 CLIENT_SRC 覆盖
copyFileSync(process.env.CLIENT_SRC ?? join(here, '..', '..', 'lib', 'client.js'), join(here, 'client.js'))
const outDir = process.env.SHOT_DIR ?? join(tmpdir(), 'dsh-lp-addpanel')
mkdirSync(outDir, { recursive: true })
const PORT = 9360
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-ap-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 30s 未完成，强制退出'); process.exit(2) }, 30000)
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
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false })
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') })
await sleep(1200)
if (await cdp.eval('window.__ready === true') !== true) throw new Error('harness not ready')

// 添加面板 = 含 .pv_pickBtn 的那个 .pv_pc（卡片没有供应商下拉）
const PANEL = `(function(){
  var pcs = document.querySelectorAll('.pv_pc')
  for (var i = 0; i < pcs.length; i += 1) { if (pcs[i].querySelector('.pv_pickBtn') !== null) return i }
  return -1
})()`

async function openAddPanel() {
  await cdp.eval(`(function(){ var b = document.querySelector('.pv_addBtn'); if (b === null) return 'already-open'; b.click(); return 'opened' })()`)
  await sleep(250)
  await cdp.eval(`(function(){
    var pcs = document.querySelectorAll('.pv_pc')
    for (var i = 0; i < pcs.length; i += 1) {
      var head = pcs[i].querySelector('.pv_pickBtn')
      if (head !== null) { head.click(); return 'menu-open' }
    }
    throw new Error('add panel (pv_pickBtn) not found')
  })()`)
  await sleep(250)
  await cdp.eval(`(function(){
    var pcs = document.querySelectorAll('.pv_pc')
    for (var i = 0; i < pcs.length; i += 1) {
      var menu = pcs[i].querySelector('.pv_pickMenu')
      if (menu === null) continue
      var items = menu.querySelectorAll('.pv_pickItem')
      for (var j = 0; j < items.length; j += 1) {
        if (items[j].textContent.indexOf('Custom Gateway') !== -1) { items[j].click(); return 'picked' }
      }
      throw new Error('Custom Gateway item not found')
    }
    throw new Error('pick menu not found')
  })()`)
  await sleep(250)
}

// 页内公共探针（全部 scope 到添加面板）：按钮态 + URL 行形态 + 各输入框当前值
const SNAPSHOT = `(function(){
  var pi = ${PANEL}
  if (pi < 0) return JSON.stringify({ addPanelOpen: false })
  var panel = document.querySelectorAll('.pv_pc')[pi]
  function btn(label){ var bs = panel.querySelectorAll('button'); for (var i = 0; i < bs.length; i += 1) { if (bs[i].textContent === label) return bs[i] } return null }
  var d = btn('发现模型'), q = btn('查询配置'), c = btn('取消')
  var rows = panel.querySelectorAll('.pv_line.pv_row'); var urlRow = null
  for (var i = 0; i < rows.length; i += 1) { var sp = rows[i].querySelector('span'); if (sp !== null && sp.textContent === 'API 地址') urlRow = rows[i] }
  var urlInput = urlRow !== null ? urlRow.querySelector('input.pv_field') : null
  var keyInput = panel.querySelector('input[type=password]')
  var routeInput = panel.querySelector('input.pv_field.pv_key:not([type=password])')
  return JSON.stringify({
    addPanelOpen: true,
    discoverDisabled: d === null ? null : d.disabled,
    queryDisabled: q === null ? null : q.disabled,
    cancelInDom: c !== null,
    urlIsInput: urlInput !== null,
    urlIsRo: urlRow !== null && urlRow.querySelector('span.pv_ro') !== null,
    urlValue: urlInput === null ? null : urlInput.value,
    keyValue: keyInput === null ? null : keyInput.value,
    routeValue: routeInput === null ? null : routeInput.value
  })
})()`
async function snap() { return JSON.parse(await cdp.eval(SNAPSHOT)) }
// 受控输入：native setter 赋值 + change 事件（垫片把 onChange 绑在 change 上）
function fill(expr, value) {
  return cdp.eval(`(function(){
    var el = ${expr}
    if (el === null) return 'no-input'
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return 'ok'
  })()`)
}
const KEY_INPUT = `(function(){ var pi = ${PANEL}; if (pi < 0) return null; return document.querySelectorAll('.pv_pc')[pi].querySelector('input[type=password]') })()`
const URL_INPUT = `(function(){
  var pi = ${PANEL}; if (pi < 0) return null
  var panel = document.querySelectorAll('.pv_pc')[pi]
  var rows = panel.querySelectorAll('.pv_line.pv_row')
  for (var i = 0; i < rows.length; i += 1) { var sp = rows[i].querySelector('span'); if (sp !== null && sp.textContent === 'API 地址') return rows[i].querySelector('input.pv_field') }
  return null
})()`
async function shot(name) {
  const s = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, name), Buffer.from(s.data, 'base64'))
  console.log('  shot → ' + name)
}

const checks = []
function check(name, cond, detail) { checks.push({ name, ok: cond === true, detail }); console.log((cond === true ? '  ok ' : '  FAIL ') + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')) }

console.log('== S0 选中 Custom Gateway，两格全空 ==')
await openAddPanel()
let s = await snap()
check('面板已展开', s.addPanelOpen === true, s)
check('① 两按钮全置灰（密钥/地址都空）', s.discoverDisabled === true && s.queryDisabled === true, s)
check('② URL 行是可编辑 input（非只读 span）', s.urlIsInput === true && s.urlIsRo === false, s)
await shot('addpanel-initial.png')

console.log('== S1 只填密钥 ==')
await fill(KEY_INPUT, 'sk-test'); await sleep(200)
s = await snap()
check('① 密钥有、地址空 → 两按钮仍置灰', s.discoverDisabled === true && s.queryDisabled === true, s)

console.log('== S2 清密钥、地址打到一半（锁死复现点）==')
await fill(KEY_INPUT, ''); await sleep(150)
await fill(URL_INPUT, 'https://api.exa'); await sleep(200)
s = await snap()
check('② 输入一半后 URL 仍是可编辑 input', s.urlIsInput === true && s.urlIsRo === false, s)
check('② 半截值保留在框里', s.urlValue === 'https://api.exa', s)
check('① 密钥空 → 两按钮仍置灰', s.discoverDisabled === true && s.queryDisabled === true, s)
await fill(URL_INPUT, 'https://api.example.com/v1'); await sleep(200)
s = await snap()
check('② 半截值可以续打完整', s.urlValue === 'https://api.example.com/v1', s)

console.log('== S3 密钥+地址都填 ==')
await fill(KEY_INPUT, 'sk-test'); await sleep(200)
s = await snap()
check('① 都填了 → 两按钮可点', s.discoverDisabled === false && s.queryDisabled === false, s)
await shot('addpanel-enabled.png')

console.log('== S4 点取消：清空并收起，重开是干净表单 ==')
await cdp.eval(`(function(){
  var pi = ${PANEL}; if (pi < 0) return 'no-panel'
  var bs = document.querySelectorAll('.pv_pc')[pi].querySelectorAll('button')
  for (var i = 0; i < bs.length; i += 1) { if (bs[i].textContent === '取消') { bs[i].click(); return 'clicked' } }
  return 'no-cancel'
})()`)
await sleep(250)
s = await snap()
check('③ 取消后面板收起（添加按钮回来了）', s.addPanelOpen === false, s)
await openAddPanel()
s = await snap()
check('③ 重开后密钥已清空', s.keyValue === '', s)
check('③ 重开后 API 地址已清空（且仍可编辑）', s.urlValue === '' && s.urlIsInput === true, s)
check('③ 重开后路由 ID 已清空', s.routeValue === '', s)
await shot('addpanel-reopened.png')

const failed = checks.filter(function (c) { return c.ok !== true })
console.log((failed.length === 0 ? 'PASS' : 'FAIL') + ': ' + (checks.length - failed.length) + '/' + checks.length + ' 项通过' + (failed.length > 0 ? '；失败项：' + failed.map(function (c) { return c.name }).join(' | ') : ''))
console.log('screenshots → ' + outDir)
process.exit(failed.length === 0 ? 0 : 1)
