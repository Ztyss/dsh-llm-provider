// 行内编辑面板的节奏回归探针（用户 11-17 报「思考档位选择框明显偏小、能力行与上下行
// 间距不一致」）。诊断结论：文本行 40px（输入框 34px）、能力行仅 26px（chips 20px）、
// checkbox 13×13——chips 与输入框比例失衡 + 行高不齐。修复后钉住：
//   1. 能力/思考档位 chips 同尺寸且 ≥26px 高、复选框 14×14（两族共用 .pv_meCap，天然一致）；
//   2. 能力行高 = 文本行高（±1px）——min-height 拉齐后垂直节奏一致；
//   3. 思考档位行 ≥ 文本行高（chips 换行时允许更高）；
//   4. 行间 gap 恒 6px。
// 跑法：node test/ui-harness/editpanel-rhythm-probe.mjs
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(join(here, '..', '..', 'lib', 'client.js'), join(here, 'client.js'))
mkdirSync(join(tmpdir(), 'dsh-lp-editrhythm'), { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=9359`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-epm-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 40s 未完成'); process.exit(2) }, 40000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function versionInfo() {
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch('http://127.0.0.1:9359/json/version'); if (res.ok) return res.json() } catch {}
    await sleep(200)
  }
  throw new Error('chrome down')
}
class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url); this.id = 0; this.pending = new Map()
    this.ready = new Promise((resolve) => { this.socket.onopen = () => resolve() })
    this.socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id); this.pending.delete(message.id)
        if (message.error !== undefined) reject(new Error(JSON.stringify(message.error)))
        else resolve(message.result)
      }
    }
  }
  send(method, params = {}) {
    this.id += 1; const id = this.id
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })) })
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text)
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
const list = await (await fetch('http://127.0.0.1:9359/json/list')).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1900, deviceScaleFactor: 1, mobile: false })
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') })
await cdp.waitFor('.pv_addBtn')
await sleep(500)

// Ykw 卡 → 编辑模型
await cdp.eval(`(function(){
  var cards = document.querySelectorAll('.pv_pc')
  for (var i = 0; i < cards.length; i += 1) {
    var name = cards[i].querySelector('.pv_pcName')
    if (name !== null && name.textContent.indexOf('Ykw') !== -1) { cards[i].querySelector('.pv_pcCaretCol').click(); return true }
  }
  throw new Error('没有 Ykw 卡')
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
})()`)
await sleep(300)
await cdp.eval(`(function(){
  var cards = document.querySelectorAll('.pv_pc')
  for (var i = 0; i < cards.length; i += 1) {
    var name = cards[i].querySelector('.pv_pcName')
    if (name !== null && name.textContent.indexOf('Ykw') !== -1) {
      var btns = cards[i].querySelectorAll('button')
      for (var b = 0; b < btns.length; b += 1) if (btns[b].textContent === '编辑模型') { btns[b].click(); return true }
    }
  }
})()`)
await cdp.waitFor('.pv_meRow')
await sleep(300)

// 添加自定义模型（带推理）→ 打开行内编辑面板
await cdp.eval(`(function(){
  var btns = document.querySelectorAll('.pv_me button')
  for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === '添加模型') { btns[i].click(); return true }
})()`)
await cdp.waitFor('.pv_meForm input.pv_field')
await cdp.eval(`(function(){
  var el = document.querySelector('.pv_meForm input.pv_field')
  var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, 'probe-cap')
  el.dispatchEvent(new Event('change', { bubbles: true }))
})()`)
await sleep(150)
await cdp.eval(`(function(){
  var labels = document.querySelectorAll('.pv_meForm label')
  for (var i = 0; i < labels.length; i += 1) if (labels[i].textContent === '推理') { labels[i].querySelector('input').click(); return true }
})()`)
await sleep(100)
await cdp.eval(`(function(){
  var btns = document.querySelectorAll('.pv_meForm button')
  for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === '添加') { btns[i].click(); return true }
})()`)
await sleep(250)
await cdp.eval(`(function(){
  var ids = document.querySelectorAll('.pv_meRow .pv_mId')
  for (var i = 0; i < ids.length; i += 1) if (ids[i].textContent === 'probe-cap') { ids[i].click(); return true }
})()`)
await cdp.waitFor('.pv_meEditPanel')
await sleep(300)

const report = await cdp.eval(`(function(){
  function chip(sel) {
    var el = document.querySelector(sel)
    if (el === null) return null
    var cs = getComputedStyle(el)
    var box = el.querySelector('input')
    var bcs = box === null ? null : getComputedStyle(box)
    var r = el.getBoundingClientRect()
    var br = box === null ? null : box.getBoundingClientRect()
    return {
      font: cs.fontSize + '/' + cs.lineHeight, pad: cs.padding, height: Math.round(r.height * 10) / 10,
      boxW: bcs === null ? null : bcs.width, boxH: bcs === null ? null : bcs.height,
      boxVisW: br === null ? null : Math.round(br.width * 10) / 10, boxVisH: br === null ? null : Math.round(br.height * 10) / 10,
      cls: el.className,
    }
  }
  function row(label) {
    var els = document.querySelectorAll('.pv_meEditPanel > .pv_line')
    for (var i = 0; i < els.length; i += 1) {
      var spans = els[i].querySelectorAll(':scope > span')
      if (spans.length > 0 && spans[0].textContent === label) {
        var r = els[i].getBoundingClientRect()
        var cs = getComputedStyle(els[i])
        return { top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, h: Math.round(r.height * 10) / 10, pad: cs.padding }
      }
    }
    return null
  }
  var capChip = chip('.pv_mePanelCaps .pv_meCap')
  var effChip = chip('.pv_meEffPool .pv_meCap')
  var effOn = chip('.pv_meEffPool .pv_meEffOn')
  var rName = row('显示名'), rCtx = row('上下文窗口'), rMax = row('最大输出'), rCaps = row('能力'), rEff = row('思考档位')
  return {
    capChip: capChip, effChip: effChip, effOn: effOn,
    rows: { name: rName, ctx: rCtx, max: rMax, caps: rCaps, eff: rEff },
    gaps: {
      maxToCaps: rMax !== null && rCaps !== null ? Math.round((rCaps.top - rMax.bottom) * 10) / 10 : null,
      capsToEff: rCaps !== null && rEff !== null ? Math.round((rEff.top - rCaps.bottom) * 10) / 10 : null,
      ctxToMax: rCtx !== null && rMax !== null ? Math.round((rMax.top - rCtx.bottom) * 10) / 10 : null,
    },
  }
})()`)
const failures = []
function check(name, cond, detail) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' → ' + JSON.stringify(detail)}`)
  if (!cond) failures.push(name)
}
check('能力 chips ≥26px 高、复选框 14×14', report.capChip !== null && report.capChip.height >= 26
  && report.capChip.boxVisW === 14 && report.capChip.boxVisH === 14, report.capChip)
