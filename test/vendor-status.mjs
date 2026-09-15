// vendor/status.json 的合并语义。
//
// 盯一件事：传 undefined 必须**删掉那个键**。JSON.stringify 会丢掉 undefined，光靠
// `{...old, ...patch}` 覆盖不掉旧值——"上次下载的版本体检没过"这条记录会一直粘着，
// 后来那次通过了界面上还挂着警告。
import { mergeStatus } from '../lib/bridge.js'

let failures = 0
function check(name, cond) {
  console.log((cond ? '  ok ' : '  FAIL ') + name)
  if (!cond) failures += 1
}

const before = { piAiVersion: '0.85.1', needsRestart: false, latestRejected: { version: '0.86.0', error: '导出改名了' } }

const cleared = mergeStatus(before, { latestVersion: '0.86.0', latestRejected: undefined })
check('传 undefined 删掉了那个键', !('latestRejected' in cleared))
check('同批其它字段照常写入', cleared.latestVersion === '0.86.0')
check('没提到的字段保持原值', cleared.piAiVersion === '0.85.1' && cleared.needsRestart === false)

const kept = mergeStatus(before, { latestVersion: '0.86.0' })
check('没传该键时原值保留', kept.latestRejected !== undefined)

const overwritten = mergeStatus(before, { latestRejected: { version: '0.87.0', error: '别的错' } })
check('传了新值就覆盖', overwritten.latestRejected.version === '0.87.0')

check('不改原对象', !('latestVersion' in before))
check('空补丁等于原样', JSON.stringify(mergeStatus(before, {})) === JSON.stringify(before))

console.log(failures === 0 ? '\n状态合并测试全部通过' : `\n${failures} 个失败`)
process.exit(failures === 0 ? 0 : 1)
