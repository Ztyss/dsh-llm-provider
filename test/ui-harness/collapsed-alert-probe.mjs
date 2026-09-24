/**
 * 收起态告警行探针（用户 09-24 批注：错误卡不再自动展开，告警原文显示在收起态卡片上）。
 * 在干净 harness（只有本插件样式 + 宿主 token 替身）里对带 error + credentialWarning + note 的
 * GLM Coding 卡量 computed style / 几何，断言七件事：
 *
 *   1. **默认收起**——告警卡不再自动展开（aria-expanded=false、没有 .pv_pcBody）；
 *   2. 三张健康卡同样收起——自动展开不是搬到了别的卡上；
 *   3. 收起态三条红字——error → credentialWarning → note，顺序与 providerAlerts 一致；
 *   4. 红色沿用 plan_badText、单行省略号、title 给全文（截断时全文不丢）；
 *   5. 箭头列中心仍落在标题区（caretSkew=0）——告警行不能是把箭头拽到整卡中间；
 *   6. 展开态底部同样是那三条、顺序一致（两个槽位共用同一个纯函数，不漂移）；
 *   7. 展开互斥没被改坏——展开第二张卡时第一张收起。
 *
 *   node test/ui-harness/collapsed-alert-probe.mjs [输出目录]
 * 环境变量：CLIENT_SRC（被测 lib/client.js，缺省用本仓库刚 build 出来的那份）/ CHROME / CDP_PORT
 *
 * 输出：PASS/FAIL 清单 + 两张截图（收起态 / 展开态）。
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const outDir = process.argv[2] ?? join(tmpdir(), 'dsh-lp-collapsed-alert')
const clientSrc = process.env.CLIENT_SRC ?? join(root, 'lib', 'client.js')
const chromePath = process.env.CHROME
  ?? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:/Program Files (x86)/Microsoft Edge/Application/msedge.exe',
    'C:/Microsoft/Microsoft Edge/Application/msedge.exe',
  ].find((candidate) => candidate !== '' && existsSync(candidate))
if (chromePath === undefined || chromePath === '') throw new Error('找不到 Chrome/Edge，用 CHROME 环境变量指定浏览器路径')
if (!existsSync(clientSrc)) throw new Error(`找不到被测 client.js：${clientSrc}`)
const PORT = Number(process.env.CDP_PORT ?? 9353)

mkdirSync(outDir, { recursive: true })
copyFileSync(clientSrc, join(here, 'client.js'))
const sha = createHash('sha256').update(readFileSync(clientSrc)).digest('hex').slice(0, 16)
console.log(`被测 client.js sha256[:16]=${sha}`)

// 断言省略号用的是 Emulation.setDeviceMetricsOverride 把视口压到 320px：headless Chrome 有
// 最小窗口宽度（实测 500px），403 那句在 500px 下一行刚好放得下，那条断言会变成永不失败的摆设
const NARROW = 320
const WIDE = 1200
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${WIDE},1400`,
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), `dsh-lp-ca-${Date.now()}`)}`, 'about:blank',
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
// 截图走整页模式：元素级 clip 的坐标基准在这版 Chrome 里不可信（clip.scale 一度变成必填、
// x/y 与 getBoundingClientRect 也对不上，曾拍到隔两行的位置）——整页图没有坐标换算，证据不骗人
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

// 页面里量的形状：每张卡 → 名字 / 展开态 / 告警行 / 箭头中心偏移
function survey() {
  return Array.from(document.querySelectorAll('.pv_pc')).map((card) => {
    const name = card.querySelector('.pv_pcName')
    const caret = card.querySelector('.pv_pcCaretCol')
    const top = card.querySelector('.pv_pcTop')
    const alerts = Array.from(card.querySelectorAll('.pv_pcAlert')).map((el) => ({
      text: el.textContent,
      title: el.getAttribute('title'),
      // 独立字面量判红：不拿代码里的 .plan_badText 反推（那是同义反复），直接对 #d9534f
      red: getComputedStyle(el).color === 'rgb(217, 83, 79)',
      singleLine: el.getClientRects().length === 1,
      truncated: el.scrollWidth > el.clientWidth + 1,
      ellipsis: getComputedStyle(el).textOverflow === 'ellipsis',
      noWrap: getComputedStyle(el).whiteSpace === 'nowrap',
    }))
    const cr = caret === null ? null : caret.getBoundingClientRect()
    const tr = top === null ? null : top.getBoundingClientRect()
    return {
      name: name === null ? '?' : name.textContent,
      expanded: card.getAttribute('class') === null ? false : card.className.indexOf('pv_pcOpen') !== -1,
      ariaExpanded: (card.querySelector('.pv_pcHead') || {}).getAttribute === undefined
        ? null
        : card.querySelector('.pv_pcHead').getAttribute('aria-expanded'),
      hasBody: card.querySelector('.pv_pcBody') !== null,
      bodyAlerts: Array.from(card.querySelectorAll('.pv_pcBody .plan_note')).map((el) => el.textContent),
      alerts,
      // 箭头中心相对 pv_pcTop 中心的偏移（0 = 仍居中在标题区）
      caretSkew: cr === null || tr === null ? null : Math.round((cr.top + cr.bottom) / 2 - (tr.top + tr.bottom) / 2),
    }
  })
}

try {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) break
    } catch { /* 还没起来 */ }
    await sleep(200)
  }
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    const p = pending.get(msg.id)
    if (p !== undefined) {
      pending.delete(msg.id)
      if (msg.error !== undefined) p.reject(new Error(msg.error.message))
      else p.resolve(msg)
    }
  }
  await send('Page.enable')
  await send('Runtime.enable')
  // 先压到 320px：窄视口下量省略号（正文截断、title 给全文）
  await send('Emulation.setDeviceMetricsOverride', { width: NARROW, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') })
  await sleep(1000)
  if (await evalJs('window.__ready === true') !== true) throw new Error('harness not ready')
  await sleep(300)

  const ERR = 'API key 有效，但该 workspace 没有订阅 OpenCode Go（HTTP 403）'
  const WARN = 'GLM_API_KEY 与 ZAI_API_KEY 配了同一把 key'
  const NOTE = '账户不可用（余额不足或已欠费）'

  const cards = await evalJs(`(${survey.toString()})()`)
  const alert = cards.find((c) => c.name === 'GLM Coding (CN)')
  const healthy = cards.filter((c) => c.name !== 'GLM Coding (CN)')
  check('四张卡都在', cards.length === 4, cards.map((c) => c.name).join(' / '))
  if (alert === undefined) throw new Error('没找到 GLM Coding (CN) 告警卡')

  console.log('\n收起态：')
  check('告警卡默认收起', alert.expanded === false && alert.hasBody === false && alert.ariaExpanded === 'false',
    `expanded=${alert.expanded} aria=${alert.ariaExpanded}`)
  check('三张健康卡也全部收起', healthy.every((c) => c.expanded === false && c.hasBody === false),
    healthy.map((c) => `${c.name}:${c.expanded}`).join(' '))
  check('收起态三条告警，顺序 err/warn/note',
    alert.alerts.length === 3 && alert.alerts[0].text === ERR && alert.alerts[1].text === WARN && alert.alerts[2].text === NOTE,
    JSON.stringify(alert.alerts.map((a) => a.text)))
  check('三条都是红色（#d9534f）', alert.alerts.length === 3 && alert.alerts.every((a) => a.red === true))
  check('三条都单行不换行', alert.alerts.length === 3 && alert.alerts.every((a) => a.singleLine === true && a.noWrap === true))
  check('超长那条走省略号',
    alert.alerts.length === 3 && alert.alerts[0].truncated === true && alert.alerts[0].ellipsis === true,
    `scrollWidth-clientWidth 溢出，ellipsis=${alert.alerts.length === 3 ? alert.alerts[0].ellipsis : 'n/a'}`)
  check('省略号那条 title 给全文', alert.alerts.length === 3 && alert.alerts[0].title === ERR, String(alert.alerts.length === 3 ? alert.alerts[0].title : 'n/a'))
  check('健康卡没有告警行', healthy.every((c) => c.alerts.length === 0), JSON.stringify(healthy.map((c) => c.alerts.length)))
  check('箭头列中心仍在标题区（caretSkew=0）', cards.every((c) => c.caretSkew === 0),
    JSON.stringify(cards.map((c) => `${c.name}:${c.caretSkew}`)))
  // 量完窄视口恢复常规宽度：截图要能看清排版（320px 下的图字都挤在一起）
  await send('Emulation.setDeviceMetricsOverride', { width: WIDE, height: 1400, deviceScaleFactor: 1, mobile: false })
  await sleep(300)
  await shotPage('collapsed')

  // 展开：底部那三行必须和收起态同一个顺序、同一份文案
  await evalJs(`(function () {
    var card = Array.from(document.querySelectorAll('.pv_pc')).find(function (c) {
      var n = c.querySelector('.pv_pcName')
      return n !== null && n.textContent === 'GLM Coding (CN)'
    })
    card.querySelector('.pv_pcHead').click()
  })()`)
  await sleep(400)
  const afterOpen = await evalJs(`(${survey.toString()})()`)
  const opened = afterOpen.find((c) => c.name === 'GLM Coding (CN)')
  console.log('\n展开态：')
  check('点开后展开', opened.expanded === true && opened.hasBody === true)
  check('展开态底部同样是那三条、顺序一致',
    JSON.stringify(opened.bodyAlerts) === JSON.stringify([ERR, WARN, NOTE]),
    JSON.stringify(opened.bodyAlerts))
  await shotPage('expanded')

  // 互斥没被改坏：展开另一张卡时，告警卡要收起
  await evalJs(`(function () {
    var cards = Array.from(document.querySelectorAll('.pv_pc'))
    var other = cards.find(function (c) {
      var n = c.querySelector('.pv_pcName')
      return n !== null && n.textContent === 'OpenCode Go'
    })
    other.querySelector('.pv_pcHead').click()
  })()`)
  await sleep(400)
  const afterSecond = await evalJs(`(${survey.toString()})()`)
  console.log('\n互斥：')
  check('展开第二张卡时告警卡收起',
    afterSecond.find((c) => c.name === 'GLM Coding (CN)').expanded === false
    && afterSecond.find((c) => c.name === 'OpenCode Go').expanded === true)
} catch (e) {
  console.log('探测失败:', e && e.message)
  failures.push('探测本身失败')
} finally {
  try { ws.close() } catch { /* 已断 */ }
  chrome.kill('SIGKILL')
  setTimeout(() => process.exit(failures.length === 0 ? 0 : 1), 200)
}

console.log(failures.length === 0 ? '\n收起态告警行探针全部通过' : `\n${failures.length} 个失败：${failures.join('、')}`)
