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

// 页侧量测：定位失败卡（displayName「OpenCode Go」且带「查询失败」chip 的那张——夹具里
// glm-cn 告警卡也有一颗同文案的失败 chip，靠显示名区分），抓 chip 的 title 与展开体内容
const state = await evalJs(`(function () {
  var ERROR_TEXT = ${JSON.stringify(ERROR_TEXT)}
  // 只认 provider 卡（带 .pv_pcMeta）；添加面板展开时根节点也是 .pv_pc，得排除
  var cards = Array.from(document.querySelectorAll('.pv_pc')).filter(function (c) {
    return c.querySelector('.pv_pcMeta') !== null
  })
  var badCard = null
  for (var i = 0; i < cards.length; i += 1) {
    var tx = cards[i].textContent || ''
    if (tx.indexOf('查询失败') !== -1 && tx.indexOf('OpenCode Go') !== -1) { badCard = cards[i]; break }
  }
  if (badCard === null) return { found: false }
  var meta = badCard.querySelector('.pv_pcMeta')
  var chips = meta === null ? [] : Array.from(meta.querySelectorAll('.pv_chipItem'))
  var failChip = null
  for (var j = 0; j < chips.length; j += 1) {
    if ((chips[j].textContent || '').indexOf('查询失败') !== -1) { failChip = chips[j]; break }
  }
  // 错误卡默认收起（err-hover 与远端「不再自动展开」合流后的一致行为）：
  // 收起态全卡文本不该出现报错原文；告警红行槽位已废除（全部 chip 化）
  var collapsedHasError = (badCard.textContent || '').indexOf(ERROR_TEXT) !== -1
  var collapsedAlertLines = badCard.querySelectorAll('.pv_pcAlert').length
  // glm-cn 告警卡（error+warn+note 三种都配了）：三颗告警 chips——查询失败/凭据告警/账户提示
  var alertCard = null
  for (var a = 0; a < cards.length; a += 1) {
    if ((cards[a].textContent || '').indexOf('GLM Coding') !== -1) { alertCard = cards[a]; break }
  }
  var alertCardChips = []
  if (alertCard !== null) {
    var acs = alertCard.querySelectorAll('.pv_pcMeta .pv_chipItem')
    for (var ac = 0; ac < acs.length; ac += 1) {
      alertCardChips.push({ text: (acs[ac].textContent || '').trim(), title: acs[ac].getAttribute('title') })
    }
  }
  var alertCardHasError = alertCard !== null && (alertCard.textContent || '').indexOf(ERROR_TEXT) !== -1
  // 正常卡的余量 chips 不该带 title
  var healthyChipTitles = []
  var healthy = cards.filter(function (c) { return c !== badCard && c !== alertCard })
  for (var k = 0; k < healthy.length; k += 1) {
    var hs = healthy[k].querySelectorAll('.pv_pcMeta .pv_chipItem')
    for (var h = 0; h < hs.length; h += 1) healthyChipTitles.push(hs[h].getAttribute('title'))
  }
  return {
    found: true,
    failChipText: failChip === null ? null : (failChip.textContent || '').trim(),
    failChipTitle: failChip === null ? null : failChip.getAttribute('title'),
    collapsedHasError: collapsedHasError,
    collapsedAlertLines: collapsedAlertLines,
    failChipCount: (function () {
      var n = 0
      for (var f = 0; f < chips.length; f += 1) { if ((chips[f].textContent || '').indexOf('查询失败') !== -1) n += 1 }
      return n
    })(),
    alertCardChips: alertCardChips,
    alertCardHasError: alertCardHasError,
    healthyChipTitles: healthyChipTitles,
    cardCount: cards.length,
  }
})()`)

console.log('失败卡状态:', JSON.stringify(state, null, 1))

// 点开失败卡：展开体同样不该平铺报错原文（err 只活在 chip 的 title hover 里）
await evalJs(`(function () {
  var cards = Array.from(document.querySelectorAll('.pv_pc'))
  for (var i = 0; i < cards.length; i += 1) {
    var tx = cards[i].textContent || ''
    if (tx.indexOf('查询失败') !== -1 && tx.indexOf('OpenCode Go') !== -1) {
      var head = cards[i].querySelector('.pv_pcHead')
      if (head !== null) head.click()
      return true
    }
  }
  return false
})()`)
for (let i = 0; i < 20; i += 1) {
  if (await evalJs(`(function () {
    var cards = Array.from(document.querySelectorAll('.pv_pc'))
    for (var i = 0; i < cards.length; i += 1) {
      var tx = cards[i].textContent || ''
      if (tx.indexOf('查询失败') !== -1 && tx.indexOf('OpenCode Go') !== -1) {
        return cards[i].querySelector('.pv_pcBody') !== null
      }
    }
    return false
  })()`) === true) break
  await sleep(200)
}
const opened = await evalJs(`(function () {
  var ERROR_TEXT = ${JSON.stringify(ERROR_TEXT)}
  var cards = Array.from(document.querySelectorAll('.pv_pc'))
  for (var i = 0; i < cards.length; i += 1) {
    var tx = cards[i].textContent || ''
    if (tx.indexOf('查询失败') !== -1 && tx.indexOf('OpenCode Go') !== -1 && cards[i].querySelector('.pv_pcBody') !== null) {
      var body = cards[i].querySelector('.pv_pcBody')
      return {
        bodyHasError: (body.textContent || '').indexOf(ERROR_TEXT) !== -1,
        badTextRows: body.querySelectorAll('.plan_badText').length,
      }
    }
  }
  return null
})()`)
console.log('展开态:', JSON.stringify(opened))
await shotPage('page-01-err-card')

