// 定向验证（用户 09-28 需求）：custom zai 路由（zai-coding-cn-ykw，id 不在 pi-ai 目录、
// baseURL 与 zai-coding-cn 同端点）的「编辑模型」里能看到 pi-ai zai 的目录候选。
// 路径：找到 custom 卡 → 展开 → 打开模型盒 → 进编辑器 → 断言：
//   1. 目录候选行（glm-5.3 / glm-4.7）出现且未勾（declared 非空 → 只勾声明过的）；
//   2. 同名手填行（glm-5.3-flash）以目录版元数据为准——inPiAi=true，✕ 消失，仍勾着；
//   3. 截图为证。
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? join(here, '..', '..', 'lib', 'client.js'), join(here, 'client.js'))
const outDir = join(tmpdir(), 'dsh-lp-customcand')
mkdirSync(outDir, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=9353`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-cc-' + Date.now())}`, 'about:blank',
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

const failures = []
function check(name, cond, detail) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' → ' + detail}`)
  if (!cond) failures.push(name)
}

// 找到 custom 卡（按 displayName 定位，不依赖卡序）→ 展开
await cdp.eval(`(function(){
  var cards = document.querySelectorAll('.pv_pc')
  for (var i = 0; i < cards.length; i += 1) {
    var name = cards[i].querySelector('.pv_pcName')
    if (name !== null && name.textContent.indexOf('Ykw') !== -1) {
      cards[i].querySelector('.pv_pcCaretCol').click()
      return true
    }
  }
  throw new Error('没有找到 zai-coding-cn-ykw 卡片')
})()`)
await sleep(300)
// 打开模型盒 → 进编辑器
await cdp.eval(`(function(){ var h = document.querySelector('.pv_pc .pv_mHead'); if (h !== null) h.click() })()`)
await sleep(300)
await cdp.eval(`(function(){
  var btns = document.querySelectorAll('button')
  for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === '编辑模型') { btns[i].click(); return true }
  throw new Error('没有找到「编辑模型」按钮')
})()`)
await cdp.waitFor('.pv_meRow')
await sleep(300)

// 行清单：id / 勾选 / ✕ 有无 / 能力徽标文本
const rows = await cdp.eval(`(function(){
  return Array.from(document.querySelectorAll('.pv_meRow')).map(function (row) {
    var check = row.querySelector('.pv_meCheck')
    return {
      id: (row.querySelector('.pv_mId') || {}).textContent ?? '?',
      checked: check === null ? null : check.checked,
      off: row.className.indexOf('pv_meRowOff') !== -1,
      del: row.querySelector('button') !== null,
      caps: (row.querySelector('.pv_mCaps') || {}).textContent ?? '',
    }
  })
})()`)
console.log('  编辑器行:', JSON.stringify(rows))
const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
check('目录候选行 glm-5.3 出现且未勾', byId['glm-5.3'] !== undefined && byId['glm-5.3'].checked === false)
check('目录候选行 glm-4.7 出现且未勾', byId['glm-4.7'] !== undefined && byId['glm-4.7'].checked === false)
check('同名手填行 glm-5.3-flash 仍勾着', byId['glm-5.3-flash'] !== undefined && byId['glm-5.3-flash'].checked === true)
check('同名行以目录版为准（inPiAi=true → 无 ✕ 删除钮）', byId['glm-5.3-flash'] !== undefined && byId['glm-5.3-flash'].del === false)
const idEditable = await cdp.eval(`(function(){
  var els = document.querySelectorAll('.pv_meRow .pv_mId')
  for (var i = 0; i < els.length; i += 1) if (els[i].textContent === 'glm-5.3-flash') return els[i].className.indexOf('pv_mIdEdit') !== -1
  return null
})()`)
check('同名行 ID 不可点进行内编辑（目录收录参数以上游为准，宿主自家详情不挡）', idEditable === false, String(idEditable))
check('同名行能力徽标按目录（视觉+推理）', byId['glm-5.3-flash'] !== undefined && /视觉/.test(byId['glm-5.3-flash'].caps) && /推理/.test(byId['glm-5.3-flash'].caps),
  JSON.stringify(byId['glm-5.3-flash']?.caps))
check('行数 = 手填 1 + 目录候选 2', rows.length === 3, String(rows.length))

const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
const file = join(outDir, 'custom-candidates-editor.png')
writeFileSync(file, Buffer.from(shot.data, 'base64'))
console.log(`  截图 → ${file}`)

console.log(failures.length === 0 ? '\ncustom 目录候选编辑器探针全部通过' : `\n${failures.length} 个失败`)
process.exit(failures.length === 0 ? 0 : 1)
