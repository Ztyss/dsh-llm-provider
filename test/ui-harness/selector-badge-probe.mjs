// 定向验证（用户 10-12 报）：设置页新增自定义模型保存后，模型选择器里该模型
// 没有能力徽标与上下文标注（清单页有）。
// 根因：model-seat 的详情索引只在挂载时拉一次；开菜单重拉了目录与额度、唯独没拉
// 详情图——旧图里没有新声明的合成条目。修复：开菜单 effect 里补拉 loadModelDetailMap。
// 路径：打开选择器（基线快照）→ 关闭 → 注入声明条目（模拟设置页保存）→ 重开 →
// 断言新行带 视觉/推理 徽标与 1M 上下文。旧 bundle（不补拉）红，新构建绿。
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? join(here, '..', '..', 'lib', 'client.js'), join(here, 'client.js'))
const outDir = join(tmpdir(), 'dsh-lp-selbadge')
mkdirSync(outDir, { recursive: true })
const PORT = 9361
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-sb-' + Date.now())}`, 'about:blank',
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
}
await versionInfo()
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1400, deviceScaleFactor: 1, mobile: false })
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'seat.html').replace(/\\/g, '/') })
await cdp.waitFor('.ms_trigger')
await sleep(800)
if (await cdp.eval('window.__ready === true') !== true) {
  throw new Error('座位 harness 没跑起来：' + String(await cdp.eval('window.__fatal ?? document.getElementById("err").textContent')))
}

const failures = []
function check(name, cond, detail) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' → ' + JSON.stringify(detail)}`)
  if (!cond) failures.push(name)
}

/** 选择器里 opencode-go 组各行的 {id → {caps, ctx}} */
async function rowState() {
  return await cdp.eval(`(function(){
    var out = {}
    var rows = document.querySelectorAll('.ms_option')
    for (var i = 0; i < rows.length; i += 1) {
      var name = rows[i].querySelector('.ms_name')
      var caps = rows[i].querySelector('.ms_capsCol')
      var ctx = rows[i].querySelector('.ms_ctxCol')
      if (name !== null) out[name.textContent] = {
        caps: caps === null ? '' : caps.textContent,
        ctx: ctx === null ? '' : ctx.textContent,
      }
    }
    return out
  })()`)
}
async function openSelector() {
  await cdp.eval(`document.querySelector('.ms_trigger').click()`)
  await cdp.waitFor('.ms_cell')
  // 弹层先进清单层（cells），点第一个 cell 才出模型行（同 modlens-quota-probe 的序列）
  await cdp.eval(`(function(){ var c = document.querySelectorAll('.ms_cell'); if (c.length > 0) c[0].click() })()`)
  await cdp.waitFor('.ms_option')
  await sleep(300)
}
async function closeSelector() {
  // 先试 Escape（面板自己的 document 监听），没关掉再点触发器 toggle；最后确认菜单消失
  await cdp.eval(`(function(){ document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })()`)
  await sleep(250)
  await cdp.eval(`(function(){ if (document.querySelector('.ms_menu') !== null) document.querySelector('.ms_trigger').click() })()`)
  await sleep(250)
  const closed = await cdp.eval(`document.querySelector('.ms_menu') === null && document.querySelector('.ms_option') === null`)
  if (closed !== true) throw new Error('选择器没关掉，序列失真')
}

// ---- 1. 基线：打开选择器，注入前的行集 ----
await openSelector()
const base = await rowState()
check('基线：注入前行集不含 flashx', base['glm-5.3-flashx'] === undefined, Object.keys(base))
check('基线：既有行徽标正常（deepseek-flash 视觉+推理）', String(base['deepseek-flash']?.caps).indexOf('视觉') !== -1 && String(base['deepseek-flash']?.caps).indexOf('推理') !== -1, base['deepseek-flash'])
await closeSelector()

// ---- 2. 注入声明条目（模拟设置页保存自定义模型）----
await cdp.eval(`window.__injectDeclaredDetail(
  { id: 'glm-5.3-flashx', provider: 'opencode-go', name: 'GLM-5.3-FlashX', contextWindow: 1000000, maxTokens: 128000, vision: true, video: false, reasoning: true, source: 'declared' },
  'opencode-go'
)`)

// ---- 3. 重开选择器：新行应带徽标与 1M（旧 bundle：目录行在、徽标缺）----
await openSelector()
const after = await rowState()
check('重开后：新行 glm-5.3-flashx 出现（目录重拉兜底）', after['glm-5.3-flashx'] !== undefined, Object.keys(after))
check('【主断言】新行带视觉徽标（详情图重拉）', String(after['glm-5.3-flashx']?.caps).indexOf('视觉') !== -1, after['glm-5.3-flashx'])
check('【主断言】新行带推理徽标', String(after['glm-5.3-flashx']?.caps).indexOf('推理') !== -1, after['glm-5.3-flashx'])
check('【主断言】新行带 1M 上下文标注', String(after['glm-5.3-flashx']?.ctx).indexOf('1M') !== -1, after['glm-5.3-flashx'])
check('既有行不受影响', String(after['deepseek-flash']?.caps).indexOf('视觉') !== -1, after['deepseek-flash'])

const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
const file = join(outDir, 'selector-badge-after-inject.png')
writeFileSync(file, Buffer.from(shot.data, 'base64'))
console.log(`  截图 → ${file}`)

console.log(failures.length === 0 ? '\n选择器徽标探针全部通过' : `\n${failures.length} 个失败`)
process.exit(failures.length === 0 ? 0 : 1)
