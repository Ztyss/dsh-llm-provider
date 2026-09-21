// 定向复现（用户报）：编辑模型 → 保存 → 重开模型页，能力列立即反映编辑，不需要整页刷新。
// 路径：编辑器行点 ID 展开面板 → 取消勾选「视觉」→ 完成 → 保存 → 重开清单 →
// 断言 deepseek-flash 行能力列 = 推理（无视觉）。
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? join(here, 'client.js'), join(here, 'client.js'))
const outDir = join(tmpdir(), 'dsh-lp-editcaps')
mkdirSync(outDir, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=9353`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-ec-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 40s 未完成，强制退出'); process.exit(2) }, 40000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function versionInfo() {
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch('http://127.0.0.1:9353/json/version'); if (res.ok) return res.json() } catch {}
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
const list = await (await fetch('http://127.0.0.1:9353/json/list')).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1500, deviceScaleFactor: 1, mobile: false })
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') })
await cdp.waitFor('.pv_addBtn')
await sleep(400)
// 展开第一张卡 → 打开模型框 → 进编辑器
await cdp.eval(`(function(){ var cols = document.querySelectorAll('.pv_pcCaretCol'); if (cols.length > 0) cols[0].click() })()`)
await sleep(300)
await cdp.eval(`(function(){ var h = document.querySelector('.pv_pc .pv_mHead'); if (h !== null) h.click() })()`)
await sleep(300)
await cdp.eval(`(function(){
  var btns = document.querySelectorAll('button')
  for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === '编辑模型') { btns[i].click(); return }
})()`)
await cdp.waitFor('.pv_meRow')
await sleep(300)
// 点第一行的可编辑 ID → 展开行内编辑面板
await cdp.eval(`(function(){
  var cell = document.querySelector('.pv_meRow .pv_mId.pv_mIdEdit')
  if (cell === null) throw new Error('没有可编辑的行 ID')
  if (cell.textContent !== 'deepseek-flash') throw new Error('第一行不是 deepseek-flash：' + cell.textContent)
  cell.click()
})()`)
await cdp.waitFor('.pv_meEditPanel')
await sleep(200)
// 取消勾选「视觉」
const beforeCaps = await cdp.eval(`(function(){
  var caps = document.querySelector('.pv_mePanelCaps')
  var labels = caps.querySelectorAll('.pv_meCap')
  for (var i = 0; i < labels.length; i += 1) {
    if (labels[i].textContent.indexOf('视觉') !== -1) {
      var box = labels[i].querySelector('input[type=checkbox]')
      var was = box.checked
      box.click()
      return JSON.stringify({ wasChecked: was, nowChecked: box.checked })
    }
  }
  throw new Error('面板里没有「视觉」开关')
})()`)
console.log('取消视觉：' + beforeCaps)
// 完成 → 保存
await cdp.eval(`(function(){
  var btns = document.querySelectorAll('button')
  for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === '完成') { btns[i].click(); return }
})()`)
await sleep(200)
await cdp.eval(`(function(){
  var acts = document.querySelector('.pv_meActs')
  var btns = acts.querySelectorAll('button')
  for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === '保存') { btns[i].click(); return }
  throw new Error('没有保存按钮')
})()`)
await sleep(600)
// 保存后清单框折叠回清单页；若没有则点「模型（N）」头展开
await cdp.eval(`(function(){
  var rows = document.querySelectorAll('.pv_mRow')
  if (rows.length > 0) return
  var h = document.querySelector('.pv_pc .pv_mHead')
  if (h !== null) h.click()
})()`)
await cdp.waitFor('.pv_mRow')
await sleep(300)
const capsProbe = await cdp.eval(`(function(){
  var rows = document.querySelectorAll('.pv_mRow')
  for (var i = 0; i < rows.length; i += 1) {
    var id = rows[i].querySelector('.pv_mId')
    if (id !== null && id.textContent === 'deepseek-flash') {
      var caps = rows[i].querySelector('.pv_mCaps')
      return JSON.stringify({ capsText: caps !== null ? caps.textContent : '', declared: caps !== null ? caps.querySelectorAll('.pv_capDeclared').length : -1 })
    }
  }
  return JSON.stringify({ capsText: '', missing: true })
})()`)
console.log('保存后能力列：' + capsProbe)
const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
writeFileSync(join(outDir, 'after-save-caps.png'), Buffer.from(shot.data, 'base64'))
const p = JSON.parse(capsProbe)
const ok = p.capsText.indexOf('视觉') === -1 && p.capsText.indexOf('推理') !== -1
console.log((ok ? 'PASS' : 'FAIL') + ': 能力列' + (ok ? '立即反映编辑（视觉已摘、推理仍在）' : '未反映编辑——整页刷新前是旧值'))
process.exit(ok ? 0 : 1)
