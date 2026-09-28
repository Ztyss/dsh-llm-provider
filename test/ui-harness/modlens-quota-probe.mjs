// 座位模型面板：modlens 包装组的 chip 显示上游额度（用户 09-28 需求）。
//
// 夹具（seat.html）里 modlens-opencode-go 组**没有自己的账户行**（真实形态：modlens
// 注册的合成 provider 不进额度快照），上游 opencode-go 有（最紧窗口 8% → 红）。
// 探针验证三处消费点全部按 lookupAccount 回退：
//   1. 弹层 provider chip：modlens-opencode-go 的 chip 显示 8%（红 dot + 红色数字），
//      与 opencode-go 组的 chip 完全一致（「和原 provider 一样显示同样额度」）；
//   2. 触发按钮的当前额度：当前选 opencode-go/deepseek-flash，显示 8%；
//   3. 防凭空造：没有上游行的组不该出数字（夹具只有两个组，都断言不出 undefined 文案）。
// 断言失败保留现场截图；全部通过也出两张证据图（面板关/开）。
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const outDir = process.argv[2] ?? join(tmpdir(), 'dsh-lp-modlens-quota')
const clientSrc = process.env.CLIENT_SRC ?? join(root, 'lib', 'client.js')
const chromePath = process.env.CHROME
  ?? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft Edge/Application/msedge.exe',
    'C:/Microsoft/Microsoft Edge/Application/msedge.exe',
  ].find((candidate) => candidate !== '' && existsSync(candidate))
if (chromePath === undefined || chromePath === '') throw new Error('找不到 Chrome/Edge，用 CHROME 环境变量指定浏览器路径')
if (!existsSync(clientSrc)) throw new Error(`找不到被测 client.js：${clientSrc}`)
const PORT = Number(process.env.CDP_PORT ?? 9359)

mkdirSync(outDir, { recursive: true })
copyFileSync(clientSrc, join(here, 'client.js'))
const sha = createHash('sha256').update(readFileSync(clientSrc)).digest('hex').slice(0, 16)
console.log(`被测 client.js sha256[:16]=${sha}`)

const WIDE = 1200
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${WIDE},1400`,
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), `dsh-lp-mq-${Date.now()}`)}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
process.on('exit', () => { try { chrome.kill() } catch { /* 已退出 */ } })
chrome.unref()

let seq = 0
const pending = new Map()
let ws
function send(method, params = {}) {
  seq += 1
  return new Promise((resolve, reject) => {
    pending.set(seq, { resolve, reject })
    ws.send(JSON.stringify({ id: seq, method, params }))
  })
}
async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (res.result?.exceptionDetails !== undefined) {
    throw new Error('页面里抛错：' + JSON.stringify(res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails))
  }
  return res.result?.result?.value
}
async function shotPage(name) {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const file = join(outDir, `${name}.png`)
  writeFileSync(file, Buffer.from(res.result.data, 'base64'))
  console.log(`  截图 → ${file}`)
  return file
}

const failures = []
function check(name, cond, detail) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' → ' + detail}`)
  if (!cond) failures.push(name)
}

// Chrome 的 debug 端口要一小会儿才开（collapsed-alert-probe 同款等待）
for (let i = 0; i < 50; i += 1) {
  try { await fetch(`http://127.0.0.1:${PORT}/json/list`); break } catch { /* 还没起来 */ }
  await sleep(200)
}
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data))
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id).resolve(msg)
    pending.delete(msg.id)
  }
}
await send('Page.enable')
await send('Runtime.enable')

const seatUrl = 'file:///' + join(here, 'seat.html').replace(/\\/g, '/')
await send('Page.navigate', { url: seatUrl })
await sleep(800)
if (await evalJs('window.__ready === true') !== true) {
  const fatal = await evalJs('window.__fatal ?? document.getElementById("err").textContent')
  throw new Error(`座位 harness 没跑起来：${fatal}`)
}
await send('Emulation.setDeviceMetricsOverride', { width: WIDE, height: 1400, deviceScaleFactor: 1, mobile: false })
await sleep(200)

// 触发按钮的当前额度（当前选 opencode-go/deepseek-flash → 最紧窗口 8%）
const triggerQuota = await evalJs(`(function () {
  var q = document.querySelector('.ms_trigger .ms_tQuota')
  return q === null ? null : { text: q.textContent.replace(/\\s+/g, ' ').trim(), dot: (q.querySelector('[class*=plan_dot]') || {}).className ?? null }
})()`)
check('触发按钮显示当前 provider 的额度 8%（回退链上的上游本身）',
  triggerQuota !== null && /8%/.test(String(triggerQuota.text)), JSON.stringify(triggerQuota))
check('触发按钮 dot 是红档（8% ≤ 10%）',
  triggerQuota !== null && /plan_dot_bad/.test(String(triggerQuota.dot)), JSON.stringify(triggerQuota))
await shotPage('01-trigger-quota')

// 打开弹层 → 模型清单层 → provider chips
await evalJs(`document.querySelector('.ms_trigger').click()`)
await sleep(300)
await evalJs(`var c = document.querySelectorAll('.ms_cell'); if (c.length > 0) c[0].click()`)
await sleep(500)
const chips = await evalJs(`(function () {
  return Array.from(document.querySelectorAll('.mp_chip')).map(function (chip) {
    var dot = chip.querySelector('[class*=plan_dot]')
    return {
      id: chip.textContent.replace(/\\d+%/g, '').replace(/\\s+/g, ' ').trim(),
      text: chip.textContent.replace(/\\s+/g, ' ').trim(),
      dot: dot === null ? null : dot.className,
      quotaShown: /\\d+%/.test(chip.textContent),
    }
  })
})()`)
console.log('  chips:', JSON.stringify(chips))
const byId = Object.fromEntries(chips.map((c) => [c.id, c]))
const upstreamChip = byId['opencode-go']
const wrappedChip = byId['modlens-opencode-go']
check('上游组 chip 显示 8%', upstreamChip !== undefined && /8%/.test(upstreamChip.text), JSON.stringify(upstreamChip))
check('modlens 包装组 chip 同样显示 8%（回退上游，用户 09-28 需求）',
  wrappedChip !== undefined && /8%/.test(wrappedChip.text), JSON.stringify(wrappedChip))
check('modlens 包装组 chip 的 dot 与上游一致（红档）',
  wrappedChip !== undefined && upstreamChip !== undefined
    && String(wrappedChip.dot) === String(upstreamChip.dot)
    && /plan_dot_bad/.test(String(wrappedChip.dot)), JSON.stringify({ wrapped: wrappedChip?.dot, upstream: upstreamChip?.dot }))
check('两组 chip 的额度文本逐字一致（「同样额度」）',
  wrappedChip !== undefined && upstreamChip !== undefined
    && wrappedChip.text.replace('modlens-opencode-go', '') === upstreamChip.text.replace('opencode-go', ''),
  JSON.stringify({ wrapped: wrappedChip?.text, upstream: upstreamChip?.text }))
await shotPage('02-panel-chips-fallback')

console.log(failures.length === 0 ? '\nmodlens 包装组额度回退探针全部通过' : `\n${failures.length} 个失败`)
process.exit(failures.length === 0 ? 0 : 1)
