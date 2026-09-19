/**
 * 回归测试：插件不许把「指向 dsh 安装树的链」留在插件包里，且宿主 pi-ai 被清空时能自愈。
 *
 * 背景（真实事故，第二次）：插件把 `vendor/llm-bridge/node_modules/@earendil-works/pi-ai`
 * 挂成 junction，目标直接指向 dsh 自带那份 pi-ai。插件包目录
 * （`profiles/<profile>/node_modules/<插件>`）是**别人会整棵递归删除**的地方——包管理器、插件市场、
 * 宿主都会删它重建。而 Node 24.15 起（本机实测：DSH 自带运行时 electron 43.3.0 / node 24.18.1）
 * 递归删除容器目录时会**顺着 junction 把目标内容一起清空**。于是：卸载/重装插件 → dsh 自带
 * pi-ai 被清空 → 官方 llm-pi-ai 入口加载失败 → 重启后 dsh 起不来（日志：`Cannot find package
 * '<app>\node_modules\@earendil-works\pi-ai\index.js'`）。
 *
 * 现在的不变量：
 *   1. 插件包外面的候选（dsh 自带那份）先复制成安全区副本，链只指向副本；
 *   2. 递归删除一律走 removeTree（只摘链，不跟进目标）；
 *   3. dsh 自带那份被别的工具清空时，启动时用副本补回来（只补缺，不删东西）。
 *
 * 所以这个文件**必须在 DSH 的运行时里也跑一遍**：
 *   node test/host-safety.mjs
 *   ELECTRON_RUN_AS_NODE=1 "D:\ProgramFiles\DSH Desktop\DSH Desktop.exe" test/host-safety.mjs
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import {
  copyTreeNoLinks,
  ensureSafeCopy,
  piAiEntryMissing,
  removeTree,
  repairPiAiFromCopy,
} from '../lib/bridge.js'

let pass = 0
let fail = 0
let skip = 0
const check = (ok, label, detail = '') => {
  if (ok) { pass += 1; console.log(`  ✓ ${label}`) } else { fail += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}
const skipCheck = (label, why) => { skip += 1; console.log(`  · ${label}（跳过：${why}）`) }

/** 造一份「像 pi-ai 的包」：package.json（带 main）+ dist/index.js。 */
function makePiAi(dir, version = '0.0.1-test') {
  mkdirSync(join(dir, 'dist'), { recursive: true })
  writeFileSync(join(dir, 'dist', 'index.js'), 'export const x = 1\n')
  writeFileSync(join(dir, 'dist', 'providers-all.js'), 'export const y = 2\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: '@earendil-works/pi-ai', version, main: './dist/index.js' }, null, 2)}\n`)
  writeFileSync(join(dir, 'README.md'), 'x\n'.repeat(20))
  return dir
}
const intact = (dir) => existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'dist', 'index.js'))
const isLink = (path) => {
  try { return lstatSync(path).isSymbolicLink() } catch { return false }
}
const inside = (child, parent) => child === parent || child.startsWith(parent + sep)

/**
 * 递归删除会不会跟进 junction —— 跟运行时版本有关。
 *
 * 实测：node 24.14.0 安全；DSH 自带运行时 electron 43.3.0 / node 24.18.1 会连坐目标。
 * 所以「被连坐的是副本」这条断言只在危险运行时上成立；安全运行时副本完好也是对的。
 */
const nodeParts = process.versions.node.split('.').map((part) => Number(part) || 0)
const destructiveRuntime = (nodeParts[0] ?? 0) > 24
  || ((nodeParts[0] ?? 0) === 24 && (nodeParts[1] ?? 0) >= 15)

console.log(`\n运行环境：node ${process.version}${process.versions.electron ? ` / electron ${process.versions.electron}` : ''}（platform ${process.platform}）`)
console.log(`运行时判定：${destructiveRuntime ? '递归删除会跟进 junction（危险，本机 DSH 就是这样）' : '递归删除不跟进 junction（安全运行时，破坏性断言按此调整）'}`)

const base = join(tmpdir(), `host-safety-${Date.now()}`)
mkdirSync(base, { recursive: true })
const copiesRoot = join(base, 'safe-root', 'pi-ai')

