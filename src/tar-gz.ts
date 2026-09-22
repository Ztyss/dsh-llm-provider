/**
 * 最小 tar.gz 解压（ustar）：gunzipSync + 512 字节头解析，纯内存、零子进程。
 *
 * 为什么自写而不用外部 tar：Windows 自带 tar（System32 的 MSYS GNU tar）在 Node
 * execFile 直起、非 MSYS 环境下路径解析层直接崩（2026-09-22 实测：解压 npm tarball
 * 报 "Cannot connect to C: resolve failed" → status 128）；而 dsh 的 electron 沙禁里
 * 又不能用管道接子进程输出。npm 的 tarball 结构足够简单——普通文件 + 目录两类，
 * 名字走 ustar 的 prefix/name 两段拼接——内置解析零子进程、跨平台、离线可测。
 *
 * 安全：每条条目 resolve 后必须仍在 dest 内（防路径穿越）；链与特殊类型一律跳过
 * （npm 官方 tarball 不含链；真遇到也按「不跟进」处理）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'

/** 读 tar 头的 NUL 结尾字符串字段。 */
function tarString(header: Buffer, start: number, length: number): string {
  const zero = header.indexOf(0, start)
  const end = zero === -1 || zero > start + length ? start + length : zero
  return header.subarray(start, end).toString('utf8')
}

/**
 * 把一个 `.tar.gz` 字节数组解压到目标目录。
 * @param bytes - tar.gz 文件内容（内存版，不落临时文件）。
 * @param dest - 目标目录（按需创建）。
 * @param stripComponents - 剥掉每条路径的前 N 段（对应 tar 的 `--strip-components`；
 *   npm 的 tarball 所有条目都带 `package/` 顶层，装包要传 1）。
 * @returns 写盘的文件数。
 */
export function extractTarGz(bytes: Buffer, dest: string, stripComponents = 0): number {
  const tar = gunzipSync(bytes)
  const destRoot = resolve(dest)
  let offset = 0
  let files = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break // 全零块 = 归档结束
    const name = tarString(header, 0, 100)
    const size = Number.parseInt(tarString(header, 124, 12).trim() || '0', 8) || 0
    const typeflag = String.fromCharCode(header[156] ?? 0)
    const prefix = tarString(header, 345, 155)
    const full = prefix === '' ? name : `${prefix}/${name}`
    offset += 512
    // stripComponents：剥掉前 N 段路径（npm tarball 的 package/ 顶层）；剥完为空的跳过
    const stripped = stripComponents > 0 ? full.split('/').slice(stripComponents).join('/') : full
    if (stripped !== '') {
      const destPath = resolve(destRoot, stripped)
      if (!destPath.startsWith(destRoot + sep)) throw new Error(`tarball 条目越出目标目录：${full}`)
      if (typeflag === '0' || typeflag === '\0' || typeflag === '') {
        mkdirSync(dirname(destPath), { recursive: true })
        writeFileSync(destPath, tar.subarray(offset, offset + size))
        files += 1
      } else if (typeflag === '5') {
        // 目录条目：建出来（npm 的 tarball 有时不带目录条目，靠文件路径的 mkdir 兜底）
        mkdirSync(destPath, { recursive: true })
      }
    }
    // '2'（symlink）/ '1'（硬链）/ 'g'/'x'（pax 扩展）等：跳过内容，按头长度前进
    offset += Math.ceil(size / 512) * 512
  }
  return files
}
