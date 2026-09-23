/**
 * provider 编辑页行内微调探针（用户 09-23 两处截图批注，共 5 项）。
 * 在干净 harness（只有本插件样式 + 宿主 token 替身）里展开 StepFun 卡（step_plan 地址 =
 * 唯一带「查询配置」按钮的路由），对截图里的每一处量 computed style / 几何：
 *
 *   1. 聚焦描边：输入框聚焦只有 1px 深色 border（与协议下展开态同粗），不再 border+inset 视觉 2px
 *   2. 值列灰：协议下拉的值文本颜色 == 输入框值文本颜色（其它值列那个灰）
 *   3. 按钮贴输入框：「查询配置」按钮左缘紧贴 API 地址输入框右缘（不顶行尾）
 *   4. 弹层描边：协议弹层与「供应商筛选」下拉同款观感（border-width/color + 投影全部同 token）
 *   5. 选中项：品牌色 + 加粗之外另有浅底背景 + 行尾官方对勾
 *
 *   node test/ui-harness/rowpolish-probe.mjs [输出目录]
 * 环境变量：CLIENT_SRC（被测 lib/client.js，缺省用 profile 里装的那份）/ CHROME / CDP_PORT
 *
 * 输出：5 条 PASS/FAIL + 三张 3 倍放大截图（URL 行含聚焦态 / 协议弹层 / 供应商筛选弹层）。
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = process.argv[2] ?? join(tmpdir(), 'dsh-lp-rowpolish')
const clientSrc = process.env.CLIENT_SRC
  ?? join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', '@ztyss', 'dsh-llm-provider', 'lib', 'client.js')
const chromePath = process.env.CHROME
  ?? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Microsoft Edge/Application/msedge.exe',
  ].find((candidate) => candidate !== '' && existsSync(candidate))
if (chromePath === undefined || chromePath === '') throw new Error('找不到 Chrome/Edge，用 CHROME 环境变量指定浏览器路径')
if (!existsSync(clientSrc)) throw new Error(`找不到被测 client.js：${clientSrc}`)
const PORT = Number(process.env.CDP_PORT ?? 9347)

mkdirSync(outDir, { recursive: true })
copyFileSync(clientSrc, join(here, 'client.js'))
const sha = createHash('sha256').update(readFileSync(clientSrc)).digest('hex').slice(0, 16)
console.log(`被测 client.js sha256[:16]=${sha}`)

const profileDir = join(tmpdir(), `dsh-lp-rowpolish-${Date.now()}`)
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1200,1200',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
process.on('exit', () => { try { chrome.kill() } catch { /* 已退出 */ } })
// unref：断言全过时不会走到 process.exit(1)，开着的事件循环（WebSocket + Chrome 子进程）
// 会把脚本挂住不放——超时杀掉等于红绿都看不出来。unref 后正常走到末尾自然退出。
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

