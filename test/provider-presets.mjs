// 供应商候选清单的顺序与标记。
//
// 顺序以前是一张 38 行的人工优先级表（CURATED）压着的——那是把"从手工列表改成从 pi-ai
// 动态生成"时丢掉的顺序钉回来的补丁。现在按名字排、自定义入口固定最后，这个测试盯住它。
import { presetsWithMeta } from '../lib/provider-presets.js'

let failures = 0
function check(name, cond) {
  console.log((cond ? '  ok ' : '  FAIL ') + name)
  if (!cond) failures += 1
}

const presets = presetsWithMeta(new Set())

// 清单主体来自 pi-ai 的目录数据，没装 pi-ai 的机器上会只剩自定义那一项——
// 断言写成对长度不敏感，两种环境都跑得过。
check('至少有自定义网关这一项', presets.length > 0)

const last = presets[presets.length - 1]
check('自定义网关固定排最后', last !== undefined && last.id === 'custom-gateway')
check('自定义网关只出现一次', presets.filter((p) => p.custom === true).length === 1)

const named = presets.slice(0, -1)
let ascending = true
for (let i = 1; i < named.length; i += 1) {
  if (named[i - 1].label.localeCompare(named[i].label, 'en') > 0) ascending = false
}
check('其余按名字升序', ascending)

check('每项都有名字', presets.every((p) => typeof p.label === 'string' && p.label !== ''))
check('每项 id 都是 kebab-case', presets.every((p) => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(p.id)))

// billing 标记 = 这一家有没有余额查询适配器（没有也能添加，只是卡片不显示余量）
check('自定义网关没有余额适配器', last.billing === false)
if (presets.some((p) => p.id === 'kimi-coding')) {
  check('kimi-coding 有余额适配器', presets.find((p) => p.id === 'kimi-coding').billing === true)
}

// 已配置标记：走 providerRoutes 的 id；原生路由按 NATIVE_EQUIVALENTS 折算
const configured = presetsWithMeta(new Set(['deepseek-official']))
if (configured.some((p) => p.id === 'deepseek')) {
  check('原生 deepseek-official 已配置 → 目录里的 deepseek 也标已配置',
    configured.find((p) => p.id === 'deepseek').configured === true)
}
check('没配过的时候不标已配置', presets.every((p) => p.configured === false))

console.log(failures === 0 ? '\n供应商清单测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)
