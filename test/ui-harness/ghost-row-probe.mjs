// 定向验证（用户 10-10 报）：在模型清单页删除自定义模型并保存后，重开模型清单页
// 已删模型仍在显示，重进 provider 卡片才消失。
// 根因：detailsById 只在挂载拉一次（effect []），onSaved 本地覆盖只合并不删除——
// 被删条目的 `路由id/模型id` 键留在索引里，重开被 own-details 分支重新加回行。
// 病灶复刻：夹具预置 glm-legacy-custom（已声明 + MODELS 里有 route-own 详情 + 目录
// 未收录故有 ✕），探针删它、保存、重开。
//
// ⚠️ 垫片边界（2026-10-10 实证，本仓库第三起垫片/真机分叉）：harness 的 react 垫片
// useState 不随卸载/重挂重置——重开编辑器渲染的是 round1 草稿行集，buildEditRows
// 的重挂重建在垫片下根本不发生，幽灵行「看不见」。真机 React 会重挂重建 → 幽灵行
// 出现。因此本探针的主断言是**状态层后置条件**（经组件侧 __lpEditorProbe 仪表）：
// 保存后重开，detailsById 本路由名下不得再有被删条目的键（旧行为实测留着：
// round2 routeDetailKeys 仍含 glm-legacy-custom、detailTotal 14；修复后剪为
// 12 且键消失）。DOM 断言保留为草稿链路的顺带回归。
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? join(here, '..', '..', 'lib', 'client.js'), join(here, 'client.js'))
const outDir = join(tmpdir(), 'dsh-lp-ghostrow')
mkdirSync(outDir, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=9357`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-gr-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 60s 未完成，强制退出'); process.exit(2) }, 60000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function versionInfo() {
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch('http://127.0.0.1:9357/json/version'); if (res.ok) return res.json() } catch {}
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
  async waitForGone(selector, timeoutMs = 10000) {
    const started = Date.now()
    for (;;) {
      const found = await this.eval(`document.querySelector(${JSON.stringify(selector)}) === null`)
      if (found === true) return true
      if (Date.now() - started > timeoutMs) throw new Error('waitForGone 超时：' + selector)
      await sleep(150)
    }
  }
}
await versionInfo()
const list = await (await fetch('http://127.0.0.1:9357/json/list')).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1500, deviceScaleFactor: 1, mobile: false })
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') })
await cdp.waitFor('.pv_addBtn')
await sleep(400)

const failures = []
function check(name, cond, detail) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' → ' + JSON.stringify(detail)}`)
  if (!cond) failures.push(name)
}

// 找到 Ykw 卡 → 展开（已展开则跳过，caret 是切换键，重复点会把卡收起）→ 模型盒 → 编辑器
async function openEditor(label) {
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
  await sleep(300)
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
  await sleep(300)
  await cdp.eval(`(function(){
    var btns = document.querySelectorAll('button')
    for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === '编辑模型') { btns[i].click(); return true }
    throw new Error('没有找到「编辑模型」按钮')
  })()`)
  await cdp.waitFor('.pv_meRow')
  await sleep(250)
  console.log('  · ' + label)
}

/** 行清单快照：{ id → {checked, del} } */
async function rowSnapshot() {
  const rows = await cdp.eval(`(function(){
    return Array.from(document.querySelectorAll('.pv_meRow')).map(function (row) {
      var check = row.querySelector('.pv_meCheck')
      return { id: (row.querySelector('.pv_mId') || {}).textContent ?? '?', checked: check === null ? null : check.checked, del: row.querySelector('button') !== null }
    })
  })()`)
  return Object.fromEntries(rows.map((r) => [r.id, r]))
}
async function clickIn(scopeSelector, label) {
  await cdp.eval(`(function(){
    var scope = document.querySelector(${JSON.stringify(scopeSelector)})
    if (scope === null) throw new Error('没有作用域 ' + ${JSON.stringify(scopeSelector)})
    var btns = scope.querySelectorAll('button')
    for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === ${JSON.stringify(label)}) { btns[i].click(); return true }
    throw new Error(${JSON.stringify(scopeSelector)} + ' 里没有「' + ${JSON.stringify(label)} + '」按钮')
  })()`)
}

