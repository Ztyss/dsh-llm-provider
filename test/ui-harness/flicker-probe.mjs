/**
 * 边框闪烁探针（红绿灯反馈环）：在 React 忠实的 mini-react v2 环境里，
 * 反复切换「服务商 ↔ pi-ai 桥接」页内标签，逐帧采样 .pv_pc 卡片的
 * borderTopColor 亮度 + CSSTransition(border-color) 出现情况 + 节点身份复用。
 *
 * 判红（= 用户可见的「边框先变黑再恢复」）：
 *   1) 切换后 350ms 内出现 border-color 的 CSSTransition（class 被加到已有节点上才会触发）；
 *   2) 或首次出现的 .pv_pc 卡片边框亮度 < 0.5（近黑）。
 * 同时截图 4 张（切换前 / +0ms / +90ms / +250ms）供人工目视复核。
 *
 *   node test/ui-harness/flicker-probe.mjs [client.js 路径] [输出目录]
 *
 * 退出码：0 = 绿（无闪烁），1 = 红（复现闪烁），2 = 环境错误。
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[3] ?? join(tmpdir(), 'dsh-lp-flicker')
const clientSrc = process.argv[2]
  ?? join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', '@ztyss', 'dsh-llm-provider', 'lib', 'client.js')
const chromePath = process.env.CHROME
  ?? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].find((candidate) => candidate !== '' && existsSync(candidate))
if (chromePath === undefined || chromePath === '') throw new Error('找不到 Chrome/Edge，用 CHROME 环境变量指定')
if (!existsSync(clientSrc)) throw new Error(`找不到被测 client.js：${clientSrc}`)
const PORT = Number(process.env.CDP_PORT ?? 9337)
const CYCLES = Number(process.env.CYCLES ?? 3)

mkdirSync(outDir, { recursive: true })
copyFileSync(clientSrc, join(here, 'client.js'))
console.log(`被测 client.js: ${clientSrc} → ${join(here, 'client.js')}\n输出目录: ${outDir}\n`)

const profileDir = join(tmpdir(), `dsh-lp-flicker-chrome-${Date.now()}`)
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1500,1500',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
process.on('exit', () => { try { chrome.kill() } catch { /* 已退出 */ } })

async function waitForEndpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return
    } catch { /* 还没起来 */ }
    await sleep(250)
  }
  throw new Error('Chrome 没起来（CDP 端口无响应）')
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
}

const SAMPLER = `
window.__probeFlicker = function (durationMs) {
  return new Promise(function (resolve) {
    var frames = []
    var transitions = []
    var t0 = performance.now()
    function luminance(color) {
      var m = /^rgba?\\(([^)]+)\\)/.exec(color)
      if (m === null) return null
      var p = m[1].split(',').map(Number)
      var a = p.length > 3 ? p[3] : 1
      // 半透明色先合成到白底（页面背景）再算亮度：rgba(0,0,0,.15) 合成后是浅灰
      // （≈217,217,217，正常边框），不合成会把它误判成纯黑
      var r = a * p[0] + (1 - a) * 255
      var g = a * p[1] + (1 - a) * 255
      var b = a * p[2] + (1 - a) * 255
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    }
    function sample() {
      var now = Math.round(performance.now() - t0)
      var cards = []
      var els = document.querySelectorAll('.pv_pc')
      for (var i = 0; i < els.length; i += 1) {
        var el = els[i]
        if (el.__probeTag === undefined) {
          window.__probeN = (window.__probeN || 0) + 1
          el.__probeTag = 'e' + window.__probeN
        }
        var cs = getComputedStyle(el)
        var anims = []
        try {
          var list = el.getAnimations()
          for (var a = 0; a < list.length; a += 1) {
            if (typeof list[a].transitionProperty === 'string') anims.push(list[a].transitionProperty)
          }
        } catch (ignored) { /* 旧内核无 getAnimations */ }
        if (anims.indexOf('border-color') >= 0) transitions.push(now)
        cards.push({
          tag: el.__probeTag,
          cls: el.className,
          border: cs.borderTopColor,
          bstyle: cs.borderTopStyle,
          lum: luminance(cs.borderTopColor),
          anims: anims,
        })
      }
      frames.push({ t: now, cards: cards })
      if (performance.now() - t0 < durationMs) requestAnimationFrame(sample)
      else resolve({ frames: frames, transitions: transitions })
    }
    requestAnimationFrame(sample)
  })
}
window.__probeTagAll = function () {
  var root = document.querySelector('.pv_stack')
  if (root === null) return 0
  var all = root.querySelectorAll('div')
  for (var i = 0; i < all.length; i += 1) {
    if (all[i].__probeTag === undefined) {
      window.__probeN = (window.__probeN || 0) + 1
      all[i].__probeTag = 'e' + window.__probeN
    }
  }
  return all.length
}
window.__probeReuseCheck = function () {
  var card = document.querySelector('.pv_pc')
  if (card === null) return null
  return { tag: card.__probeTag ?? null, cls: card.className }
}
`

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise,
  })
  if (result.exceptionDetails !== undefined) {
    throw new Error('页面执行出错: ' + JSON.stringify(result.exceptionDetails.exception?.description ?? result.exceptionDetails))
  }
  return result.result?.value
}

