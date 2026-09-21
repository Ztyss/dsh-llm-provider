/**
 * 协议 select 对齐探针：在干净 harness（只有本插件自己的样式）里打开添加供应商表单，
 * 对「协议」select 与「API 地址」input 同框取证——量出值文本的左内缩，判断偏右是
 * 外来样式污染还是本插件自己给 select 的样式（display:inline-flex 等）造成。
 *
 *   node test/ui-harness/select-probe.mjs [输出目录]
 *
 * 输出：computed style 断言 + 三倍放大元素截图（input / select 各一张）。
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] ?? join(tmpdir(), 'dsh-lp-select-probe')
const clientSrc = process.env.CLIENT_SRC
  ?? join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', '@ztyss', 'dsh-llm-provider', 'lib', 'client.js')
const chromePath = process.env.CHROME
  ?? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => candidate !== '' && existsSync(candidate))
if (chromePath === undefined || chromePath === '') throw new Error('找不到 Chrome/Edge，用 CHROME 环境变量指定浏览器路径')
if (!existsSync(clientSrc)) throw new Error(`找不到被测 client.js：${clientSrc}`)
const PORT = Number(process.env.CDP_PORT ?? 9341)

mkdirSync(outDir, { recursive: true })
copyFileSync(clientSrc, join(here, 'client.js'))
const sha = createHash('sha256').update(readFileSync(clientSrc)).digest('hex').slice(0, 16)
console.log(`被测 client.js sha256[:16]=${sha}`)

const profileDir = join(tmpdir(), `dsh-lp-chrome-probe-${Date.now()}`)
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1500,1500',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
process.on('exit', () => { try { chrome.kill() } catch { /* 已退出 */ } })
try { rmSync(profileDir, { recursive: true, force: true }) } catch { /* Windows 下可能仍被占用 */ }

for (let i = 0; i < 60; i += 1) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
    if (res.ok) break
  } catch { /* 还没起来 */ }
  await sleep(250)
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find((target) => target.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
let seq = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
})
function send(method, params = {}) {
  return new Promise((resolve) => { seq += 1; pending.set(seq, resolve); ws.send(JSON.stringify({ id: seq, method, params })) })
}
async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true })
  return res.result?.result?.value
}
async function shotClip(name, clip) {
  const res = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 3 } })
  const file = join(outDir, `${name}.png`)
  writeFileSyncLocal(file, Buffer.from(res.result.data, 'base64'))
  console.log(`  截图 → ${file}`)
  return file
}
import { writeFileSync as writeFileSyncLocal } from 'node:fs'

const HOSTILE = process.env.HOSTILE === '1'
await send('Page.enable')
await send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') + (HOSTILE ? '?hostile=1' : '') })
for (let i = 0; i < 40; i += 1) {
  if (await evalJs(`document.querySelector('.pv_addBtn') !== null`) === true) break
  await sleep(250)
}
// 展开第一张供应商卡 → 行内编辑面板（协议 select 就在这里，即用户截图的「修改页面」）
await evalJs(`
  var col = document.querySelector('.pv_pcCaretCol')
  if (col === null) { var head = document.querySelector('.pv_pcHead'); if (head !== null) head.click() } else { col.click() }
`)
for (let i = 0; i < 20; i += 1) {
  if (await evalJs(`Array.from(document.querySelectorAll('select.pv_field')).some(function (el) { return el.getBoundingClientRect().width > 0 })`) === true) break
  await sleep(200)
}

const metrics = await evalJs(`(function () {
  function pick(sel) { return document.querySelector(sel) }
  var selectEl = Array.from(document.querySelectorAll('select.pv_field')).find(function (el) { return el.getBoundingClientRect().width > 0 })
  var inputEl = Array.from(document.querySelectorAll('input.pv_field')).find(function (el) { return el.getBoundingClientRect().width > 0 })
  if (selectEl === undefined) return { error: 'no visible select.pv_field' }
  function info(el) {
    var cs = getComputedStyle(el)
    var r = el.getBoundingClientRect()
    return {
      tag: el.tagName,
      display: cs.display,
      appearance: cs.appearance || cs.getPropertyValue('-webkit-appearance'),
      textAlign: cs.textAlign,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      fontSize: cs.fontSize,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    }
  }
  return { select: info(selectEl), input: inputEl === undefined ? null : info(inputEl) }
})()`)
console.log('computed:', JSON.stringify(metrics, null, 2))
if (metrics.error !== undefined) { ws.close(); throw new Error(metrics.error) }

// 断言：内联样式钉死的对齐在（敌意）样式表覆盖下仍然生效
const s = metrics.select
const assertOk = s.paddingLeft === '12px' && s.paddingRight === '28px' && s.textAlign === 'left' && s.appearance === 'none'
console.log(`assert[${HOSTILE ? 'hostile' : 'clean'}]: paddingLeft=12px/${s.paddingLeft} paddingRight=28px/${s.paddingRight} textAlign=left/${s.textAlign} appearance=none/${s.appearance} → ${assertOk ? 'PASS' : 'FAIL'}`)

// 元素级放大截图：select 一张、input 一张（同 scale 便于对比）
const sr = metrics.select.rect
await shotClip(`probe-select${HOSTILE ? '-hostile' : ''}`, { x: Math.max(0, sr.x - 4), y: Math.max(0, sr.y - 4), width: sr.w + 8, height: sr.h + 8 })
if (metrics.input !== null) {
  const ir = metrics.input.rect
  await shotClip('probe-input', { x: Math.max(0, ir.x - 4), y: Math.max(0, ir.y - 4), width: ir.w + 8, height: ir.h + 8 })
}

// 文本起点探针：用 Range 把 select 的当前值文字圈出来量左缘（无需像素脚本）
const textInset = await evalJs(`(function () {
  function insetOf(el) {
    var r = document.createRange()
    if (el.tagName === 'SELECT') {
      var opt = el.selectedOptions[0]
      if (opt === undefined) return null
      r.selectNodeContents(opt)
    } else {
      r.selectNodeContents(el)
    }
    var rects = r.getClientRects()
    if (rects.length === 0) return null
    var box = el.getBoundingClientRect()
    return { textLeft: rects[0].left - box.left, borderLeft: box.left }
  }
  var selectEl = Array.from(document.querySelectorAll('select.pv_field')).find(function (el) { return el.getBoundingClientRect().width > 0 })
  var inputEl = Array.from(document.querySelectorAll('input.pv_field')).find(function (el) { el.focus(); return el.getBoundingClientRect().width > 0 })
  return { selectTextInset: insetOf(selectEl), inputTextInset: inputEl === undefined ? null : insetOf(inputEl) }
})()`)
console.log('text-inset:', JSON.stringify(textInset))

if (assertOk !== true) { ws.close(); throw new Error('内联对齐样式未生效：' + JSON.stringify(s)) }
ws.close()
console.log('PROBE-DONE')
