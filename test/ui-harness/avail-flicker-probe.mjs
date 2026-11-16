// 「可用模型」面板的布局跳动探针（用户 11-16 报：点开面板会先闪一下才出现列表）。
//
// 病灶：面板的列表容器原来只在 phase==='ok' 时挂载——点开先画「空壳」（标题 + 过滤框 +
// 一行拉取提示，矮），请求回来才长出列表容器（表头 + 行，最高 264px），两次渲染之间面板
// 整体长高一截、页面滚动条跟着重排，看着就是闪一下。
//
// 断言（几何级，全部 getBoundingClientRect）：
//   1. 点「可用模型」后**立刻**出面板（不是等数据回来才展开）；
//   2. 拉取中的列表容器已在位，且高度与就绪态**逐像素一致**（min-height 兜住）；
//   3. 列表出现前后，面板整体高度不变（这才是「不闪」的定义）；
//   4. 就绪态表头与数据行同宽对齐（表头 sticky、全选在表头第一格）；
//   5. 已在清单的条目置灰、不可选。
//
// 跑法：node test/ui-harness/avail-flicker-probe.mjs [lib/client.js]
// 环境变量 CLIENT_SRC 可覆盖被测产物；CHROME 可覆盖浏览器路径。
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? process.argv[2] ?? join(here, '..', '..', 'lib', 'client.js'), join(here, 'client.js'))
const outDir = join(tmpdir(), 'dsh-lp-availflicker')
mkdirSync(outDir, { recursive: true })
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9357
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-af-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 60s 未完成，强制退出'); process.exit(2) }, 60000)
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
  async waitFor(selector, timeoutMs = 10000) {
    const started = Date.now()
    for (;;) {
      const found = await this.eval(`document.querySelector(${JSON.stringify(selector)}) !== null`)
      if (found === true) return true
      if (Date.now() - started > timeoutMs) throw new Error('waitFor 超时：' + selector)
      await sleep(100)
    }
  }
}

await versionInfo()
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1400, deviceScaleFactor: 1, mobile: false })
// availDelay=1200：让「拉取中」这一态停住，才采得到它的几何
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html?availDelay=1200').replace(/\\/g, '/') })
await cdp.waitFor('.pv_addBtn')
await sleep(500)

