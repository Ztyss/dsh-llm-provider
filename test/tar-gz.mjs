// tar.gz 内置解压器（src/tar-gz.ts → lib/tar-gz.js）的离线回归。
//
// 为什么有它：外部 tar 两条路都断了——Windows 自带 tar（MSYS GNU tar）被 Node execFile
// 直起时 "Cannot connect to C: resolve failed"（2026-09-22 实测）；dsh 的 electron
// 沙禁里又不能接子进程管道。改为内置解析后，这里用**手工构造的 tar 字节**做 fixture
// （按 ustar 规范独立实现打包侧，与解析侧互不为镜像），盯：
//   1. 普通文件：内容逐字节一致；
//   2. 嵌套路径自动建中间目录；
//   3. prefix 长名两段拼接；
//   4. 目录条目真实落盘；
//   5. 结尾零块后停止、不把零块当文件；
//   6. 路径穿越（../）抛错——安全红线；
//   7. symlink 等特殊类型跳过（不跟进链）。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { extractTarGz } from '../lib/tar-gz.js'

let failures = 0
function check(name, cond, extra) {
  console.log((cond ? '  ok ' : '  FAIL ') + name + (cond === true || extra === undefined ? '' : `  ← ${extra}`))
  if (!cond) failures += 1
}

/** ustar 打包侧（独立于解析器的最小实现）：name/mode/uid/gid/size/mtime/typeflag/magic/prefix。 */
function tarEntry(name, content, typeflag = '0', prefix = '') {
  const header = Buffer.alloc(512)
  header.write(name, 0)
  const octal = (n) => n.toString(8).padStart(11, '0') + '\0'
  header.write('0000644\0', 100) // mode
  header.write('0000000\0', 108) // uid
  header.write('0000000\0', 116) // gid
  header.write(octal(content.length), 124) // size
  header.write(octal(0), 136) // mtime
  header.write('0000000\0', 148) // chksum（解析侧不校验）
  header.write(typeflag, 156)
  header.write('ustar\0', 257) // magic
  header.write('00', 263) // version
  if (prefix !== '') header.write(prefix, 345)
  const padded = Buffer.alloc(Math.ceil(content.length / 512) * 512)
  content.copy(padded)
  return Buffer.concat([header, padded])
}

function makeTarGz(entries) {
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]))
}

const sandbox = mkdtempSync(join(tmpdir(), 'dsh-tar-'))

// ---- 1. 普通文件：内容逐字节一致 ----
const payload = Buffer.from('pi-ai tarball payload\n'.repeat(120)) // > 512B，跨块
const out1 = join(sandbox, 'a')
extractTarGz(makeTarGz([tarEntry('package/dist/index.js', payload)]), out1)
check('文件被写出', existsSync(join(out1, 'package', 'dist', 'index.js')))
check('内容逐字节一致（含跨 512 块）', readFileSync(join(out1, 'package', 'dist', 'index.js')).equals(payload))

// ---- 2. 嵌套路径自动建中间目录 ----
const out2 = join(sandbox, 'b')
const n = extractTarGz(makeTarGz([
  tarEntry('package/dist/providers/deepseek.js', Buffer.from('x')),
  tarEntry('package/dist/providers/openai.js', Buffer.from('y')),
]), out2)
check('深路径自动建目录', existsSync(join(out2, 'package', 'dist', 'providers', 'deepseek.js')))
check('返回写入文件数', n === 2, String(n))

// ---- 3. prefix 长名两段拼接 ----
const out3 = join(sandbox, 'c')
extractTarGz(makeTarGz([
  tarEntry('deepseek.js', Buffer.from('long-name'), '0', 'package/dist/providers'),
]), out3)
check('prefix + name 拼接出完整路径', existsSync(join(out3, 'package', 'dist', 'providers', 'deepseek.js')))

// ---- 4. 目录条目真实落盘 + 结尾零块不产生垃圾 ----
const out4 = join(sandbox, 'd')
extractTarGz(makeTarGz([
  tarEntry('package/', Buffer.alloc(0), '5'),
  tarEntry('package/dist/index.js', Buffer.from('z')),
]), out4)
check('目录条目被创建', existsSync(join(out4, 'package')) && statSync(join(out4, 'package')).isDirectory())
check('零块不产生空文件', readdirNames(out4).length === 1, readdirNames(out4).join(','))
function readdirNames(dir) {
  return readdirSync(dir)
}

// ---- 5. 路径穿越：抛错（安全红线）----
let threw = false
try {
  extractTarGz(makeTarGz([tarEntry('../evil.js', Buffer.from('bad'))]), join(sandbox, 'e'))
} catch {
  threw = true
}
check('路径穿越条目被拒绝', threw === true)
check('穿越没落盘', !existsSync(join(sandbox, 'evil.js')))

// ---- 6. symlink 类型跳过（不跟进链）----
const out6 = join(sandbox, 'f')
const linkEntry = tarEntry('package/dist/link.js', Buffer.from('C:\\windows\\system32'), '2')
const count = extractTarGz(makeTarGz([linkEntry]), out6)
check('symlink 条目不落盘', !existsSync(join(out6, 'package', 'dist', 'link.js')))
check('symlink 不计入文件数', count === 0)

// ---- 7. stripComponents：npm tarball 的 package/ 顶层要剥掉（对真实样本）----
const realTgz = [
  join(tmpdir(), 'pi-ai-0.87.0-1790071208023.tgz'),
  join(process.env.TEMP ?? '', 'pi-ai-0.87.0-1790071208023.tgz'),
].find((p) => existsSync(p))
if (realTgz === undefined) {
  console.log('  -- （本机无失败现场的 tarball，跳过真实样本用例）')
} else {
  const out7 = join(sandbox, 'real')
  const files = extractTarGz(readFileSync(realTgz), out7, 1)
  check('真实 pi-ai tarball 剥顶层后解出 package.json + dist', existsSync(join(out7, 'package.json')) && existsSync(join(out7, 'dist', 'index.js')), `files=${String(files)}`)
  check('剥顶层后没有残留 package/ 目录', !existsSync(join(out7, 'package')))
  // stripComponents=0（默认）保留 package/ 顶层——两侧对齐验证
  const out7b = join(sandbox, 'real-nostrip')
  extractTarGz(readFileSync(realTgz), out7b)
  check('不剥顶层时保留 package/（默认行为）', existsSync(join(out7b, 'package', 'package.json')))
}

rmSync(sandbox, { force: true, recursive: true })

console.log(failures === 0 ? '\ntar.gz 内置解压测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)
