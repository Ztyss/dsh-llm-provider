/**
 * 凭据体检的单元测试。
 *
 *   node test/credential-check.mjs
 */
import { findSharedCredentials } from '../lib/credential-check.js'

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) {
    console.log('  期望:', JSON.stringify(expected))
    console.log('  实际:', JSON.stringify(actual))
    process.exitCode = 1
  }
}

// 真实场景：kimi 那条被填成了 deepseek 的 key
const shared = findSharedCredentials([
  { provider: 'kimi-coding', ref: 'KIMI_CODING_API_KEY', value: 'sk-same' },
  { provider: 'zai-coding-cn', ref: 'ZAI_CODING_CN_API_KEY', value: 'db6a.other' },
  { provider: 'deepseek-official', ref: 'DEEPSEEK_API_KEY', value: 'sk-same' },
])
check('两个 provider 共用一把 key → 各报一条', shared.map((w) => w.provider), ['kimi-coding', 'deepseek-official'])
check('消息里点名了另一个 provider', shared[0].others, ['deepseek-official'])
check('消息带凭据名', shared[0].message.includes('KIMI_CODING_API_KEY'), true)
check('消息不含 key 值', shared.some((w) => w.message.includes('sk-same')), false)

check('全部不同 → 无告警', findSharedCredentials([
  { provider: 'a', ref: 'A_API_KEY', value: 'sk-1' },
  { provider: 'b', ref: 'B_API_KEY', value: 'sk-2' },
]), [])

check('未配置（空值）不参与比对', findSharedCredentials([
  { provider: 'a', ref: 'A_API_KEY', value: '' },
  { provider: 'b', ref: 'B_API_KEY', value: '' },
]), [])

check('三个共用一把 → 每个报两条 others', findSharedCredentials([
  { provider: 'a', ref: 'A_API_KEY', value: 'sk-x' },
  { provider: 'b', ref: 'B_API_KEY', value: 'sk-x' },
  { provider: 'c', ref: 'C_API_KEY', value: 'sk-x' },
]).map((w) => w.others.length), [2, 2, 2])

console.log(process.exitCode === 1 ? '\n有失败用例' : '\n凭据体检测试全部通过')