// 行内量测脚本：给定选择器与谓词，返回 computed style + 几何（page 侧执行）
const PROBE_PAGE_FN = `
  function styleOf(el) {
    if (el === null || el === undefined) return null
    var cs = getComputedStyle(el)
    var r = el.getBoundingClientRect()
    return {
      tag: el.tagName,
      borderTopWidth: cs.borderTopWidth,
      borderTopColor: cs.borderTopColor,
      boxShadow: cs.boxShadow,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontWeight: cs.fontWeight,
      hasSvg: el.querySelector('svg') !== null,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom,
              docX: r.x + window.scrollX, docY: r.y + window.scrollY },
    }
  }
  function cardBody() {
    var bodies = Array.from(document.querySelectorAll('.pv_pcBody'))
    for (var i = 0; i < bodies.length; i += 1) {
      if ((bodies[i].textContent || '').indexOf('step_plan') !== -1) return bodies[i]
    }
    return bodies.length > 0 ? bodies[0] : null
  }
  function rows() {
    var body = cardBody()
    return body === null ? [] : Array.from(body.querySelectorAll('.pv_line'))
  }
  function rowBy(pred) {
    var all = rows()
    for (var i = 0; i < all.length; i += 1) if (pred(all[i])) return all[i]
    return null
  }
  function urlRow() {
    return rowBy(function (r) {
      return Array.from(r.querySelectorAll('button.pv_action')).some(function (b) {
        return (b.textContent || '').indexOf('查询配置') !== -1
      })
    })
  }
  function protocolRow() {
    return rowBy(function (r) { return r.querySelector('.pv_selTrigger') !== null })
  }
  return {
    urlInput: styleOf(urlRow() === null ? null : urlRow().querySelector('input.pv_field')),
    urlBtn: styleOf(urlRow() === null ? null : urlRow().querySelector('button.pv_action')),
    urlRowBox: (function () {
      var row = urlRow()
      if (row === null) return null
      var b = row.getBoundingClientRect()
      return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right,
               docX: b.x + window.scrollX, docY: b.y + window.scrollY }
    })(),
    protocolTrigger: styleOf(protocolRow() === null ? null : protocolRow().querySelector('.pv_selTrigger')),
    protocolValue: styleOf(protocolRow() === null ? null : protocolRow().querySelector('.pv_selValue')),
    selMenu: styleOf(document.querySelector('.pv_selMenu')),
    selOptionOn: styleOf(document.querySelector('.pv_selOptionOn')),
    selOptionPlain: styleOf(document.querySelector('.pv_selOption:not(.pv_selOptionOn)')),
    pickBtn: styleOf(document.querySelector('.pv_pickBtn')),
    pickMenu: styleOf(document.querySelector('.pv_pickMenu')),
    // StepFun 卡标题行的额度 chip：夹具必须复刻 stepfun 适配器真实形状（harness.html 注释）
    stepChips: (function () {
      var body = cardBody()
      var card = body === null ? null : body.closest('.pv_pc')
      if (card === null) return []
      return Array.from(card.querySelectorAll('.pv_pcMeta .pv_chipItem')).map(function (el) {
        return el.textContent || ''
      })
    })(),
    // 显示名行：placeholder = 路由 id 的那个输入框。用来钉「API 地址/Cookie 输入框
    // 与显示名齐宽」——曾用 .pv_rowField 固定宽度把这两个撑得比别的行宽 60px（用户批注）
    nameField: (function () {
      var all = Array.from(document.querySelectorAll('.pv_pcBody input.pv_field'))
      for (var i = 0; i < all.length; i += 1) {
        if (all[i].type === 'password') continue
        if ((all[i].getAttribute('placeholder') || '').indexOf('stepfun-test') !== -1) return styleOf(all[i])
      }
      return null
    })(),
    // 「查询配置」展开后的控制台 Cookie 行（标签文案 + 按钮位置）
    cookieRow: (function () {
      var input = null
      var all = Array.from(document.querySelectorAll('input.pv_field'))
      for (var i = 0; i < all.length; i += 1) {
        if ((all[i].getAttribute('placeholder') || '').indexOf('Cookie') !== -1) { input = all[i]; break }
      }
      if (input === null) return null
      var row = input.closest('.pv_line')
      var label = row === null ? null : row.firstElementChild
      var btn = row === null ? null : row.querySelector('button.pv_action')
      var box = row === null ? null : row.getBoundingClientRect()
      return {
        labelText: label === null ? '' : (label.textContent || ''),
        labelHeight: label === null ? 0 : label.getBoundingClientRect().height,
        lineHeight: label === null ? 0 : parseFloat(getComputedStyle(label).lineHeight),
        input: styleOf(input),
        btn: styleOf(btn),
        rowRight: box === null ? null : box.right,
      }
    })(),
  }
`

await send('Page.enable')
// headless 下页面不持有窗口焦点，el.focus() 只设 activeElement、不生效 :focus 伪类
// （聚焦描边断言会永远量到静止态）。开焦点模拟，让 :focus 规则真正参与计算。
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Page.navigate', { url: 'file:///' + join(here, 'harness.html').replace(/\\/g, '/') })
for (let i = 0; i < 40; i += 1) {
  if (await evalJs(`document.querySelector('.pv_addBtn') !== null && window.__ready === true`) === true) break
  await sleep(250)
}