// ---------- 1. 事故复现：删插件包目录，被连坐的不该是 dsh 那份 ----------
console.log('\n1. 插件包被整棵递归删除（包管理器/市场/宿主的行为）')
{
  const dshPiAi = makePiAi(join(base, 'app-node_modules', '@earendil-works', 'pi-ai'))
  const copy = ensureSafeCopy(dshPiAi, '0.0.1-test', copiesRoot)
  check(copy !== undefined && intact(copy), '外部候选复制成安全区副本', String(copy))
  check(!isLink(copy), '副本是真目录，不是链')

  // 插件包：vendor/llm-bridge/node_modules/@earendil-works/pi-ai -> 副本（新设计）
  const pkg = join(base, 'plugin-package')
  const linkParent = join(pkg, 'vendor', 'llm-bridge', 'node_modules', '@earendil-works')
  mkdirSync(linkParent, { recursive: true })
  writeFileSync(join(pkg, 'package.json'), '{"name":"@dsh-one/dsh-llm-provider"}\n')
  symlinkSync(copy, join(linkParent, 'pi-ai'), 'junction')
  check(isLink(join(linkParent, 'pi-ai')), '插件包里挂着链（模拟真实布局）')

  // 别人怎么删，就怎么删：裸递归删除整棵插件包
  rmSync(pkg, { recursive: true, force: true })
  check(!existsSync(pkg), '插件包目录被删掉')
  check(intact(dshPiAi), '★ dsh 自带那份 pi-ai 完好（本次事故的核心不变量）')
  if (destructiveRuntime) {
    check(!intact(copy), '★ 被连坐的是安全区副本（可重建，不算事故）', intact(copy) ? '副本竟然完好' : '')
  } else {
    check(intact(copy), '安全运行时：连副本都没被连坐（对照）')
  }

  const again = ensureSafeCopy(dshPiAi, '0.0.1-test', copiesRoot)
  check(again !== undefined && intact(again), '副本从 dsh 那份重新复制回来（自愈）')
}

// ---------- 2. removeTree：只摘链，不跟进目标 ----------
console.log('\n2. removeTree（链感知的递归删除）')
{
  const target = makePiAi(join(base, 'remove-tree-target'))
  const container = join(base, 'remove-tree-container')
  const linkDir = join(container, 'node_modules', '@earendil-works')
  mkdirSync(linkDir, { recursive: true })
  writeFileSync(join(container, 'marker.txt'), 'x\n')
  symlinkSync(target, join(linkDir, 'pi-ai'), 'junction')
  removeTree(container)
  check(!existsSync(container), '容器目录被删干净')
  check(intact(target), '★ 容器里那条链的目标一个字节没动')
}

// ---------- 3. repairPiAiFromCopy：只补缺，不删东西 ----------
console.log('\n3. dsh 那份被清空后的自愈（只补缺、不删）')
{
  const copy = makePiAi(join(base, 'repair-copy'))
  const target = makePiAi(join(base, 'repair-target'))
  check(repairPiAiFromCopy(target, copy) === 0, '目标完好时不动手（0 个文件）')

  // 连坐删除留下的残状态：目录还在，package.json / dist 没了
  rmSync(join(target, 'package.json'), { force: true })
  rmSync(join(target, 'dist'), { recursive: true, force: true })
  writeFileSync(join(target, 'user-note.txt'), 'keep me\n')
  check(piAiEntryMissing(target), '残状态被认出来（入口解不开）')
  const repaired = repairPiAiFromCopy(target, copy)
  check(repaired > 0, `补回文件数 > 0（实际 ${repaired}）`)
  check(!piAiEntryMissing(target), '入口恢复可解析')
  check(existsSync(join(target, 'user-note.txt')), '★ 目标里原有文件没被删（只补缺）')
}