async function shot(cdp, path) {
  const data = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path, Buffer.from(data.data, 'base64'))
}

await waitForEndpoint()
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = targets.find((t) => t.type === 'page')
const cdp = new Cdp(page.webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') })

// 等客户端挂载（服务商 tab 出现）
let mounted = false
for (let i = 0; i < 60; i += 1) {
  mounted = await evaluate(cdp, "document.querySelector('.pv_tab') !== null")
  if (mounted === true) break
  await sleep(250)
}
if (mounted !== true) {
  console.error('客户端没挂载（.pv_tab 不存在）')
  process.exit(2)
}
await evaluate(cdp, SAMPLER)
await sleep(400)

const results = []
for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
  // 回到服务商 tab 并稳定
  await evaluate(cdp, "document.querySelectorAll('.pv_tab')[0].click()")
  await sleep(300)
  // 截切换前基准图 + 记录切换前的节点身份
  await shot(cdp, join(outDir, `c${cycle}-0-before.png`))
  const tagged = await evaluate(cdp, 'window.__probeTagAll()')
  const sampling = evaluate(cdp, 'window.__probeFlicker(700)', true)
  await sleep(30) // 让 rAF 采样器先跑起来
  await evaluate(cdp, "document.querySelectorAll('.pv_tab')[1].click()")
  await shot(cdp, join(outDir, `c${cycle}-1-plus0.png`))
  await sleep(90)
  await shot(cdp, join(outDir, `c${cycle}-2-plus90.png`))
  await sleep(160)
  await shot(cdp, join(outDir, `c${cycle}-3-plus250.png`))
  const sample = await sampling
  const reuse = await evaluate(cdp, 'window.__probeReuseCheck()')

  // 分析：350ms 内出现 border-color CSSTransition，或新卡片首帧亮度 < 0.5
  const transitionTimes = [...new Set(sample.transitions)].filter((t) => t <= 350)
  let darkAt = null
  for (const frame of sample.frames) {
    if (frame.t > 350) break
    for (const card of frame.cards) {
      if (card.lum !== null && card.lum < 0.5) { darkAt = frame.t; break }
    }
    if (darkAt !== null) break
  }
  const red = transitionTimes.length > 0 || darkAt !== null
  results.push({
    cycle, red,
    transition: transitionTimes.length > 0 ? transitionTimes : null,
    darkAt,
    reuse: reuse === null ? null : { tag: reuse.tag, taggedBeforeSwitch: reuse.tag !== null, cls: reuse.cls },
    frames: sample.frames.length,
  })
  console.log(`cycle ${cycle}: ${red ? 'RED 闪烁' : 'green'}  transition@${JSON.stringify(transitionTimes)} darkFirst@${darkAt} cardTag=${reuse?.tag} cls=${reuse?.cls}`)
}

chrome.kill()
const anyRed = results.some((r) => r.red)
console.log('\n' + (anyRed
  ? 'RED：复现「边框先变黑再恢复」（class 加到复用节点上触发 border-color transition）'
  : 'GREEN：无 border-color 过渡、无深色帧'))
process.exit(anyRed ? 1 : 0)