// 展开 StepFun 卡（step_plan 地址 → 唯一带「查询配置」按钮的路由）
await evalJs(`
  (function () {
    var heads = Array.from(document.querySelectorAll('.pv_pcHead'))
    var head = heads.find(function (h) { return (h.textContent || '').indexOf('StepFun') !== -1 }) || heads[0]
    head.click()
    return true
  })()
`)
for (let i = 0; i < 20; i += 1) {
  if (await evalJs(`
    Array.from(document.querySelectorAll('button.pv_action')).some(function (b) {
      return (b.textContent || '').indexOf('查询配置') !== -1
    })`) === true) break
  await sleep(200)
}

// ---- 1/2/3：聚焦前后 + 值列颜色 + 按钮位置（照截图的静止态先量）----
const rest = await evalJs(`(function () { ${PROBE_PAGE_FN} })()`)
console.log('静止态:', JSON.stringify({
  urlInput: rest.urlInput, urlBtn: rest.urlBtn, urlRowRight: rest.urlRowBox?.right,
  protocolTrigger: rest.protocolTrigger, protocolValue: rest.protocolValue,
}, null, 1))
if (rest.urlInput === null || rest.urlBtn === null || rest.protocolValue === null) {
  console.error('夹具没渲染出 URL 行 / 协议行——harness 数据或展开逻辑变了')
  ws.close()
  process.exit(2)
}

// ---- 1：聚焦态（拍完这张再动页面：打开协议下拉/添加面板都会挪布局，坐标会失效）----
const focused = await evalJs(`(function () {
  var row = Array.from(document.querySelectorAll('.pv_pcBody .pv_line')).find(function (r) {
    return Array.from(r.querySelectorAll('button.pv_action')).some(function (b) {
      return (b.textContent || '').indexOf('查询配置') !== -1
    })
  })
  var input = row === null ? null : row.querySelector('input.pv_field')
  if (input !== null) input.focus()
  return {
    isActive: document.activeElement === input,
    hasFocus: document.hasFocus(),
    matchesFocus: input === null ? null : input.matches(':focus'),
  }
})()`)
console.log('聚焦诊断:', JSON.stringify(focused))
const focusStyle = await evalJs(`(function () { ${PROBE_PAGE_FN} })()`)
console.log('聚焦态:', JSON.stringify({ urlInput: focusStyle.urlInput }, null, 1))

// URL 行截图（此刻取材：输入框聚焦中、布局未被后续点击改动）
// #1 的取证：此刻输入框聚焦中、页面还没被后续点击动过——整页拍一张
await shotPage('page-01-url-focus')

const openTriggerStyle = await evalJs(`(function () {
  var row = Array.from(document.querySelectorAll('.pv_pcBody .pv_line')).find(function (r) {
    return r.querySelector('.pv_selTrigger') !== null
  })
  var trigger = row === null ? null : row.querySelector('.pv_selTrigger')
  trigger.click()
  return trigger !== null
})()`)
await sleep(150)
const openState = await evalJs(`(function () { ${PROBE_PAGE_FN} })()`)
console.log('协议展开态:', JSON.stringify({
  protocolTrigger: openState.protocolTrigger, selMenu: openState.selMenu,
  selOptionOn: openState.selOptionOn, selOptionPlain: openState.selOptionPlain,
}, null, 1))

// ---- 4：协议弹层 vs 供应商筛选下拉 ----
// 协议菜单此刻开着：先量、先整页拍（再点「添加供应商」会被外点监听关掉它，且布局又挪一次）
await shotPage('page-02-protocol-menu')