// ---- 1. 进编辑器：病灶行在列、勾选、带 ✕ ----
await openEditor('第一轮：进入编辑器')
let probe1 = await cdp.eval(`(function(){ return window.__lpEditorProbe === undefined ? null : JSON.parse(JSON.stringify(window.__lpEditorProbe)) })()`)
check('round1 状态：详情索引含本路由幽灵键（病灶前置）', probe1 !== null && probe1.routeDetailKeys.indexOf('glm-legacy-custom') !== -1, probe1)
let rows1 = await rowSnapshot()
check('预置自定义行 glm-legacy-custom 在列且勾选', rows1['glm-legacy-custom'] !== undefined && rows1['glm-legacy-custom'].checked === true, Object.keys(rows1))
check('预置自定义行带 ✕（declared 且目录未收录）', rows1['glm-legacy-custom'] !== undefined && rows1['glm-legacy-custom'].del === true)
check('声明行 glm-5.3-flash 在列（同名目录版优先，无 ✕）', rows1['glm-5.3-flash'] !== undefined && rows1['glm-5.3-flash'].del === false)

// ---- 2. ✕ 删除 glm-legacy-custom → 保存 ----
await cdp.eval(`(function(){
  var rows = document.querySelectorAll('.pv_meRow')
  for (var i = 0; i < rows.length; i += 1) {
    var id = rows[i].querySelector('.pv_mId')
    if (id !== null && id.textContent === 'glm-legacy-custom') { rows[i].querySelector('button').click(); return true }
  }
  throw new Error('没有找到 glm-legacy-custom 行')
})()`)
await sleep(200)
await clickIn('.pv_me', '保存')
await cdp.waitForGone('.pv_me')
await sleep(700) // 等 onProviderAdded 的异步刷新（/plan/status 回新清单）

// 保存载荷的前置确认：真的没带被删条目（否则后面断言无意义）
const savedIds = await cdp.eval(`(window.__lastSetModels && Array.isArray(window.__lastSetModels.models)) ? window.__lastSetModels.models.map(function (m) { return m.id }) : null`)
check('保存载荷已不含 glm-legacy-custom', Array.isArray(savedIds) === true && savedIds.indexOf('glm-legacy-custom') === -1, savedIds)

// ---- 3. 重开：主断言=状态层后置条件；DOM 断言=草稿链路顺带回归 ----
await openEditor('第二轮：重开验证删除生效')
let probe2 = await cdp.eval(`(function(){ return window.__lpEditorProbe === undefined ? null : JSON.parse(JSON.stringify(window.__lpEditorProbe)) })()`)
check('【主断言·状态层】保存后重开，detailsById 本路由名下无幽灵键（旧行为留着它）',
  probe2 !== null && probe2.routeDetailKeys.indexOf('glm-legacy-custom') === -1, probe2)
check('【主断言·状态层】保存后 declared 已不含被删条目',
  probe2 !== null && probe2.declaredIds.indexOf('glm-legacy-custom') === -1, probe2)
let rows2 = await rowSnapshot()
check('DOM：被删行不显示（垫片下为草稿链路回归；真机由主断言保证）', rows2['glm-legacy-custom'] === undefined, Object.keys(rows2))
check('声明行 glm-5.3-flash 不受牵连（仍勾选）', rows2['glm-5.3-flash'] !== undefined && rows2['glm-5.3-flash'].checked === true)
check('目录候选 glm-5.3 / glm-4.7 仍在', rows2['glm-5.3'] !== undefined && rows2['glm-4.7'] !== undefined)

const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
const file = join(outDir, 'ghost-row-after-delete.png')
writeFileSync(file, Buffer.from(shot.data, 'base64'))
console.log(`  截图 → ${file}`)

console.log(failures.length === 0 ? '\n幽灵行探针全部通过' : `\n${failures.length} 个失败`)
process.exit(failures.length === 0 ? 0 : 1)
