// 保存清单后的详情索引剪除（用户 10-10 报：删除自定义模型并保存后，重开模型清单
// 页幽灵行仍在，重进 provider 卡片才消失）。
//
// 根因：detailsById 只在挂载时拉一次（effect 依赖 []），onSaved 的本地覆盖只合并不
// 删除——被删条目的 `路由id/模型id` 键留在索引里，重开编辑器被 detailsOfProvider
// （own-details 分支）重新加回行。修复：保存时就地剪掉该路由名下不在新清单里的
// declared 系键。
//
// 断言盯五件容易错的事：
//   1. 只剪 declared 系（source='declared' / undefined）——adapter（发现的）与
//      pi-ai（目录的）详情不能剪：重挂载重拉后它们还会回来，本地剪了反而与
//      重挂载态不一致；
//   2. 裸 id 兜底键只在指向被删详情**本体**时一并清（先到先得的裸键可能属于别家）；
//   3. 别家 provider 名下的键一概不动（前缀不匹配）；
//   4. 纯函数：不改入参（React setState 更新器里两次调用不能互相污染）；
//   5. 新清单为空数组 = 该路由 declared 系全剪（「全部删掉」场景）。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// client bundle 是浏览器件（第 1 行 window.__ModuleLoader__）：垫片捕获工厂再取导出
//（同 test/catalog-candidates.mjs 的既有范式）。
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
let captured
globalThis.window = { __ModuleLoader__: { load(config) { captured = config } } }
const reactStub = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'createElement') return (type, props, ...children) => ({ type, props, children })
    if (prop === 'useState') return (initial) => [initial, () => {}]
    if (prop === 'useRef') return () => ({ current: null })
    if (prop === 'useMemo') return (fn) => fn()
    if (prop === 'useCallback') return (fn) => fn
    return () => {}
  },
})
new Function('window', 'document', 'fetch', 'setInterval', source)(
  globalThis.window,
  {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, style: {} }),
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
    documentElement: { lang: 'zh' },
  },
  () => Promise.reject(new Error('本测试不发请求')),
  () => 0,
)
const { pruneDeclaredDetails, detailKeyOf } = captured.factory((name) => (name === 'react' ? reactStub : {}))

let failures = 0
function check(name, cond) {
  console.log((cond ? '  ok ' : '  FAIL ') + name)
  if (!cond) failures += 1
}

const ROUTE = 'zai-coding-cn-ykw'

function fixture() {
  const gone = { id: 'gone', provider: ROUTE, source: 'declared', contextWindow: 1000000 }
  const kept = { id: 'kept', provider: ROUTE, source: 'declared', contextWindow: 200000 }
  const discovered = { id: 'discovered', provider: ROUTE, source: 'adapter' }
  const orphan = { id: 'orphan', provider: ROUTE }
  const otherGone = { id: 'gone', provider: 'zai-coding-cn', source: 'pi-ai' }
  const map = {
    [detailKeyOf(ROUTE, 'gone')]: gone,
    [detailKeyOf(ROUTE, 'kept')]: kept,
    [detailKeyOf(ROUTE, 'discovered')]: discovered,
    [detailKeyOf(ROUTE, 'orphan')]: orphan,
    [detailKeyOf('zai-coding-cn', 'gone')]: otherGone,
    // 裸键：gone 指向本路由幽灵本体（要清）；kept 指向别家对象（要留）
    gone: gone,
    kept: otherGone,
  }
  return map
}

const keptIds = ['kept', 'discovered', 'zai-coding-cn/gone']

// 剪除后的基础形状
const pruned = pruneDeclaredDetails(fixture(), ROUTE, keptIds)
check('幽灵 declared 键被剪', pruned[detailKeyOf(ROUTE, 'gone')] === undefined)
check('指向幽灵本体的裸键一并清', pruned['gone'] === undefined)
check('新清单内的键保留', pruned[detailKeyOf(ROUTE, 'kept')] !== undefined)
check('adapter 系（发现的）不剪——重挂载后还会回来', pruned[detailKeyOf(ROUTE, 'discovered')] !== undefined)
check('别家 pi-ai 系不动（前缀不匹配）', pruned[detailKeyOf('zai-coding-cn', 'gone')] !== undefined)
check('source undefined 的路由名下孤儿键也剪（防御）', pruned[detailKeyOf(ROUTE, 'orphan')] === undefined)
check('指向别家对象的裸键保留', pruned['kept'] !== undefined)

// 纯函数：入参不被修改
const before = fixture()
const beforeGone = before[detailKeyOf(ROUTE, 'gone')]
pruneDeclaredDetails(before, ROUTE, keptIds)
check('不改入参（纯函数）', before[detailKeyOf(ROUTE, 'gone')] === beforeGone && Object.keys(before).length === 7)

// 全删场景：新清单为空 = 该路由 declared 系全剪，adapter 留
const wiped = pruneDeclaredDetails(fixture(), ROUTE, [])
check('空清单 → 该路由 declared 系全剪', wiped[detailKeyOf(ROUTE, 'kept')] === undefined && wiped[detailKeyOf(ROUTE, 'gone')] === undefined)
check('空清单 → adapter 系仍在', wiped[detailKeyOf(ROUTE, 'discovered')] !== undefined)
check('空清单 → 别家键不受牵连', wiped[detailKeyOf('zai-coding-cn', 'gone')] !== undefined)

// 边界：空 map / 无匹配前缀
check('空 map 不炸，返回空对象', Object.keys(pruneDeclaredDetails({}, ROUTE, ['x'])).length === 0)
check('路由名下无任何键时原样返回', pruneDeclaredDetails({ other: { id: 'o', provider: 'other' } }, ROUTE, ['x'])['other'] !== undefined)

// 兜底断言（钉住剪除后的完整键集合防回归）
check('剪除后键集合与预期完全一致',
  JSON.stringify(Object.keys(pruned).sort()) === JSON.stringify(['zai-coding-cn/gone', 'zai-coding-cn-ykw/discovered', 'zai-coding-cn-ykw/kept', 'kept'].sort()),
  Object.keys(pruned).sort())

console.log(failures === 0 ? '\ndeclared 详情剪除测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)