// ---- 「查询配置」展开态：控制台 Cookie 行（标签文案 + 保存按钮位置）----
await evalJs(`(function () {
  var btns = Array.from(document.querySelectorAll('button.pv_action'))
  var btn = btns.find(function (b) { return (b.textContent || '').indexOf('查询配置') !== -1 })
  if (btn !== null && btn !== undefined) btn.click()
  return btn !== null && btn !== undefined
})()`)
for (let i = 0; i < 20; i += 1) {
  if (await evalJs(`
    Array.from(document.querySelectorAll('input.pv_field')).some(function (el) {
      return (el.getAttribute('placeholder') || '').indexOf('Cookie') !== -1
    })`) === true) break
  await sleep(200)
}
const cookieState = await evalJs(`(function () { ${PROBE_PAGE_FN} })()`)
console.log('控制台 Cookie 行:', JSON.stringify(cookieState.cookieRow, null, 1))
await shotPage('page-04-cookie-row')

await evalJs(`(function () { var btn = document.querySelector('.pv_addBtn'); if (btn !== null) btn.click(); return true })()`)
for (let i = 0; i < 20; i += 1) {
  if (await evalJs(`document.querySelector('.pv_pickBtn') !== null`) === true) break
  await sleep(200)
}
await evalJs(`(function () { var btn = document.querySelector('.pv_pickBtn'); if (btn !== null) btn.click(); return true })()`)
for (let i = 0; i < 20; i += 1) {
  if (await evalJs(`document.querySelector('.pv_pickMenu') !== null`) === true) break
  await sleep(200)
}
const pickState = await evalJs(`(function () { ${PROBE_PAGE_FN} })()`)
console.log('供应商筛选展开态:', JSON.stringify({ pickBtn: pickState.pickBtn, pickMenu: pickState.pickMenu }, null, 1))

await shotPage('page-03-pick-menu')

console.log('\n=== rowpolish 断言 ===')
// 1. 聚焦描边 = 协议展开态那条 1px 深色 border，不再叠 inset 阴影
check('聚焦输入框：无 inset 阴影（视觉回到 1px）', focused.matchesFocus === true && focusStyle.urlInput.boxShadow === 'none',
  `box-shadow=${focusStyle.urlInput.boxShadow}`)
check('聚焦输入框：border-width 与协议展开态一致',
  focusStyle.urlInput.borderTopWidth === openState.protocolTrigger.borderTopWidth,
  `${focusStyle.urlInput.borderTopWidth} vs ${openState.protocolTrigger.borderTopWidth}`)
check('聚焦输入框：border-color 与协议展开态同色',
  focusStyle.urlInput.borderTopColor === openState.protocolTrigger.borderTopColor,
  `${focusStyle.urlInput.borderTopColor} vs ${openState.protocolTrigger.borderTopColor}`)
check('聚焦确实加深了描边（不是没变化）',
  focusStyle.urlInput.borderTopColor !== rest.urlInput.borderTopColor,
  `${rest.urlInput.borderTopColor} → ${focusStyle.urlInput.borderTopColor}`)

// 2. 协议值文本 = 其它值列那个灰
check('协议值文本颜色 == 输入框值文本颜色', openState.protocolValue.color === rest.urlInput.color,
  `${openState.protocolValue.color} vs ${rest.urlInput.color}`)

// 3. 查询配置按钮紧贴输入框
const gap = rest.urlBtn.rect.x - rest.urlInput.rect.right
const rowRight = rest.urlRowBox?.right ?? 0
check('「查询配置」紧贴 API 地址输入框（间距 ≤ 12px）', gap >= -1 && gap <= 12, `gap=${gap.toFixed(1)}px`)
check('「查询配置」不再顶到行尾', rest.urlBtn.rect.right < rowRight - 40,
  `btn.right=${rest.urlBtn.rect.right.toFixed(1)} row.right=${rowRight.toFixed(1)}`)

// 4. 协议弹层与供应商筛选下拉同款描边观感
const sel = openState.selMenu
const pick = pickState.pickMenu
check('两个弹层 border-width 一致', sel !== null && pick !== null && sel.borderTopWidth === pick.borderTopWidth,
  `${sel?.borderTopWidth} vs ${pick?.borderTopWidth}`)
check('两个弹层 border-color 一致', sel !== null && pick !== null && sel.borderTopColor === pick.borderTopColor,
  `${sel?.borderTopColor} vs ${pick?.borderTopColor}`)