console.log('\n=== errhover 断言 ===')
check('errCard 夹具渲染出失败卡（5 张卡：4 基础 + errCard）', state.found === true && state.cardCount === 5, `cardCount=${state.cardCount}`)
check('失败 chip 短句就是「查询失败」', state.failChipText === '查询失败', JSON.stringify(state.failChipText))
check('chip.title 挂完整报错原文（hover 数据源）', state.failChipTitle === ERROR_TEXT, JSON.stringify(state.failChipTitle))
check('失败卡只有这一颗告警 chip（err 卡不出凭据/账户 chips）', state.failChipCount === 1, `count=${state.failChipCount}`)
check('收起态卡片不平铺报错原文', state.collapsedHasError === false)
check('旧告警红行槽位已废除（.pv_pcAlert = 0）', state.collapsedAlertLines === 0, `lines=${state.collapsedAlertLines}`)
check('展开体不再平铺报错原文', opened !== null && opened.bodyHasError === false)
check('展开体没有 plan_badText 报错行（opencode-err 只有 error 一种）', opened !== null && opened.badTextRows === 0,
  `badTextRows=${opened === null ? 'n/a' : opened.badTextRows}`)
check('glm-cn 告警卡三颗 chips：查询失败/凭据告警/账户提示',
  state.alertCardChips.map((c) => c.text).join(',') === '查询失败,凭据告警,账户提示',
  JSON.stringify(state.alertCardChips.map((c) => c.text)))
check('glm-cn 的凭据/账户 chips 的 title 各挂原文（hover 全文）',
  state.alertCardChips[1] !== undefined && state.alertCardChips[1].title === 'GLM_API_KEY 与 ZAI_API_KEY 配了同一把 key'
  && state.alertCardChips[2] !== undefined && state.alertCardChips[2].title === '账户不可用（余额不足或已欠费）',
  JSON.stringify(state.alertCardChips.map((c) => c.title)))
check('glm-cn 告警卡也不平铺报错原文', state.alertCardHasError === false)
check('正常卡的余量 chips 不带 title', Array.isArray(state.healthyChipTitles) && state.healthyChipTitles.every((t) => t === null),
  JSON.stringify(state.healthyChipTitles))

// ---- 第二段：状态 chip 的 hover 说明（?statCard=1：追加未配置凭据 + 无适配器两张卡）----
await send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') + '?statCard=1' })
for (let i = 0; i < 40; i += 1) {
  if (await evalJs(`document.querySelector('.pv_addBtn') !== null && window.__ready === true`) === true) break
  await sleep(250)
}
const statState = await evalJs(`(function () {
  var cards = Array.from(document.querySelectorAll('.pv_pc')).filter(function (c) {
    return c.querySelector('.pv_pcMeta') !== null
  })
  function chipOf(nameText) {
    for (var i = 0; i < cards.length; i += 1) {
      if ((cards[i].textContent || '').indexOf(nameText) === -1) continue
      var chips = cards[i].querySelectorAll('.pv_pcMeta .pv_chipItem')
      return chips.length > 0
        ? { text: (chips[0].textContent || '').trim(), title: chips[0].getAttribute('title'), dotWarn: cards[i].querySelector('.plan_dot_warn') !== null }
        : null
    }
    return null
  }
  return {
    cardCount: cards.length,
    nokey: chipOf('NoKey Demo'),
    mystery: chipOf('Mystery'),
  }
})()`)
console.log('状态卡:', JSON.stringify(statState))
await shotPage('page-02-stat-cards')

check('statCard 夹具渲染出 6 张卡（4 基础 + 2 状态）', statState.cardCount === 6, `cardCount=${statState.cardCount}`)
check('「未配置 key」chip 的 title 是填 key 指引', statState.nokey !== null && statState.nokey.title !== null
  && statState.nokey.title.indexOf('API 密钥') !== -1, JSON.stringify(statState.nokey === null ? null : statState.nokey.title))
check('未配置卡带警示黄点', statState.nokey !== null && statState.nokey.dotWarn === true)
check('「无适配器」chip 的 title 是原因说明', statState.mystery !== null && statState.mystery.title !== null
  && statState.mystery.title.indexOf('适配') !== -1, JSON.stringify(statState.mystery === null ? null : statState.mystery.title))

ws.close()
if (failures.length > 0) {
  console.error(`\nPROBE-FAIL：${failures.length} 项未过 — ${failures.join(' / ')}`)
  process.exit(1)
}
console.log('\nPROBE-DONE（全部通过）')
