/**
 * 回归测试：链路删除必须只摘链，绝不跟进 junction 目标。
 *
 * 背景（真实事故）：`rmSync(link, { recursive: true, force: true })` 删 Windows 目录 junction
 * 时，Node 24.15 起（DSH 自带运行时 electron 43.3.0 / node 24.18.1）会把 **junction 目标目录的
 * 内容一起删掉**；node 24.14 上同一句是安全的。插件的探针链指向 dsh 自带那份 pi-ai，于是每启动
 * 一次 DSH 就把 pi-ai 清空一次 ——「重启后 pi-ai 丢失」。
 *
 * 所以这个文件**必须在 DSH 的运行时里也跑一遍**：
 *   node test/link-removal.mjs
 *   ELECTRON_RUN_AS_NODE=1 "D:\ProgramFiles\DSH Desktop\DSH Desktop.exe" test/link-removal.mjs
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { removeLinkOrDir, vendorDir } from '../lib/bridge.js'

let pass = 0
let fail = 0
const check = (ok, label, detail = '') => {
  if (ok) { pass += 1; console.log(`  ✓ ${label}`) } else { fail += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** 造一个「像 pi-ai 的目标目录」：有 package.json + dist/index.js。 */
function makeTarget(base, name) {
  const target = join(base, name)
  mkdirSync(join(target, 'dist'), { recursive: true })
  writeFileSync(join(target, 'dist', 'index.js'), 'export const x = 1\n')
  writeFileSync(join(target, 'package.json'), '{"name":"@earendil-works/pi-ai","main":"./dist/index.js"}\n')
  return target
}
const intact = (target) =>
  existsSync(join(target, 'package.json')) && existsSync(join(target, 'dist', 'index.js'))

/** 在 vendor/llm-bridge/<dir>/node_modules/@earendil-works/pi-ai 建一条 junction（跟 probePiAi 同构）。 */
const probeDirs = []
function makeProbeLink(dirName, target) {
  const linkDir = join(vendorDir, 'llm-bridge', dirName, 'node_modules', '@earendil-works')
  mkdirSync(linkDir, { recursive: true })
  const link = join(linkDir, 'pi-ai')
  symlinkSync(target, link, 'junction')
  probeDirs.push(join(vendorDir, 'llm-bridge', dirName))
  return link
}

console.log(`\n运行环境：node ${process.version}${process.versions.electron ? ` / electron ${process.versions.electron}` : ''}（platform ${process.platform}）`)

const base = join(tmpdir(), 'link-removal-' + Date.now())
mkdirSync(base, { recursive: true })

// vendor/llm-bridge 里本来就有上游留下的 .probe-* 目录（.probe-good 等），先记下来做基线
const probeBaseline = existsSync(join(vendorDir, 'llm-bridge'))
  ? readdirSync(join(vendorDir, 'llm-bridge')).filter((name) => name.startsWith('.probe-')).sort()
  : []

// ---------- 0. 对照：裸 rmSync(recursive) 在当前运行时到底安全不安全 ----------
{
  const target = makeTarget(base, 'control-target')
  const link = makeProbeLink('.probe-control', target)
  rmSync(link, { recursive: true, force: true })
  const survived = intact(target)
  console.log(`  · 对照（裸 rmSync）：目标内容 ${survived ? '存活 → 本运行时不会连坐' : '被连坐删除 → 本运行时正是危险的那一版'}`)
  rmSync(base, { recursive: true, force: true })
  mkdirSync(base, { recursive: true })
}

// ---------- 1. 回归：removeLinkOrDir 摘链后目标必须完好 ----------
{
  const target = makeTarget(base, 'target-1')
  const link = makeProbeLink('.probe-one', target)
  check(lstatSync(link).isSymbolicLink(), 'junction 在 lstat 下就是 symbolicLink（这正是能安全摘链的前提）')
  removeLinkOrDir(link)
  check(!existsSync(link), 'removeLinkOrDir 之后链本身没了')
  check(intact(target), '★ 目标目录内容完好（回归点：曾被连带删除）')
}

// ---------- 2. 两次启动的探针生命周期：删旧链 → 建新链，重复两轮 ----------
{
  const target = makeTarget(base, 'target-2')
  for (let boot = 1; boot <= 2; boot += 1) {
    const link = makeProbeLink('.probe-boot', target)
    removeLinkOrDir(link) // 下一轮启动做的第一件事：删上一轮的链
    check(intact(target), `第 ${boot} 轮启动重复删链后，目标仍完好`)
  }
}

// ---------- 3. 幂等：链不存在时调用不抛 ----------
{
  try {
    removeLinkOrDir(join(base, 'never-existed'))
    check(true, '链/目录不存在时静默返回')
  } catch (error) {
    check(false, '链/目录不存在时静默返回', String(error))
  }
}

// ---------- 4. 真目录（非链）在 vendor/ 内仍然照常递归删 ----------
{
  const dir = join(vendorDir, '.test-real-dir-' + Date.now())
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'x.txt'), 'x')
  removeLinkOrDir(dir)
  check(!existsSync(dir), 'vendor/ 内的真目录仍会被递归删掉（修复没有把正常清理也废掉）')
}

// ---------- 5. 兜底：真目录在 vendor/ 之外一律拒绝 ----------
{
  const outside = join(base, 'outside-real-dir')
  mkdirSync(outside, { recursive: true })
  let threw = false
  try { removeLinkOrDir(outside) } catch { threw = true }
  check(threw && existsSync(outside), 'vendor/ 之外的真目录被拒绝删除（守卫生效）')
}

// ---------- 6. 安全性：vendor/ 里不能留下测试垃圾 ----------
{
  // 此刻所有 junction 都已摘掉，这些只剩空目录，递归删是安全的
  for (const dir of probeDirs) rmSync(dir, { recursive: true, force: true })
  const leftovers = (existsSync(join(vendorDir, 'llm-bridge'))
    ? readdirSync(join(vendorDir, 'llm-bridge')).filter((name) => name.startsWith('.probe-'))
    : []).sort()
  const added = leftovers.filter((name) => !probeBaseline.includes(name))
  check(added.length === 0, `测试没有在 vendor/ 留下新垃圾（新增：${added.join(', ') || '无'}）`)
}

rmSync(base, { recursive: true, force: true })
console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`)
process.exit(fail === 0 ? 0 : 1)
