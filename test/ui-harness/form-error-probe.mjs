// 定向验证（用户 10-10 需求②）：「新增自定义模型」表单的校验报错要落在表单自己的
// 消息槽里、原位替换之前的测试结果，而不是掉到编辑器底部的小字行。
// 路径：?testFail=1 打开 harness（test-model mock 回 ok:false）→ custom 卡展开 →
// 编辑模型 → 添加模型表单 → 填一个已在清单里的 ID：
//   1. 「测试」的报错显示在表单内槽位（pv_meTestLine）且失败带红字 class；
//   2. 「添加」重复 ID 的报错在**同一槽位**原位替换测试结果（表内只有这一条）；
//   3. 编辑器底部（.pv_me 的 plan_note）不再出现这条错误；
//   4. 报错后表单不关；换个新 ID 添加成功 → 新行入清单且勾选、表单关闭；
//   5. 截图取证。
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
copyFileSync(process.env.CLIENT_SRC ?? join(here, '..', '..', 'lib', 'client.js'), join(here, 'client.js'))
const outDir = join(tmpdir(), 'dsh-lp-formerror')
mkdirSync(outDir, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=9356`, `--user-data-dir=${join(tmpdir(), 'dsh-lp-fe-' + Date.now())}`, 'about:blank',
], { stdio: 'ignore' })
const kill = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', kill)
setTimeout(() => { console.log('WATCHDOG: 45s 未完成，强制退出'); process.exit(2) }, 45000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function versionInfo() {
  for (let i = 0; i < 40; i += 1) {
    try { const res = await fetch('http://127.0.0.1:9356/json/version'); if (res.ok) return res.json() } catch {}
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
  async waitForText(selector, needle, timeoutMs = 10000) {
    const started = Date.now()
    for (;;) {
      const text = await this.eval(`(function(){ var el = document.querySelector(${JSON.stringify(selector)}); return el === null ? null : el.textContent })()`)
      if (text !== null && text.indexOf(needle) !== -1) return text
      if (Date.now() - started > timeoutMs) throw new Error(`waitForText 超时：${selector} 不含「${needle}」（当前：${JSON.stringify(text)}）`)
      await sleep(150)
    }
  }
}
await versionInfo()
const list = await (await fetch('http://127.0.0.1:9356/json/list')).json()
const cdp = new Cdp(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await cdp.ready
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1500, deviceScaleFactor: 1, mobile: false })
await cdp.send('Page.navigate', { url: 'file:///' + join(here, 'harness.html?testFail=1').replace(/\\/g, '/') })
await cdp.waitFor('.pv_addBtn')
await sleep(400)

const failures = []
function check(name, cond, detail) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ' → ' + JSON.stringify(detail)}`)
  if (!cond) failures.push(name)
}