const failures = []
function check(name, cond, detail) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' → ' + JSON.stringify(detail)}`)
  if (!cond) failures.push(name)
}

// 进 custom 路由（Ykw）的模型编辑器：卡片展开 → 模型盒 → 编辑模型（同 form-error-probe 的路径）
await cdp.eval(`(function(){
  var cards = document.querySelectorAll('.pv_pc')
  for (var i = 0; i < cards.length; i += 1) {
    var name = cards[i].querySelector('.pv_pcName')
    if (name !== null && name.textContent.indexOf('Ykw') !== -1) { cards[i].querySelector('.pv_pcCaretCol').click(); return true }
  }
  throw new Error('没有找到 Ykw 卡片')
})()`)
await sleep(300)
await cdp.eval(`(function(){
  var cards = document.querySelectorAll('.pv_pc')
  for (var i = 0; i < cards.length; i += 1) {
    var name = cards[i].querySelector('.pv_pcName')
    if (name !== null && name.textContent.indexOf('Ykw') !== -1) {
      var h = cards[i].querySelector('.pv_mHead')
      if (h !== null) h.click()
      return true
    }
  }
  throw new Error('没有找到模型盒头')
})()`)
await sleep(300)
await cdp.eval(`(function(){
  var cards = document.querySelectorAll('.pv_pc')
  for (var i = 0; i < cards.length; i += 1) {
    var name = cards[i].querySelector('.pv_pcName')
    if (name !== null && name.textContent.indexOf('Ykw') !== -1) {
      var btns = cards[i].querySelectorAll('button')
      for (var b = 0; b < btns.length; b += 1) if (btns[b].textContent === '编辑模型') { btns[b].click(); return true }
      throw new Error('卡内没有「编辑模型」按钮')
    }
  }
  throw new Error('没有找到 Ykw 卡片')
})()`)
await cdp.waitFor('.pv_meRow')
await sleep(400)

// 点「可用模型」：不 sleep，立刻采样「拉取中」的几何
await cdp.eval(`(function(){
  var btns = document.querySelectorAll('.pv_me button')
  for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === '可用模型') { btns[i].click(); return true }
  throw new Error('没有找到「可用模型」按钮')
})()`)

const geom = () => cdp.eval(`(function(){
  var panel = document.querySelector('.pv_meForm.pv_avail')
  var listEl = document.querySelector('.pv_availList')
  var head = document.querySelector('.pv_availHead')
  return {
    panel: panel === null ? null : Math.round(panel.getBoundingClientRect().height * 100) / 100,
    list: listEl === null ? null : Math.round(listEl.getBoundingClientRect().height * 100) / 100,
    head: head === null ? null : Math.round(head.getBoundingClientRect().width * 100) / 100,
    text: panel === null ? '' : panel.textContent,
    rows: document.querySelectorAll('.pv_availRow').length,
  }
})()`)

// React 要一拍才把面板画出来：等 150ms（远早于 mock 的 1200ms 数据延迟），再采「拉取中」的几何
await sleep(150)
const running = await geom()
check('点开即出面板（不等数据回来才展开）', running.panel !== null, running)
check('拉取中就有列表容器（不是空壳）', running.list !== null, running.list)
check('拉取中显示「正在从端点拉取…」', String(running.text).indexOf('正在从端点拉取') !== -1, running.text.slice(0, 40))
check('拉取中还没有数据行', running.rows === 0, running.rows)

// 等就绪（表头出现）后再采样
await cdp.waitFor('.pv_availHead', 15000)
await sleep(400)
const ready = await geom()
check('就绪后出现数据行', ready.rows > 0, ready.rows)
check('列表容器高度与拉取中逐像素一致（无跳动）', running.list !== null && ready.list !== null && Math.abs(ready.list - running.list) <= 1,
  { running: running.list, ready: ready.list })
check('容器定高 150px 级——4 模型不留大段底部空白（用户 11-16 批注）',
  ready.list !== null && ready.list >= 148 && ready.list <= 158, ready.list)
check('面板整体高度与拉取中一致（页面不跟着重排）', running.panel !== null && ready.panel !== null && Math.abs(ready.panel - running.panel) <= 1,
  { running: running.panel, ready: ready.panel })

// 表头与数据行同宽（同一套网格列宽；宽 1px 以上就算错位）
const widths = await cdp.eval(`(function(){
  var head = document.querySelector('.pv_availHead')
  var row = document.querySelector('.pv_availRow')
  var f = function (el) { return el === null ? null : Math.round(el.getBoundingClientRect().width * 100) / 100 }
  return { head: f(head), row: f(row) }
})()`)
check('表头与数据行同宽对齐', widths.head !== null && widths.row !== null && Math.abs(widths.head - widths.row) <= 1, widths)
// 列模板逐列一致 + 表头底色与容器一致（「标题栏和模型清单一致」批注的回归钉子）：
// 表头吸顶靠不透明底遮滚过的行，底色必须跟列表容器同色，否则灰面板里横一条白杠
const consistency = await cdp.eval(`(function(){
  var head = document.querySelector('.pv_availHead')
  var row = document.querySelector('.pv_availRow')
  var list = document.querySelector('.pv_availList')
  if (head === null || row === null || list === null) return { ok: false, why: 'missing' }
  var hs = getComputedStyle(head), rs = getComputedStyle(row), ls = getComputedStyle(list)
  return {
    sameCols: hs.gridTemplateColumns === rs.gridTemplateColumns,
    headCols: hs.gridTemplateColumns,
    rowCols: rs.gridTemplateColumns,
    sameBg: hs.backgroundColor === ls.backgroundColor,
    headBg: hs.backgroundColor,
    listBg: ls.backgroundColor,
    sticky: hs.position === 'sticky',
  }
})()`)
check('表头与数据行列模板逐列一致（勾选/ID/上下文/最大输出/标记）', consistency.sameCols === true,
  { head: consistency.headCols, row: consistency.rowCols })
check('表头吸顶保留且底色与列表容器一致（不出白杠）', consistency.sticky === true && consistency.sameBg === true,
  { head: consistency.headBg, list: consistency.listBg })
check('能力列已移除（表头无「能力」标签、行内无徽标格）', await cdp.eval(`(function(){
  var head = document.querySelector('.pv_availHead')
  if (head === null) return false
  if (head.textContent.indexOf('能力') !== -1) return false
  return document.querySelector('.pv_availCaps') === null && document.querySelectorAll('.pv_availRow .pv_capMini').length === 0
})()`) === true)
check('全选在表头第一格', await cdp.eval(`(function(){
  var head = document.querySelector('.pv_availHead')
  if (head === null) return false
  var first = head.children[0]
  return first !== undefined && first.querySelector('input[type=checkbox]') !== null
})()`) === true)
check('「已选 N」计数已从面板移除', String(ready.text).indexOf('已选 ') === -1, ready.text.slice(0, 60))
check('已在清单的条目置灰且不可选', await cdp.eval(`(function(){
  var rows = document.querySelectorAll('.pv_availRow')
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].className.indexOf('pv_availRowOff') !== -1) {
      var box = rows[i].querySelector('input[type=checkbox]')
      return box !== null && box.disabled === true
    }
  }
  return false
})()`) === true)

// 点一行勾选 → 「添加所选（1）」可用；再加进草稿后清单里出现该模型
await cdp.eval(`(function(){
  var rows = document.querySelectorAll('.pv_availRow')
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].className.indexOf('pv_availRowOff') === -1) {
      var box = rows[i].querySelector('input[type=checkbox]')
      if (box !== null) { box.click(); return true }
    }
  }
  throw new Error('没有可勾选的行')
})()`)
await sleep(200)
check('勾选后「添加所选（1）」按钮可点', await cdp.eval(`(function(){
  var btns = document.querySelectorAll('.pv_avail button')
  for (var i = 0; i < btns.length; i += 1) {
    if (btns[i].textContent.indexOf('添加所选（1）') !== -1) return btns[i].disabled !== true
  }
  return false
})()`) === true)

const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
writeFileSync(join(outDir, 'avail-panel.png'), Buffer.from(shot.data, 'base64'))
console.log(`  截图 → ${join(outDir, 'avail-panel.png')}`)

console.log(failures.length === 0 ? '\n可用模型面板布局探针全部通过' : `\n${failures.length} 个失败`)
process.exit(failures.length === 0 ? 0 : 1)