// ---------- 4. 复制遇到链要跳过 ----------
console.log('\n4. copyTreeNoLinks：链一律跳过')
{
  const src = join(base, 'copy-links-src')
  mkdirSync(src, { recursive: true })
  writeFileSync(join(src, 'real.txt'), 'x\n')
  symlinkSync(makePiAi(join(base, 'copy-links-elsewhere')), join(src, 'pi-ai'), 'junction')
  const copied = copyTreeNoLinks(src, join(base, 'copy-links-dst'))
  check(copied === 1 && !existsSync(join(base, 'copy-links-dst', 'pi-ai')),
    '★ 复制时不把 dsh 安装树里的东西抄进来', `copied=${copied}`)
}

// ---------- 5. piAiEntryMissing 的判定面 ----------
console.log('\n5. 入口判定')
{
  const withMain = makePiAi(join(base, 'entry-main'))
  check(!piAiEntryMissing(withMain), 'main 指向存在 → 不残缺')
  const exportsStr = join(base, 'entry-exports-str')
  mkdirSync(join(exportsStr, 'dist'), { recursive: true })
  writeFileSync(join(exportsStr, 'dist', 'index.js'), 'x\n')
  writeFileSync(join(exportsStr, 'package.json'), '{"exports":"./dist/index.js"}\n')
  check(!piAiEntryMissing(exportsStr), 'exports 字符串 → 不残缺')
  const exportsMap = join(base, 'entry-exports-map')
  mkdirSync(join(exportsMap, 'dist'), { recursive: true })
  writeFileSync(join(exportsMap, 'dist', 'index.js'), 'x\n')
  writeFileSync(join(exportsMap, 'package.json'), '{"exports":{".":{"import":"./dist/index.js"}}}\n')
  check(!piAiEntryMissing(exportsMap), 'exports 条件映射 → 不残缺')
  check(piAiEntryMissing(join(base, 'entry-missing')), '目录不存在 → 残缺')
  const brokenMain = join(base, 'entry-broken-main')
  mkdirSync(brokenMain, { recursive: true })
  writeFileSync(join(brokenMain, 'package.json'), '{"main":"./dist/index.js"}\n')
  check(piAiEntryMissing(brokenMain), 'main 指向的文件没了 → 残缺')
  const shim = join(base, 'entry-shim') // dsh 那份被修补后的样子：无 main/exports，根 index.js 转发
  mkdirSync(shim, { recursive: true })
  writeFileSync(join(shim, 'index.js'), 'export * from "./dist/index.js"\n')
  writeFileSync(join(shim, 'package.json'), '{"name":"@earendil-works/pi-ai","version":"0.85.1"}\n')
  check(!piAiEntryMissing(shim), '无 main/exports 但有根 index.js → 不残缺')
}

// ---------- 6. 已安装插件的不变量（没装就跳过） ----------
console.log('\n6. 已安装插件包里的链指向')
{
  const home = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
  // 安全区在构建产物里被 tree-shake 掉了（模块内部常量），测试自己算一遍
  const safe = join(home, 'llm-provider-bridge')
  const installed = join(home, 'profiles', 'web', 'node_modules', '@dsh-one', 'dsh-llm-provider')
  if (!existsSync(join(installed, 'vendor'))) {
    skipCheck('插件包 vendor/ 里的链只指向包内或安全区', '当前没装 @dsh-one/dsh-llm-provider')
  } else {
    const links = []
    const walk = (dir, depth) => {
      if (depth > 8) return
      let entries = []
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        const path = join(dir, entry.name)
        let stats
        try { stats = lstatSync(path) } catch { continue }
        if (stats.isSymbolicLink()) {
          let target = ''
          try { target = readlinkSync(path) } catch { target = '' }
          links.push({ path, target })
          continue
        }
        if (stats.isDirectory()) walk(path, depth + 1)
      }
    }
    walk(join(installed, 'vendor'), 0)
    const bad = links.filter(({ target }) => target !== '' && !inside(target, installed) && !inside(target, safe))
    check(bad.length === 0,
      `★ 包内 ${links.length} 条链全部指向包内或安全区`,
      bad.map(({ path, target }) => `${path} -> ${target}`).join(' | '))
    if (links.length > 0) console.log(`    （链清单：${links.map(({ target }) => target).join(' , ')}）`)
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败${skip > 0 ? ` / ${skip} 跳过` : ''}\n`)
process.exit(fail === 0 ? 0 : 1)
