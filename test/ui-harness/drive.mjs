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
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
// 默认值全部可移植：证据输出进系统临时目录，被测 client.js 取本机 profile 里装好的那份，
// 浏览器按常见安装位探测（Chrome → Edge）——不再硬编码某一台机器的路径
const outDir = process.argv[2] ?? join(tmpdir(), 'dsh-lp-evidence')
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
if (!existsSync(clientSrc)) throw new Error(`找不到被测 client.js：${clientSrc}（用 CLIENT_SRC 指定，或先把插件装进 web profile）`)
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

  // 0) 用量加载占位：?planDelay=1500 把 /plan/status 拖慢——页面打开先见「正在刷新用量…」，
  //    数据到手后才渲染 provider 界面（添加按钮 + 卡片）
  await cdp.send('Page.navigate', { url: url + '?planDelay=1500' })
  await sleep(400)
  const waitProbe = await cdp.eval(`(function () {
    var el = document.querySelector('.pv_usageLoading')
    return {
      loading: el !== null,
      text: el !== null ? el.textContent : '',
      noAddBtn: document.querySelector('.pv_addBtn') === null,
      noCards: document.querySelector('.pv_mHead') === null,
    }
  })()`)
  console.log('  用量占位探针:', JSON.stringify(waitProbe))
  if (waitProbe.loading !== true || waitProbe.text.indexOf('正在刷新用量') === -1 || waitProbe.noAddBtn !== true || waitProbe.noCards !== true) {
    throw new Error('用量加载占位没出现：' + JSON.stringify(waitProbe))
  }
  shots.push(await cdp.shot('00-usage-loading-placeholder'))
  await cdp.waitFor('.pv_addBtn', 8000)
  const waitDone = await cdp.eval(`({
    loadingGone: document.querySelector('.pv_usageLoading') === null,
    cards: document.querySelectorAll('.pv_pc').length,
    addBtn: document.querySelector('.pv_addBtn') !== null,
  })`)
  console.log('  用量加载完成:', JSON.stringify(waitDone))
  if (waitDone.loadingGone !== true || waitDone.cards < 2 || waitDone.addBtn !== true) {
    throw new Error('占位页没被 provider 界面替换：' + JSON.stringify(waitDone))
  }

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

  // 0b) 桥接页加载态：status 还在路上（?statusDelay=700）时切进桥接页，卡内应给「正在读取…」占位行，
  //     而不是先闪一个空框、数据到了内容再蹦出来（用户报的「每次点进都闪烁」）
  await cdp.send('Page.navigate', { url: url + '?statusDelay=700' })
  await sleep(150)
  await cdp.eval(`var t = Array.from(document.querySelectorAll('.pv_tab')).find(function (x) { return x.textContent.indexOf('pi-ai 桥接') !== -1 }); if (t) t.click();`)
  await sleep(120)
  const bridgeLoading = await cdp.eval(`(function () {
    var box = document.querySelector('.pv_pc')
    var line = box !== null ? box.querySelector('.pv_line') : null
    return {
      loadingLine: line !== null ? line.textContent : '',
      spin: box !== null && box.querySelector('.pv_spin') !== null,
      versionYet: box !== null && box.textContent.indexOf('当前 pi-ai 版本') !== -1,
    }
  })()`)
  console.log('  桥接加载态探针:', JSON.stringify(bridgeLoading))
  if (bridgeLoading.spin !== true || bridgeLoading.loadingLine.indexOf('正在读取') === -1 || bridgeLoading.versionYet !== false) {
    throw new Error('status 加载中桥接卡没有给加载占位（会闪空框）：' + JSON.stringify(bridgeLoading))
  }
  shots.push(await cdp.shot('00b-bridge-loading'))
  for (var wi = 0; wi < 30; wi += 1) {
    const done = await cdp.eval(`document.body.textContent.indexOf('当前 pi-ai 版本') !== -1`)
    if (done === true) break
    await sleep(100)
  }
  const bridgeLoaded = await cdp.eval(`({
    spinGone: document.querySelector('.pv_spin') === null,
    versionShown: document.body.textContent.indexOf('当前 pi-ai 版本') !== -1,
  })`)
  console.log('  桥接加载完成探针:', JSON.stringify(bridgeLoaded))
  if (bridgeLoaded.spinGone !== true || bridgeLoaded.versionShown !== true) {
    throw new Error('桥接卡加载完成后没有切到版本行：' + JSON.stringify(bridgeLoaded))
  }
  // 切回服务商标签，后面各步都在这张页面上进行
  await cdp.eval(`var t = Array.from(document.querySelectorAll('.pv_tab')).find(function (x) { return x.textContent === '服务商' }); if (t) t.click();`)
  await sleep(200)

  // 1) Provider 卡片（含 30d 月窗口 chip）
  await cdp.waitFor('.pv_pc')
  await cdp.eval(`document.querySelector('.pv_pc .pv_pcHead').click()`)
  await sleep(300)
  const chips = await cdp.eval(`Array.from(document.querySelectorAll('.pv_pc .pv_chipItem')).map(function (el) { return el.textContent.trim() })`)
  console.log('  卡片头部 chips:', JSON.stringify(chips))
  // 模型框保持折叠——展开是第 2 步的事；此前这里提前展开，01/02 曾截出两张逐字节相同的图
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

  // 密钥行：始终可编辑（密码框，占位 = 掩码）+ 保存按钮（空草稿禁用）；凭据名行不再出现。
  // 此前已配置的路由只显示掩码文本，实质改不了 key（用户报的就是它）
  const keyRow = await cdp.eval(`(function () {
    var rows = Array.from(document.querySelectorAll('.pv_pcBody .pv_row'))
    var row = rows.find(function (r) { return r.textContent.indexOf('API 密钥') !== -1 })
    if (row === undefined) return null
    var input = row.querySelector('input[type=password]')
    var btn = row.querySelector('button')
    return {
      hasPassword: input !== null,
      placeholder: input === null ? '' : input.placeholder,
      saveDisabled: btn === null ? null : btn.disabled,
      saveLabel: btn === null ? '' : btn.textContent,
      credNameRowGone: rows.every(function (r) { return r.textContent.indexOf('凭据名') === -1 }),
    }
  })()`)
  console.log('  密钥行探针:', JSON.stringify(keyRow))
  if (keyRow === null || keyRow.hasPassword !== true || keyRow.placeholder !== 'sk-****abcd'
    || keyRow.saveDisabled !== true || keyRow.saveLabel !== '保存' || keyRow.credNameRowGone !== true) {
    throw new Error('密钥行不对（要可编辑、掩码占位、空草稿禁用、无凭据名行）：' + JSON.stringify(keyRow))
  }

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
  // 报错必须在本页看得见（提示行渲染在标签栏正下方）——此前它的唯一渲染位在桥接页 body 里，
  // 服务商页点「保存修改」像没反应一样，报错要切到桥接页才冒出来
  const noteVisible = await cdp.eval(`(function () {
    var el = document.querySelector('.pv_pageNote')
    return {
      present: el !== null,
      text: el ? el.textContent : '',
      inBody: document.body.textContent.indexOf('端点必须以') !== -1,
      underTabs: el !== null && el.previousElementSibling !== null && el.previousElementSibling.className.indexOf('pv_tabs') !== -1,
    }
  })()`)
  console.log('  校验报错本页可见:', JSON.stringify(noteVisible))
  if (noteVisible.present !== true || noteVisible.text.indexOf('端点必须以') === -1 || noteVisible.underTabs !== true) {
    throw new Error('校验报错没有在服务商页渲染出来：' + JSON.stringify(noteVisible))
  }

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
  // 取消 = 丢弃草稿，草稿的校验报错要跟着一起清掉
  const noteGone = await cdp.eval(`document.querySelector('.pv_pageNote') === null && document.body.textContent.indexOf('端点必须以') === -1`)
  console.log('  取消后报错已清:', noteGone)
  if (noteGone !== true) throw new Error('取消后校验报错还在（报错应跟着草稿一起清）')


  // 2) 模型框展开 → 先是「当前清单」只读页；点「修改模型」才进勾选编辑器
  await cdp.eval(`document.querySelector('.pv_pc .pv_mHead').click()`)
  await sleep(300)
  await cdp.waitFor('.pv_mRow')
  const listProbe = await cdp.eval(`(function () {
    var box = document.querySelectorAll('.pv_mBox')[0]
    var head = box.querySelector('.pv_mHeadRow')
    var idCell = box.querySelector('.pv_mRow .pv_mId')
    var maxCell = box.querySelector('.pv_mRow .pv_mMax')
    return {
      listRows: box.querySelectorAll('.pv_mRow').length,
      listHead: head !== null,
      editBtn: Array.from(box.querySelectorAll('button')).some(function (b) { return b.textContent === '修改模型' }),
      editorHidden: document.querySelector('.pv_meRow') === null,
      // 列改版：不放名称列，补最大输出列（表头 + 数据行都在）
      noNameCol: box.querySelector('.pv_mName') === null && head.textContent.indexOf('名称') === -1,
      maxCol: head.textContent.indexOf('最大输出') !== -1,
      maxShown: maxCell !== null && maxCell.textContent !== '',
      // 模型 ID 超长时单行省略号截断（完整 ID 走 title 悬停）——绝不换行挤高行、更不叠到徽标上
      idTruncates: idCell !== null && getComputedStyle(idCell).whiteSpace === 'nowrap' && getComputedStyle(idCell).textOverflow === 'ellipsis',
      // 「修改模型」按钮与模型框下边框留了呼吸距
      btnBreath: (function () {
        var row = box.querySelector('.pv_mEditRow')
        var boxRect = box.getBoundingClientRect()
        var btn = row !== null ? row.querySelector('button') : null
        if (row === null || btn === null) return false
        return boxRect.bottom - btn.getBoundingClientRect().bottom >= 8
      })(),
    }
  })()`)
  console.log('  清单页探针:', JSON.stringify(listProbe))
  if (listProbe.listRows === 0 || listProbe.listHead !== true || listProbe.editBtn !== true || listProbe.editorHidden !== true
    || listProbe.noNameCol !== true || listProbe.maxCol !== true || listProbe.maxShown !== true || listProbe.idTruncates !== true || listProbe.btnBreath !== true) {
    throw new Error('清单页结构没满足（只读清单 + 修改模型 + 列改版 + ID 截断 + 按钮呼吸距）：' + JSON.stringify(listProbe))
  }
  shots.push(await cdp.shot('02-model-list-page'))
  await cdp.eval(`
    var b = Array.from(document.querySelectorAll('.pv_mBox')[0].querySelectorAll('button')).find(function (x) { return x.textContent === '修改模型' })
    b.click()
  `)
  await cdp.waitFor('.pv_meRow')
  const editorProbe = await cdp.eval(`(function () {
    var rows = Array.from(document.querySelectorAll('.pv_meRow'))
    var checkedIds = rows.filter(function (el) { return el.querySelector('.pv_meCheck').checked })
      .map(function (el) { return (el.querySelector('.pv_mId') || {}).textContent })
    function aligned() {
      var head = document.querySelector('.pv_meHeadRow')
      if (head === null || rows.length === 0 || head.children.length !== rows[0].children.length) return false
      for (var i = 0; i < head.children.length; i += 1) {
        if (Math.abs(head.children[i].getBoundingClientRect().left - rows[0].children[i].getBoundingClientRect().left) > 1.5) return false
      }
      return true
    }
    return {
      rows: rows.length,
      ids: rows.map(function (el) { return (el.querySelector('.pv_mId') || {}).textContent }),
      colhead: document.querySelector('.pv_meHeadRow') !== null,
      noConfigBtn: document.querySelector('.pv_meOpen') === null,
      knownRowsReadOnly: Array.from(rows).every(function (el) {
        var custom = el.querySelector('.pv_capDeclared') !== null
        return custom ? el.querySelector('.pv_meNum') !== null : el.querySelector('.pv_meNum') === null
      }),
      // 长 ID 单行省略号截断（v0.1.1 的「换行完整可见」按用户反馈改成截断：省略号好过挤高行/叠徽标）
      idTruncates: rows.length > 0 && (function () {
        var el = rows[0].querySelector('.pv_mId')
        var s = getComputedStyle(el)
        return s.whiteSpace === 'nowrap' && s.textOverflow === 'ellipsis'
      })(),
      noFilter: document.querySelector('.pv_mFilter') === null,
      // ✕ 每行都有（勾选即时生效后，✕ 的职责 = 把该条目从清单草稿删掉，保存清单落盘）
      delOnEveryRow: rows.every(function (el) { return el.querySelector('.pv_iconBtn') !== null }),
      // 名称列删除：无 .pv_meName，表头 6 列
      noNameCol: document.querySelector('.pv_meName') === null && document.querySelectorAll('.pv_meHeadRow > span').length === 6,
      // 只预勾 settings.yaml 声明过的模型（夹具里 opencode-go 只声明 deepseek-flash）
      declaredOnly: JSON.stringify(checkedIds) === '["deepseek-flash"]',
      // 不再显示「已勾 N / M」计数器
      noCounter: document.querySelector('.pv_me .pv_push') === null,
      // 旧的「加一行」内联输入已移除
      noInlineAdd: document.querySelector('.pv_me input[placeholder^="自定义模型 ID"]') === null,
      // 目录已知模型的上下文/最大输出两列都有值
      ctxMaxShown: rows.length > 0 && rows.every(function (el) {
        var known = el.querySelector('.pv_capDeclared') === null
        return known
          ? (el.querySelector('.pv_mCtx') || {}).textContent !== '' && (el.querySelector('.pv_mMax') || {}).textContent !== ''
          : el.querySelector('.pv_mMax') === null
      }),
      // 表头与数据行逐列对齐（每列左缘偏差 ≤1.5px）
      colAligned: aligned(),
    }
  })()`)
  console.log('  清单探针:', JSON.stringify(editorProbe))
  if (editorProbe.rows === 0 || editorProbe.colhead !== true || editorProbe.noConfigBtn !== true || editorProbe.knownRowsReadOnly !== true || editorProbe.idTruncates !== true || editorProbe.noFilter !== true || editorProbe.delOnEveryRow !== true || editorProbe.noNameCol !== true || editorProbe.declaredOnly !== true || editorProbe.noCounter !== true || editorProbe.noInlineAdd !== true || editorProbe.ctxMaxShown !== true || editorProbe.colAligned !== true) {
    throw new Error('模型清单结构没满足：' + JSON.stringify(editorProbe))
  }
  shots.push(await cdp.shot('02b-model-list-editor'))

  // 2pre) 勾上一个未配置的目录模型：**勾选即时生效**，直接发 set-models（声明条目原样 + 已知模型只写 {id}）。
  //       放在「添加模型」之前：此时草稿里还没有自定义行，即时载荷就是干净的「原清单 + 新勾的这条」
  //       （两步分开点，同一 eval 里连点会命中重渲染前的旧闭包——真实 UI 的两次点击在不同任务里）
  await cdp.eval(`
    var boxes = document.querySelectorAll('.pv_meRow .pv_meCheck');
    boxes[1].click();
  `)
  await sleep(400)
  const instant = await cdp.eval('window.__lastSetModels ?? null')
  console.log('  勾选即时写载荷:', JSON.stringify(instant))
  const instantOk = instant !== null && instant.providerId === 'opencode-go' && JSON.stringify(instant.models) === JSON.stringify([
    { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', contextWindow: 1000000, maxTokens: 384000, input: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high', max: 'max' } },
    { id: 'kimi-k3' },
  ])
  if (instantOk !== true) throw new Error('勾选没有即时写入（声明原样 + 已知只写 id）：' + JSON.stringify(instant))

  // 2a) 「添加模型」表单：空 ID 报错 → 填全参数 → 行追加（草稿态，保存才落盘）
  await cdp.eval(`
    var b = Array.from(document.querySelectorAll('.pv_meActs button')).find(function (x) { return x.textContent === '添加模型' })
    b.click()
  `)
  await cdp.waitFor('.pv_meForm')
  await cdp.eval(`
    var add = Array.from(document.querySelectorAll('.pv_meForm button')).find(function (x) { return x.textContent === '添加' })
    add.click()
  `)
  await sleep(300)
  const emptyErr = await cdp.eval(`(document.querySelector('.pv_me .plan_badText') || {}).textContent || ''`)
  if (emptyErr === '') throw new Error('空 ID 没有报错')
  await cdp.eval(`
    var q = function (sel) { return document.querySelector('.pv_meForm ' + sel) }
    var set = function (el, v) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })) }
    set(q('input[placeholder="目录里没有的自定义 ID"]'), 'my-custom')
    set(q('input[placeholder="留空则同模型 ID"]'), 'My Custom')
    set(q('input[placeholder="如 1000000"]'), '1000000')
    set(q('input[placeholder="如 384000"]'), '100000')
    q('.pv_meFormCaps label input').click()
  `)
  await sleep(300)
  shots.push(await cdp.shot('02a1-add-model-form'))
  await cdp.eval(`
    var add = Array.from(document.querySelectorAll('.pv_meForm button')).find(function (x) { return x.textContent === '添加' })
    add.click()
  `)
  await sleep(400)
  const addProbe = await cdp.eval(`(function () {
    var rows = Array.from(document.querySelectorAll('.pv_meRow'))
    var last = rows[rows.length - 1]
    return {
      rows: rows.length,
      lastId: (last.querySelector('.pv_mId') || {}).textContent,
      lastCustom: last.querySelector('.pv_capDeclared') !== null,
      lastEnabled: last.querySelector('.pv_meCheck').checked,
      formClosed: document.querySelector('.pv_meForm') === null,
    }
  })()`)
  console.log('  添加模型探针:', JSON.stringify(addProbe))
  if (addProbe.rows !== 4 || addProbe.lastId !== 'my-custom' || addProbe.lastCustom !== true || addProbe.lastEnabled !== true || addProbe.formClosed !== true) {
    throw new Error('添加模型表单没按预期追加行：' + JSON.stringify(addProbe))
  }
  shots.push(await cdp.shot('02c-model-added'))

  // 2b+) 添加自定义条目后点「保存清单」才落盘：✕ / 添加模型是草稿操作，保存 = 修改整个清单
  await cdp.eval(`
    var n = Array.from(document.querySelectorAll('.pv_meActs button')).find(function (b) { return b.textContent.indexOf('保存清单') !== -1 });
    n.click();
  `)
  await sleep(600)
  const payload = await cdp.eval('window.__lastSetModels ?? null')
  console.log('  set-models 载荷:', JSON.stringify(payload))
  const payloadOk = payload !== null && payload.providerId === 'opencode-go' && JSON.stringify(payload.models) === JSON.stringify([
    { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', contextWindow: 1000000, maxTokens: 384000, input: ['text', 'image'], reasoningEfforts: { low: 'low', high: 'high', max: 'max' } },
    { id: 'kimi-k3' },
    { id: 'my-custom', name: 'My Custom', contextWindow: 1000000, maxTokens: 100000, input: ['text', 'image'] },
  ])
  if (payloadOk !== true) throw new Error('勾选保存载荷不对（声明原样 + 已知只写 id + 自定义全参数）：' + JSON.stringify(payload))
  shots.push(await cdp.shot('03-model-list-saved-toast'))

  // 2d) 跟随目录的 provider（夹具里 zai 没配 models）：编辑器必须把目录里的模型全部预勾——
  //     此前这种情况一个都不勾，用户会以为已启用的模型没启用（深度求索官方路由报的就是它）
  await cdp.eval(`
    var cards = document.querySelectorAll('.pv_pc')
    cards[cards.length - 1].querySelector('.pv_pcHead').click()
  `)
  await sleep(300)
  await cdp.eval(`
    var cards = document.querySelectorAll('.pv_pc')
    cards[cards.length - 1].querySelector('.pv_mHead').click()
  `)
  await sleep(300)
  await cdp.eval(`
    var cards = document.querySelectorAll('.pv_pc')
    var b = Array.from(cards[cards.length - 1].querySelectorAll('button')).find(function (x) { return x.textContent === '修改模型' })
    b.click()
  `)
  await cdp.waitFor('.pv_meRow')
  await sleep(300)
  const followPick = await cdp.eval(`(function () {
    var rows = Array.from(document.querySelectorAll('.pv_meRow'))
    var long = null
    for (var i = 0; i < rows.length; i += 1) {
      if ((rows[i].querySelector('.pv_mId') || {}).textContent === 'deepseek/deepseek-v4-flash-0731:patch') long = rows[i]
    }
    var geom = null
    if (long !== null) {
      var idEl = long.querySelector('.pv_mId')
      var capsEl = long.querySelector('.pv_mCaps')
      var r1 = idEl.getBoundingClientRect()
      var r2 = capsEl.getBoundingClientRect()
      geom = {
        singleLine: r1.height <= 20,
        clipped: idEl.scrollWidth > idEl.clientWidth,
        noOverlap: r1.right <= r2.left + 0.5,
      }
    }
    return {
      rows: rows.length,
      checked: rows.filter(function (el) { return el.querySelector('.pv_meCheck').checked })
        .map(function (el) { return (el.querySelector('.pv_mId') || {}).textContent }),
      hint: (document.querySelector('.pv_hint') || {}).textContent || '',
      geom: geom,
    }
  })()`)
  console.log('  跟随目录预勾探针:', JSON.stringify(followPick))
  if (followPick.rows !== 2 || JSON.stringify(followPick.checked) !== JSON.stringify(['glm-5.3-flash', 'deepseek/deepseek-v4-flash-0731:patch']) || followPick.hint.indexOf('已添加') === -1) {
    throw new Error('跟随目录的 provider 编辑器没有把目录模型全部预勾：' + JSON.stringify(followPick))
  }
  if (followPick.geom === null || followPick.geom.singleLine !== true || followPick.geom.clipped !== true || followPick.geom.noOverlap !== true) {
    throw new Error('长 ID 没有按「单行省略号截断、不与能力徽标重叠」处理：' + JSON.stringify(followPick.geom))
  }
  shots.push(await cdp.shot('02d-follow-catalog-prechecked'))
  // 收起 zai 的模型框，别影响后面的删除弹层步骤
  await cdp.eval(`
    var cards = document.querySelectorAll('.pv_pc')
    cards[cards.length - 1].querySelector('.pv_mHead').click()
  `)
  await sleep(200)

  // 3) 删除确认弹层（issue #3）
  await cdp.waitFor('[title^="删除这个 provider"]')
  await cdp.eval(`document.querySelector('[title^="删除这个 provider"]').click()`)
  await cdp.waitFor('.pv_modal')
  await sleep(300)
  const modalText = await cdp.eval(`document.querySelector('.pv_modal').textContent`)
  console.log('  弹层文案:', modalText.slice(0, 120))
  // 取消按钮要与弹层内容左缘对齐（弹层内边距 20px）——pv_action 自带 margin-left:auto 会把它顶离左边
  const cancelAlign = await cdp.eval(`(function () {
    var modal = document.querySelector('.pv_modal')
    var cancel = Array.from(document.querySelectorAll('.pv_modalActs button')).find(function (x) { return x.textContent === '取消' })
    if (modal === null || cancel === null) return null
    var m = modal.getBoundingClientRect()
    var c = cancel.getBoundingClientRect()
    return { offset: Math.round(c.left - (m.left + 20)) }
  })()`)
  console.log('  取消按钮左对齐探针:', JSON.stringify(cancelAlign))
  if (cancelAlign === null || Math.abs(cancelAlign.offset) > 2) {
    throw new Error('取消按钮没有与弹层内容左缘对齐：' + JSON.stringify(cancelAlign))
  }
  shots.push(await cdp.shot('04-delete-confirm-modal'))
  await cdp.eval(`var b = Array.from(document.querySelectorAll('.pv_modalActs button')).find(function (x) { return x.textContent === '取消' }); if (b) b.click();`)
  await sleep(300)

  // 4) pi-ai 桥接标签页（本地版：自动下载已停用）
  await cdp.eval(`var t = Array.from(document.querySelectorAll('.pv_tab')).find(function (x) { return x.textContent.indexOf('pi-ai 桥接') !== -1 }); if (t) t.click();`)
  await cdp.waitFor('.pv_line')
  await sleep(400)
  const bridgeText = await cdp.eval(`document.querySelector('.pv_stack').textContent`)
  // 切标签要清掉上一页的提示行——此前服务商页的报错会原样漏到桥接页冒出一句没来由的话
  const bridgeNote = await cdp.eval(`({
    pageNoteGone: document.querySelector('.pv_pageNote') === null,
    strayText: document.body.textContent.indexOf('端点必须以') !== -1,
    strayNoteInCard: document.querySelector('.pv_pcBody .plan_note') !== null,
  })`)
  console.log('  桥接页无跨标签残留:', JSON.stringify(bridgeNote))
  if (bridgeNote.pageNoteGone !== true || bridgeNote.strayText !== false || bridgeNote.strayNoteInCard !== false) {
    throw new Error('桥接页还有跨标签漏过来的提示：' + JSON.stringify(bridgeNote))
  }
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

  // 相邻截图不允许完全相同——两张一样说明某个步骤没有真正切过去（01/02 曾这样，md5 都相同）
  const dup = []
  for (let i = 1; i < shots.length; i += 1) {
    const a = createHash('md5').update(readFileSync(shots[i - 1])).digest('hex')
    const b = createHash('md5').update(readFileSync(shots[i])).digest('hex')
    if (a === b) dup.push(shots[i - 1].split(/[\\/]/).pop() + ' == ' + shots[i].split(/[\\/]/).pop())
  }
  if (dup.length > 0) throw new Error('相邻截图完全相同（步骤没真正切视图）：' + dup.join('; '))
  console.log('  相邻截图去重自检: ' + shots.length + ' 张两两相邻皆不同')

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
