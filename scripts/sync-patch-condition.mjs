// 把 lib/patch-condition.js 生成的条件表达式同步进 cordis.patch.yml。
//
// 为什么要自动同步：表达式有两个「真相源」——源码（可读、可测）与 patch 文件
// （loader 真正读的那份）。手抄会漂移，而漂移的后果正是 P0：patch 里写着旧表达式、
// 语义已经变了却没人发现。
//
// 用法：
//   node scripts/sync-patch-condition.mjs          # 写入
//   node scripts/sync-patch-condition.mjs --check  # 只校验（npm test 用，不写盘）
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const patchPath = join(root, 'cordis.patch.yml')
const checkOnly = process.argv.includes('--check')

const { piAiGuardExpression } = await import(pathToFileURL(join(root, 'lib', 'patch-condition.js')).href)
const expression = piAiGuardExpression()

// 四个官方条目改用同一条件（同一个判据，语义一致）。
const IDS = ['llm-pi-ai', 'llm-deepseek', 'ui-model-selection', 'ui-settings-models']

const source = readFileSync(patchPath, 'utf8')
let text = source
const drift = []

for (const id of IDS) {
  // 匹配 `- id: <id>` 到下一个顶层条目之间的那段，把它的 disabled 换成表达式。
  const blockRe = new RegExp(`(- id:\\s*${id}\\s*\\r?\\n)(?:\\s*disabled:[^\\n]*\\r?\\n)?`)
  const match = blockRe.exec(text)
  if (match === null) {
    drift.push(`patch 里找不到条目 ${id}`)
    continue
  }
  const rendered = `${match[1]}  disabled: !!js ${expression}\n`
  text = text.slice(0, match.index) + rendered + text.slice(match.index + match[0].length)
}

if (drift.length > 0) {
  console.error(`失败：\n  ${drift.join('\n  ')}`)
  process.exit(1)
}

if (checkOnly) {
  const same = text === source
  if (same) {
    console.log('  ok cordis.patch.yml 的条件表达式与源码一致')
    process.exit(0)
  }
  console.error('FAIL cordis.patch.yml 的条件表达式与 lib/patch-condition.js 不一致（跑 node scripts/sync-patch-condition.mjs 同步）')
  process.exit(1)
}

if (text === source) {
  console.log('cordis.patch.yml 已是最新，未改动')
  process.exit(0)
}
writeFileSync(patchPath, text)
console.log(`已同步 ${IDS.length} 条条件禁用到 cordis.patch.yml`)
