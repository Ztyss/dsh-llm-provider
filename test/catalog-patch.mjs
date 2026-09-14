// 目录补丁测试：验证 applyCatalogPatches 正确应用且幂等。
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyCatalogPatches, CATALOG_PATCHES } from '../lib/bridge.js'

let failures = 0
function check(name, cond) {
  console.log((cond ? '  ok ' : 'FAIL ') + name)
  if (!cond) failures += 1
}

// 造一个假的 pi-ai 目录结构
const root = mkdtempSync(join(tmpdir(), 'pi-ai-patch-'))
const dataDir = join(root, 'dist', 'providers', 'data')
mkdirSync(dataDir, { recursive: true })
writeFileSync(join(dataDir, 'kimi-coding.json'), JSON.stringify({
  'anthropic-messages': {
    'kimi-for-coding': { id: 'kimi-for-coding', name: 'Kimi K2.7 Code', contextWindow: 262144 },
    'k3': { id: 'k3', name: 'Kimi K3', contextWindow: 1048576 },
  },
}))

// 第一次应用：应该改动
const first = applyCatalogPatches(root)
check('返回了补丁条目', first.length === CATALOG_PATCHES.length)
check('标记为已改动', first[0].changed === true)

const after = JSON.parse(readFileSync(join(dataDir, 'kimi-coding.json'), 'utf8'))
check('name 已更新', after['anthropic-messages']['kimi-for-coding'].name === 'Kimi K2.8 Preview')
check('contextWindow 已更新', after['anthropic-messages']['kimi-for-coding'].contextWindow === 1048576)
check('其它模型不受影响', after['anthropic-messages'].k3.name === 'Kimi K3')

// 第二次应用：幂等，不再改动
const second = applyCatalogPatches(root)
check('第二次应用 changed=false', second[0].changed === false)

// 数据文件缺失时不炸
const emptyRoot = mkdtempSync(join(tmpdir(), 'pi-ai-empty-'))
check('缺文件时安全跳过', applyCatalogPatches(emptyRoot).length === 0)

console.log(failures === 0 ? '\n目录补丁测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)