check('思考档位 chips 与能力 chips 同尺寸（同族 .pv_meCap）', report.effChip !== null && report.capChip !== null
  && Math.abs(report.effChip.height - report.capChip.height) <= 0.5
  && report.effChip.boxVisW === report.capChip.boxVisW, { eff: report.effChip, cap: report.capChip })
check('能力行高 = 文本行高（±1px，垂直节奏一致）', report.rows.caps !== null && report.rows.max !== null
  && Math.abs(report.rows.caps.h - report.rows.max.h) <= 1, { caps: report.rows.caps?.h, max: report.rows.max?.h })
check('文本行彼此等高（±1px）', report.rows.name !== null && report.rows.ctx !== null && report.rows.max !== null
  && Math.abs(report.rows.name.h - report.rows.ctx.h) <= 1 && Math.abs(report.rows.ctx.h - report.rows.max.h) <= 1,
  { name: report.rows.name?.h, ctx: report.rows.ctx?.h, max: report.rows.max?.h })
check('思考档位行 ≥ 文本行高（换行允许更高）', report.rows.eff !== null && report.rows.max !== null
  && report.rows.eff.h >= report.rows.max.h - 1, { eff: report.rows.eff?.h, max: report.rows.max?.h })
check('行间 gap 恒 6px', report.gaps.ctxToMax === 6 && report.gaps.maxToCaps === 6 && report.gaps.capsToEff === 6, report.gaps)
// 面板长在 pv_meList 滚动容器里：把「能力」行滚进可视区再截图（overflow 容器不会被
// captureBeyondViewport 展开，不滚的话 chips 行永远在截图外）
await cdp.eval(`(function(){
  var els = document.querySelectorAll('.pv_meEditPanel > .pv_line')
  for (var i = 0; i < els.length; i += 1) {
    var spans = els[i].querySelectorAll(':scope > span')
    if (spans.length > 0 && spans[0].textContent === '能力') { els[i].scrollIntoView({ block: 'center' }); return true }
  }
  return false
})()`)
await sleep(150)
const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
writeFileSync(join(tmpdir(), 'dsh-lp-editrhythm', 'edit-panel.png'), Buffer.from(shot.data, 'base64'))
console.log(`  截图 → ${join(tmpdir(), 'dsh-lp-editrhythm', 'edit-panel.png')}`)
console.log(failures.length === 0 ? '\n编辑面板节奏探针全部通过' : `\n${failures.length} 个失败`)
kill()
process.exit(failures.length === 0 ? 0 : 1)