// 找到 custom 卡（Ykw）→ 展开 → 打开模型盒 → 进编辑器（全部限定在这张卡内）
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
  throw new Error('没有找到 zai-coding-cn-ykw 卡片')
})()`)
await cdp.waitFor('.pv_meRow')
await sleep(300)

// 打开「添加模型」表单
await cdp.eval(`(function(){
  var btns = document.querySelectorAll('.pv_me button')
  for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === '添加模型') { btns[i].click(); return true }
  throw new Error('没有找到「添加模型」按钮')
})()`)
await cdp.waitFor('.pv_meForm')
await sleep(200)

// 受控输入：native setter 赋值 + change 事件（垫片把 onChange 绑在 change 上，同 addpanel-probe）
const fillId = async (value) => {
  await cdp.eval(`(function(){
    var inputs = document.querySelectorAll('.pv_meForm input.pv_field')
    var el = inputs[0]
    if (el === undefined) throw new Error('表单里没有输入框')
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await sleep(150)
}
const clickInForm = async (label) => {
  await cdp.eval(`(function(){
    var btns = document.querySelectorAll('.pv_meForm button')
    for (var i = 0; i < btns.length; i += 1) if (btns[i].textContent === ${JSON.stringify(label)}) { btns[i].click(); return true }
    throw new Error('表单里没有「' + ${JSON.stringify(label)} + '」按钮')
  })()`)
}

// ---- 1. 「测试」报错落在表单内槽位（红态带红字 class）----
await fillId('glm-5.3')
await clickInForm('测试')
try {
  const line = await cdp.waitForText('.pv_meForm .pv_meTestLine', '官方默认端点')
  check('测试报错显示在表单内槽位（pv_meTestLine）', line.indexOf('✗') !== -1, line)
  const cls = await cdp.eval(`document.querySelector('.pv_meForm .pv_meTestLine').className`)
  check('失败态带红字 class（plan_badText）', String(cls).indexOf('plan_badText') !== -1, cls)
} catch (error) {
  check('测试报错显示在表单内槽位（pv_meTestLine）', false, String(error.message))
  check('失败态带红字 class（plan_badText）', false, '未到该步')
}

// ---- 2. 「添加」重复 ID：同一槽位原位替换测试结果 ----
await clickInForm('添加')
try {
  const replaced = await cdp.waitForText('.pv_meForm .pv_meTestLine', '已经在清单里了')
  check('添加重复 ID 的报错原位替换测试结果', replaced.indexOf('✗') !== -1 && replaced.indexOf('glm-5.3') !== -1, replaced)
} catch (error) {
  check('添加重复 ID 的报错原位替换测试结果', false, String(error.message))
}
const slotCount = await cdp.eval(`document.querySelectorAll('.pv_meForm .pv_meTestLine').length`)
check('表内只有这一个消息槽', slotCount === 1, slotCount)
const bottomNote = await cdp.eval(`(function(){ var el = document.querySelector('.pv_me > .plan_note.plan_badText'); return el === null ? null : el.textContent })()`)
check('编辑器底部不再渲染这条错误', bottomNote === null, bottomNote)
const formStillOpen = await cdp.eval(`document.querySelector('.pv_meForm') !== null`)
check('报错后表单仍开着（等用户改输入）', formStillOpen === true)

await sleep(200)
const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
writeFileSync(join(outDir, 'form-error-inplace.png'), Buffer.from(shot1.data, 'base64'))
console.log(`  截图 → ${join(outDir, 'form-error-inplace.png')}`)

// ---- 3. 换个新 ID：添加成功 → 行入清单且勾选、表单关闭 ----
await fillId('glm-9-custom')
await clickInForm('添加')
try {
  const closed = await (async () => {
    const started = Date.now()
    for (;;) {
      const gone = await cdp.eval(`document.querySelector('.pv_meForm') === null`)
      if (gone === true) return true
      if (Date.now() - started > 5000) return false
      await sleep(150)
    }
  })()
  check('添加成功后表单关闭', closed === true)
  const row = await cdp.eval(`(function(){
    var rows = document.querySelectorAll('.pv_meRow')
    for (var i = 0; i < rows.length; i += 1) {
      var id = rows[i].querySelector('.pv_mId')
      if (id !== null && id.textContent === 'glm-9-custom') {
        var c = rows[i].querySelector('.pv_meCheck')
        return { found: true, checked: c === null ? null : c.checked }
      }
    }
    return { found: false }
  })()`)
  check('新行 glm-9-custom 入清单且默认勾选', row.found === true && row.checked === true, row)
} catch (error) {
  check('添加成功后表单关闭', false, String(error.message))
  check('新行 glm-9-custom 入清单且默认勾选', false, '未到该步')
}

const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
writeFileSync(join(outDir, 'form-add-success.png'), Buffer.from(shot2.data, 'base64'))
console.log(`  截图 → ${join(outDir, 'form-add-success.png')}`)

console.log(failures.length === 0 ? '\n表单报错槽位探针全部通过' : `\n${failures.length} 个失败`)
process.exit(failures.length === 0 ? 0 : 1)