check('两个弹层投影一致（referenced 供应商筛选下拉的整套外观）',
  sel !== null && pick !== null && sel.boxShadow === pick.boxShadow,
  `${sel?.boxShadow} vs ${pick?.boxShadow}`)
check('弹层描边确实可见（1px 不透明边）',
  sel !== null && sel.borderTopWidth === '1px' && sel.borderTopColor !== 'rgba(0, 0, 0, 0)' && sel.borderTopColor !== 'transparent',
  `${sel?.borderTopWidth} ${sel?.borderTopColor}`)

// 5. 选中项：浅底 + 行尾对勾
check('选中项带背景（不再与未选中同一张脸）',
  openState.selOptionOn !== null && openState.selOptionOn.backgroundColor !== 'rgba(0, 0, 0, 0)'
  && openState.selOptionOn.backgroundColor !== openState.selOptionPlain?.backgroundColor,
  `${openState.selOptionOn?.backgroundColor} vs 未选中 ${openState.selOptionPlain?.backgroundColor}`)
check('选中项行尾有对勾', openState.selOptionOn !== null && openState.selOptionOn.hasSvg === true,
  `fontWeight=${openState.selOptionOn?.fontWeight}`)

// 6. 控制台 Cookie 行（用户 09-23 追加批注）
const cookie = cookieState.cookieRow
check('「查询配置」能展开出 Cookie 行', cookie !== null)
if (cookie !== null) {
  check('Cookie 行标签就是「Cookie」（不再写「控制台 Cookie」、不再折两行）',
    cookie.labelText === 'Cookie' && cookie.labelHeight <= cookie.lineHeight + 1,
    `label=${JSON.stringify(cookie.labelText)} 高 ${cookie.labelHeight}px / 行高 ${cookie.lineHeight}px`)
  const cookieGap = cookie.btn.rect.x - cookie.input.rect.right
  check('「保存」紧贴 Cookie 输入框（间距 ≤ 12px）', cookieGap >= -1 && cookieGap <= 12, `gap=${cookieGap.toFixed(1)}px`)
  check('「保存」不再顶到行尾', cookie.btn.rect.right < cookie.rowRight - 40,
    `btn.right=${cookie.btn.rect.right.toFixed(1)} row.right=${Number(cookie.rowRight).toFixed(1)}`)
  const nameField = cookieState.nameField
  check('API 地址 / Cookie 输入框与显示名齐宽（不许被单独拉长）',
    nameField !== null
    && Math.abs(rest.urlInput.rect.w - nameField.rect.w) <= 2
    && Math.abs(cookie.input.rect.w - nameField.rect.w) <= 2,
    `url.w=${rest.urlInput.rect.w.toFixed(1)} cookie.w=${cookie.input.rect.w.toFixed(1)} name.w=${nameField === null ? '?' : nameField.rect.w.toFixed(1)}`)
  check('「保存」与「查询配置」左缘对齐（≤ 12px）',
    Math.abs(cookie.btn.rect.x - rest.urlBtn.rect.x) <= 12,
    `save.x=${cookie.btn.rect.x.toFixed(1)} query.x=${rest.urlBtn.rect.x.toFixed(1)}`)
}

// 7. StepFun 卡额度标签：套餐点数是月度 plan → 30d（既不显示 Step，也不落兜底 Remain）
const stepChipLabels = cookieState.stepChips.map((text) => String(text).split(':')[0])
check('StepFun 卡有 30d 档额度 chip', stepChipLabels.indexOf('30d') !== -1,
  `chips=${JSON.stringify(cookieState.stepChips)}`)
check('StepFun 卡不再出现 Step / Remain 这类标签',
  stepChipLabels.every((label) => label !== 'Step' && label !== 'Remaining' && label !== 'Remain'),
  `labels=${JSON.stringify(stepChipLabels)}`)

ws.close()
if (failures.length > 0) {
  console.error(`\nPROBE-FAIL：${failures.length} 项未过 — ${failures.join(' / ')}`)
  process.exit(1)
}
console.log('\nPROBE-DONE（全部通过）')
