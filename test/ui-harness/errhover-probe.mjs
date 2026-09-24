/**
 * 查询失败「报错 hover 化」探针（用户批注：详细报错 log 改为鼠标 hover「查询失败」时出现，
 * 展开卡底部的报错行不再渲染）。用 ?errCard=1 夹具追加一张 403 失败卡（报错形状复刻
 * adapters/opencode-go.ts 的真实输出），在真实渲染产物上断言：
 *
 *   1. 失败卡的「查询失败」chip 带 title == 完整报错原文（hover 数据源）
 *   2. 失败卡展开体里不再出现那段报错（plan_badText 平铺已移除）
 *   3. 正常卡的余量 chips 不带 title（不误挂 hover）
 *   4. 截图整页取证（失败卡展开态：chip 短句 + 体里无报错行）
 *
 * 原生 title 气泡是 OS 级弹层，headless 截不到——用 DOM title 属性做存在性取证。
 *
 *   node test/ui-harness/errhover-probe.mjs [输出目录]
 * 环境变量：CLIENT_SRC（被测 lib/client.js，缺省用 profile 里装的那份）/ CHROME / CDP_PORT
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] ?? join(tmpdir(), 'dsh-lp-errhover')
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
const PORT = Number(process.env.CDP_PORT ?? 9351)

const ERROR_TEXT = 'API key 有效，但该 workspace 没有订阅 OpenCode Go（HTTP 403）'

mkdirSync(outDir, { recursive: true })
copyFileSync(clientSrc, join(here, 'client.js'))
const sha = createHash('sha256').update(readFileSync(clientSrc)).digest('hex').slice(0, 16)
console.log(`被测 client.js sha256[:16]=${sha}`)

const profileDir = join(tmpdir(), `dsh-lp-errhover-${Date.now()}`)
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1200,1400',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
process.on('exit', () => { try { chrome.kill() } catch { /* 已退出 */ } })
chrome.unref()
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
  if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete() }
})
function send(method, params) {
  return new Promise((resolve) => { seq += 1; pending.set(seq, resolve); ws.send(JSON.stringify({ id: seq, method, params })) })
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

await send('Page.enable')
await send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') + '?errCard=1' })
for (let i = 0; i < 40; i += 1) {
  if (await evalJs(`document.querySelector('.pv_addBtn') !== null && window.__ready === true`) === true) break
  await sleep(250)
}

// 页侧量测：定位失败卡（meta 里有「查询失败」chip 的那张），抓 chip 的 title 与展开体内容
const state = await evalJs(`(function () {
  var ERROR_TEXT = ${JSON.stringify(ERROR_TEXT)}
  // 只认 provider 卡（带 .pv_pcMeta）；添加面板展开时根节点也是 .pv_pc，得排除
  var cards = Array.from(document.querySelectorAll('.pv_pc')).filter(function (c) {
    return c.querySelector('.pv_pcMeta') !== null
  })
  var badCard = null
  for (var i = 0; i < cards.length; i += 1) {
    if ((cards[i].textContent || '').indexOf('查询失败') !== -1) { badCard = cards[i]; break }
  }
  if (badCard === null) return { found: false }
  var meta = badCard.querySelector('.pv_pcMeta')
  var chips = meta === null ? [] : Array.from(meta.querySelectorAll('.pv_chipItem'))
  var failChip = null
  for (var j = 0; j < chips.length; j += 1) {
    if ((chips[j].textContent || '').indexOf('查询失败') !== -1) { failChip = chips[j]; break }
  }
  // 失败卡当前是否展开（error 卡 dflt=true，首次打开默认展开）
  var body = badCard.querySelector('.pv_pcBody')
  // 全卡任何位置都不该再平铺报错原文
  var bodyHasError = body !== null && (body.textContent || '').indexOf(ERROR_TEXT) !== -1
  var cardHasError = (badCard.textContent || '').indexOf(ERROR_TEXT) !== -1
  var badTextRows = badCard.querySelectorAll('.plan_badText').length
  // 正常卡的余量 chips 不该带 title
  var healthyChipTitles = []
  var healthy = cards.filter(function (c) { return c !== badCard })
  for (var k = 0; k < healthy.length; k += 1) {
    var hs = healthy[k].querySelectorAll('.pv_pcMeta .pv_chipItem')
    for (var h = 0; h < hs.length; h += 1) healthyChipTitles.push(hs[h].getAttribute('title'))
  }
  return {
    found: true,
    failChipText: failChip === null ? null : (failChip.textContent || '').trim(),
    failChipTitle: failChip === null ? null : failChip.getAttribute('title'),
    expanded: body !== null,
    bodyHasError: bodyHasError,
    cardHasError: cardHasError,
    badTextRows: badTextRows,
    healthyChipTitles: healthyChipTitles,
    cardCount: cards.length,
  }
})()`)

console.log('失败卡状态:', JSON.stringify(state, null, 1))
await shotPage('page-01-err-card')

console.log('\n=== errhover 断言 ===')
check('errCard 夹具渲染出失败卡（4 张卡）', state.found === true && state.cardCount === 4, `cardCount=${state.cardCount}`)
check('失败 chip 短句就是「查询失败」', state.failChipText === '查询失败', JSON.stringify(state.failChipText))
check('chip.title 挂完整报错原文（hover 数据源）', state.failChipTitle === ERROR_TEXT, JSON.stringify(state.failChipTitle))
check('失败卡展开体不再平铺报错原文', state.bodyHasError === false)
check('全卡任何位置都不含报错原文（含 title 属性外的文本节点）', state.cardHasError === false)
check('展开体没有 plan_badText 报错行（凭据警告本轮也不在夹具里）', state.badTextRows === 0, `badTextRows=${state.badTextRows}`)
check('正常卡的余量 chips 不带 title', Array.isArray(state.healthyChipTitles) && state.healthyChipTitles.every((t) => t === null),
  JSON.stringify(state.healthyChipTitles))

ws.close()
if (failures.length > 0) {
  console.error(`\nPROBE-FAIL：${failures.length} 项未过 — ${failures.join(' / ')}`)
  process.exit(1)
}
console.log('\nPROBE-DONE（全部通过）')
