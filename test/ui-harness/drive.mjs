/**
 * UI 渲染验证驱动（本机新增）：headless Chrome + CDP，把 harness.html 里的真实 lib/client.js
 * 渲染出来，按步骤点开界面并截图。
 *
 *   node test/ui-harness/drive.mjs [输出目录]
 *
 * 默认把 profile 里装好的那份 client.js 复制到 harness 目录再渲染（验证真产物）。
 * 环境变量：CLIENT_SRC 覆盖被测 client.js，CHROME 覆盖浏览器路径。
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] ?? 'D:/桌面/dsh-lp-evidence'
const clientSrc = process.env.CLIENT_SRC ?? 'C:/Users/39244/.dsh/profiles/web/node_modules/@ztyss/dsh-llm-provider/lib/client.js'
const chromePath = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.CDP_PORT ?? 9333)

mkdirSync(outDir, { recursive: true })
copyFileSync(clientSrc, join(here, 'client.js'))
const sha = createHash('sha256').update(readFileSync(clientSrc)).digest('hex').slice(0, 16)
console.log(`被测 client.js: ${clientSrc}\n  sha256[:16]=${sha} → test/ui-harness/client.js`)

const profileDir = join(tmpdir(), `dsh-lp-chrome-${Date.now()}`)
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1500,1500',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function versionInfo() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return await res.json()
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
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text + ' ' + JSON.stringify(result.exceptionDetails.exception?.description ?? ''))
    return result.result.value
  }
  async waitFor(selector, timeoutMs = 10000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const found = await this.eval(`document.querySelector(${JSON.stringify(selector)}) !== null`)
      if (found === true) return true
      await sleep(150)
    }
    return false
  }
  async shot(name) {
    const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const file = join(outDir, `${name}.png`)
    writeFileSync(file, Buffer.from(result.data, 'base64'))
    console.log(`  截图 → ${file}`)
    return file
  }
}

const shots = []
try {
  const version = await versionInfo()
  console.log(`浏览器: ${version.Browser}`)
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = list.find((target) => target.type === 'page')
  const cdp = new Cdp(page.webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  const consoleLogs = []
  cdp.socket.addEventListener('message', function (event) {
    var m = JSON.parse(String(event.data))
    if (m.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push(m.params.args.map(function (a) { return a.value !== undefined ? String(a.value) : (a.description || a.type) }).join(' '))
    }
  })

  const url = 'file:///' + join(here, 'harness.html').replace(/\\/g, '/')
  await cdp.send('Page.navigate', { url })
  await sleep(500)

  const ready = await cdp.eval('window.__ready === true')
  if (ready !== true) {
    const fatal = await cdp.eval('window.__fatal ?? document.getElementById("err").textContent')
    throw new Error(`harness 没跑起来：${fatal}`)
  }
  console.log('harness 就绪')

  // 0) /model 命令贡献的官方契约（上游 issue #7：缺 available 会让整批 / 候选、含 composer 的「＋」全废）
  const cmdContract = await cdp.eval(`(function () {
    var c = window.__commandContribution
    if (!c) return { ok: false, why: '没捕获到 /model 贡献（registerModelCommand 没注册？）' }
    var out = { name: c.name, hasAvailable: typeof c.available === 'function', cases: {} }
    if (out.hasAvailable !== true) return out
    var inputs = { nullSession: null, plain: { sessionId: 'plain-session' }, subagent: { sessionId: 'subagent-session' }, boom: { sessionId: 'boom-session' } }
    for (var key in inputs) {
      try { out.cases[key] = c.available(inputs[key]) } catch (cause) { out.cases[key] = 'THREW: ' + (cause && cause.message ? cause.message : cause) }
    }
    out.ok = out.cases.nullSession === true && out.cases.plain === true && out.cases.subagent === false && out.cases.boom === true
    return out
  })()`)
  console.log('  /model 贡献契约:', JSON.stringify(cmdContract))
  if (cmdContract.ok !== true) throw new Error('/model 贡献的 available 契约没满足（issue #7）：' + JSON.stringify(cmdContract))

  // 1) Provider 卡片（含 30d 月窗口 chip）
  await cdp.waitFor('.pv_pc')
  await cdp.eval(`document.querySelector('.pv_pc .pv_pcHead').click()`)
  await sleep(300)
  const chips = await cdp.eval(`Array.from(document.querySelectorAll('.pv_pc .pv_chipItem')).map(function (el) { return el.textContent.trim() })`)
  console.log('  卡片头部 chips:', JSON.stringify(chips))
  await cdp.eval(`document.querySelector('.pv_pc .pv_mHead').click()`)
  await sleep(300)
  await cdp.eval(`window.scrollTo(0, 0)`)
  shots.push(await cdp.shot('01-provider-card-30d-chip'))
  // 1b) Provider 卡就地编辑：无改动无编辑痕迹；有草稿浮出操作区；只写改动过的字段；校验拦截；取消回落
  await cdp.waitFor('.pv_row input.pv_key')
  const edit0 = await cdp.eval(`(function () {
    var el = document.querySelector('.pv_row input[placeholder="opencode-go"]')
    return {
      initial: el ? el.value : null,
      actsGone: document.querySelector('.pv_editActs') === null,
      noPencil: Array.from(document.querySelectorAll('.pv_metaActs button')).every(function (b) { return b.textContent !== '✎' }),
    }
  })()`)
  console.log('  就地编辑·初始:', JSON.stringify(edit0))
  if (edit0.initial !== '' || edit0.actsGone !== true || edit0.noPencil !== true) throw new Error('就地编辑初始态不对：' + JSON.stringify(edit0))

  // 只改显示名 → 操作区浮出（保存修改可点 + 取消 + 清空语义提示）
  await cdp.eval(`
    var el = document.querySelector('.pv_row input[placeholder="opencode-go"]')
    el.value = '我的网关'
    el.dispatchEvent(new Event('change', { bubbles: true }))
  `)
  await sleep(300)
  const edit1 = await cdp.eval(`(function () {
    var box = document.querySelector('.pv_editActs')
    if (box === null) return null
    return {
      buttons: Array.from(box.querySelectorAll('button')).map(function (b) { return b.textContent + (b.disabled ? '(disabled)' : '') }),
      hint: (box.querySelector('.plan_note') || {}).textContent || '',
    }
  })()`)
  console.log('  就地编辑·草稿:', JSON.stringify(edit1))
  if (edit1 === null || JSON.stringify(edit1.buttons) !== '["保存修改","取消"]' || edit1.hint.indexOf('清空') === -1) {
    throw new Error('草稿态操作区不对：' + JSON.stringify(edit1))
  }
  shots.push(await cdp.shot('01b-provider-edit-dirty'))

  // 保存 → settings/mutate 只发一条 displayName 的 set（此前 undefined 字段会被误判 badApi 静默拦截）
  await cdp.eval(`
    var b = Array.from(document.querySelectorAll('.pv_editActs button')).find(function (x) { return x.textContent === '保存修改' })
    b.click()
  `)
  await sleep(500)
  const mut1 = await cdp.eval('window.__lastMutate ?? null')
  console.log('  settings/mutate 载荷:', JSON.stringify(mut1))
  const mut1Ok = mut1 !== null && mut1.ns === 'llm-pi-ai' && JSON.stringify(mut1.ops) === JSON.stringify([
    { op: 'set', path: ['providers', 'opencode-go', 'displayName'], value: '我的网关' },
  ])
  if (mut1Ok !== true) throw new Error('mutate 载荷不是「只写改动过的字段」：' + JSON.stringify(mut1))
  await sleep(300)
  if (await cdp.eval(`document.querySelector('.pv_editActs') !== null`)) throw new Error('保存成功后草稿没被丢弃（操作区还在）')

  // 校验：非法端点被拦下，不发 mutate
  await cdp.eval(`
    var el = document.querySelector('.pv_row input[placeholder="留空回到官方默认端点"]')
    el.value = 'ftp://bad.example'
    el.dispatchEvent(new Event('change', { bubbles: true }))
  `)
  await sleep(300)
  await cdp.eval(`
    var b = Array.from(document.querySelectorAll('.pv_editActs button')).find(function (x) { return x.textContent === '保存修改' })
    b.click()
  `)
  await sleep(400)
  const mutCount = await cdp.eval('(window.__mutateCalls || []).length')
  if (mutCount !== 1) throw new Error('非法端点竟然发起了 mutate（次数 ' + mutCount + '）')
  console.log('  非法端点被校验拦下，mutate 次数仍为 1')

  // 取消：草稿丢弃，字段回落
  await cdp.eval(`
    var b = Array.from(document.querySelectorAll('.pv_editActs button')).find(function (x) { return x.textContent === '取消' })
    b.click()
  `)
  await sleep(300)
  const edit2 = await cdp.eval(`(function () {
    return {
      actsGone: document.querySelector('.pv_editActs') === null,
      urlValue: document.querySelector('.pv_row input[placeholder="留空回到官方默认端点"]').value,
    }
  })()`)
  console.log('  就地编辑·取消:', JSON.stringify(edit2))
  if (edit2.actsGone !== true || edit2.urlValue !== '') throw new Error('取消后没回落：' + JSON.stringify(edit2))


  // 2) 模型清单（勾选式，与「配置模型」按钮解耦：展开即见）
  await cdp.waitFor('.pv_meRow')
  const editorProbe = await cdp.eval(`(function () {
    var rows = Array.from(document.querySelectorAll('.pv_meRow'))
    return {
      rows: rows.length,
      ids: rows.map(function (el) { return (el.querySelector('.pv_mId') || {}).textContent }),
      colhead: document.querySelector('.pv_meHeadRow') !== null,
      noConfigBtn: document.querySelector('.pv_meOpen') === null,
      knownRowsReadOnly: Array.from(rows).every(function (el) {
        var custom = el.querySelector('.pv_capDeclared') !== null
        return custom ? el.querySelector('.pv_meNum') !== null : el.querySelector('.pv_meNum') === null
      }),
      wrapId: rows.length > 0 && getComputedStyle(rows[0].querySelector('.pv_mId')).whiteSpace === 'normal',
      noFilter: document.querySelector('.pv_mFilter') === null,
      delBtnOnConfiguredOnly: rows.every(function (el) {
        var configured = el.querySelector('.pv_meCheck').checked || el.querySelector('.pv_capDeclared') !== null
        return (el.querySelector('.pv_iconBtn') !== null) === configured
      }),
    }
  })()`)
  console.log('  清单探针:', JSON.stringify(editorProbe))
  if (editorProbe.rows === 0 || editorProbe.colhead !== true || editorProbe.noConfigBtn !== true || editorProbe.knownRowsReadOnly !== true || editorProbe.wrapId !== true || editorProbe.noFilter !== true || editorProbe.delBtnOnConfiguredOnly !== true) {
    throw new Error('模型清单结构没满足：' + JSON.stringify(editorProbe))
  }
  shots.push(await cdp.shot('02-model-list-editor'))

  // 2b) 取消勾选一个模型后保存，看落到 /provider/set-models 的载荷
  await cdp.eval(`
    var boxes = document.querySelectorAll('.pv_meRow .pv_meCheck');
    if (boxes.length > 1) boxes[1].click();
    var n = Array.from(document.querySelectorAll('.pv_meActs button')).find(function (b) { return b.textContent.indexOf('保存清单') !== -1 });
    if (n) n.click();
  `)
  await sleep(600)
  const payload = await cdp.eval('window.__lastSetModels ?? null')
  console.log('  set-models 载荷:', JSON.stringify(payload))
  shots.push(await cdp.shot('03-model-list-saved-toast'))

  // 3) 删除确认弹层（issue #3）
  await cdp.waitFor('[title^="删除这个 provider"]')
  await cdp.eval(`document.querySelector('[title^="删除这个 provider"]').click()`)
  await cdp.waitFor('.pv_modal')
  await sleep(300)
  const modalText = await cdp.eval(`document.querySelector('.pv_modal').textContent`)
  console.log('  弹层文案:', modalText.slice(0, 120))
  shots.push(await cdp.shot('04-delete-confirm-modal'))
  await cdp.eval(`var b = Array.from(document.querySelectorAll('.pv_modalActs button')).find(function (x) { return x.textContent === '取消' }); if (b) b.click();`)
  await sleep(300)

  // 4) pi-ai 桥接标签页（本地版：自动下载已停用）
  await cdp.eval(`var t = Array.from(document.querySelectorAll('.pv_tab')).find(function (x) { return x.textContent.indexOf('pi-ai 桥接') !== -1 }); if (t) t.click();`)
  await cdp.waitFor('.pv_line')
  await sleep(400)
  const bridgeText = await cdp.eval(`document.querySelector('.pv_stack').textContent`)
  shots.push(await cdp.shot('05-bridge-tab-updates-disabled'))

  // 5) 座位模型面板：modlens 合成 provider 的视觉徽标（2026-09-17 用户报「还是没有」）
  const seatUrl = 'file:///' + join(here, 'seat.html').replace(/\\/g, '/')
  await cdp.send('Page.navigate', { url: seatUrl })
  await sleep(600)
  const seatReady = await cdp.eval('window.__ready === true')
  if (seatReady !== true) {
    const fatal = await cdp.eval('window.__fatal ?? document.getElementById("err").textContent')
    throw new Error(`座位 harness 没跑起来：${fatal}`)
  }
  await cdp.waitFor('.ms_trigger')
  await cdp.eval(`document.querySelector('.ms_trigger').click()`)
  await cdp.waitFor('.ms_menu')
  await sleep(300)
  // 根面板是「模型 / 推理等级」两行，模型清单在「模型」那一层
  await cdp.eval(`var c = document.querySelectorAll('.ms_cell'); if (c.length > 0) c[0].click()`)
  await cdp.waitFor('.ms_group')
  await sleep(500)
  const seatRows = await cdp.eval(`Array.from(document.querySelectorAll('.ms_group')).map(function (g) { return g.textContent.trim() })`)
  console.log('  座位面板分组:', JSON.stringify(seatRows))
  if (seatRows.length === 0) {
    console.log('  诊断:', await cdp.eval(`JSON.stringify({
      trigger: document.querySelectorAll('.ms_trigger').length,
      menu: document.querySelectorAll('.ms_menu').length,
      groups: document.querySelectorAll('.ms_group').length,
      options: document.querySelectorAll('.ms_option').length,
      aria: document.querySelector('.ms_trigger') === null ? null : document.querySelector('.ms_trigger').getAttribute('aria-expanded'),
      text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 220)
    })`))
  }
  shots.push(await cdp.shot('06-seat-model-panel-modlens-vision'))

  console.log(`\n请求记录: ${JSON.stringify(await cdp.eval('window.__calls'), null, 0)}`)
  console.log(`渲染错误: ${JSON.stringify(await cdp.eval('window.__errors ?? []'))}`)
  console.log(`截图 ${shots.length} 张 → ${outDir}`)
  cdp.socket.close()
  process.exitCode = 0
} catch (error) {
  console.error('驱动失败：', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  chrome.kill()
  await sleep(300)
  rmSync(profileDir, { recursive: true, force: true })
}
