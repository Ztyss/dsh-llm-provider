/**
 * 设置页 Provider 标签：CC Switch 式卡片 + 「添加供应商」面板 + 「pi-ai 桥接」二级标签。
 * 桥接明细行是纯函数（piAiBridgeRows），组件照着渲染——离线可测。
 */
import react from 'react'
import type { AnyRecord } from '../types.js'
import {
  STATUS_UNAVAILABLE,
  apiCall,
  detailKeyOf,
  dropPlanAccount,
  findById,
  getJson,
  loadModelCatalog,
  loadModelDetailMap,
  loadPlanStatus,
  loadProviderStatus,
  mergePlanAccount,
  onPlanChange,
  postJson,
  withKey,
  withKeys,
} from './data.js'
import { dotClass, formatContext, fuzzyMatch, headlineChips, linkTextOf, relativeTime, resetCountdownText, shortName, toneColor, worstPercent } from './format.js'
import { caretSvg } from './icons.js'
import { t } from './i18n.js'
import type { AddProviderPanelProps, BridgeRow, CatalogModel, FieldEvent, HeadlineChip, ModelDetail, PlanAccount, ProviderPreset } from './types.js'

/** 当前用的是哪一档 pi-ai。宿主报的 source：版本号 / 'dependency' / 'dsh'。 */
function piAiSourceLabel(source: unknown): string {
  if (source === 'dependency') return '兜底依赖'
  if (source === 'dsh') return 'dsh 自带'
  return '已下载'
}

function piAiSourceHint(source: unknown): string {
  if (source === 'dependency') return '插件 vendor/ 下手动安装的兜底版本（可选档；没装就会落到 dsh 自带那份）'
  if (source === 'dsh') return 'dsh 自己装的那份 pi-ai，版本随 dsh 发布走（不一定比上游旧）'
  return '按需下载并验证过的版本，放在 vendor/pi-ai/<版本>/；换版本需重启 dsh'
}

/**
 * 「pi-ai 桥接」标签页的明细行。纯函数，只返回数据，组件照着渲染——这样能离线测，
 * 也免得一堆拼字符串的逻辑埋在组件里。
 * @param bridge - /provider/status 的 bridge 段（当前加载的那份）。
 * @param update - 同上的 update 段（上游最新 / 待生效 / 体检没过的）。
 * @returns `[{ key, text, value?, title?, warn? }]`；value 是右侧的次要文字。
 */
export function piAiBridgeRows(bridge: unknown, update: unknown): BridgeRow[] {
  var rows: BridgeRow[] = []
  if (bridge === undefined || bridge === null) return rows
  var bridgeRecord = bridge as AnyRecord
  if (bridgeRecord.active !== true) {
    rows.push({ key: 'err', text: String(bridgeRecord.error), bad: true })
    return rows
  }
  rows.push({
    key: 'pi',
    text: '当前 pi-ai 版本',
    value: String(bridgeRecord.piAiVersion) + '（' + piAiSourceLabel(bridgeRecord.source) + '）',
    title: piAiSourceHint(bridgeRecord.source),
  })
  // 体检没执行（bundle 的 import 需求解析不出）：这份 pi-ai 是靠「目录存在」放行的，没验证过
  if (bridgeRecord.probeUnverified === true) {
    rows.push({
      key: 'unverified',
      text: '当前这份 pi-ai 没做过兼容性体检',
      value: '看原因',
      title: '解析不出桥接副本的 import 需求（上游改了打包格式），按目录存在放行。建议关注 pi-ai 发版说明',
      warn: true,
    })
  }
  // 体检没过的候选：为什么没用上更新的那版
  var rejected = Array.isArray(bridgeRecord.rejected) ? bridgeRecord.rejected : []
  for (var i = 0; i < rejected.length; i += 1) {
    var skipped = rejected[i] as AnyRecord
    rows.push({
      key: 'skip-' + i,
      text: '跳过 ' + String(skipped.version) + '：兼容性检查没通过',
      value: '看原因',
      title: String(skipped.error),
      warn: true,
    })
  }
  // 最近一次检查更新的结论
  if (update !== undefined && update !== null) {
    var updateRecord = update as AnyRecord
    if (updateRecord.pending !== undefined) {
      rows.push({ key: 'pending', text: '已下载 ' + String(updateRecord.pending) + '，验证通过（完整性 + 兼容性），重启 dsh 后生效', warn: true })
    }
    if (updateRecord.rejected !== undefined && updateRecord.rejected !== null) {
      var rejectedLatest = updateRecord.rejected as AnyRecord
      rows.push({
        key: 'rejected',
        text: String(rejectedLatest.version) + ' 验证没通过，已跳过（不会切过去）',
        value: '看原因',
        title: String(rejectedLatest.error),
        warn: true,
      })
    }
  }
  return rows
}

/** 上游那一行的文字（右侧按钮由组件补）。 */
export function piAiUpstreamText(update: unknown): string {
  if (update === undefined || update === null) return '上游 未检查'
  var updateRecord = update as AnyRecord
  if (updateRecord.latest === undefined) return '上游 未检查'
  var when = updateRecord.lastCheck === undefined ? '' : '（检查于 ' + relativeTime(updateRecord.lastCheck) + '）'
  return '上游 ' + String(updateRecord.latest) + when
}

/** 单个摘要 chip：「5h余量:90% 34min后重置」；余额类无标签只显示金额；sep 为组间分割线。 */
function headlineChip(chip: HeadlineChip, key: number) {
  if (chip.sep === true) {
    return react.createElement('span', { key: 'sep' + String(key), className: 'pv_chipSep' })
  }
  if (chip.label === undefined || chip.label === null) {
    // 余额类（API 按量）：无窗口标签，直接显示金额
    return react.createElement(
      'span',
      { key: String(key), className: 'pv_chipItem' },
      react.createElement('span', { key: 't', style: { color: toneColor(chip.percent) } }, chip.text),
    )
  }
  var parts = [
    react.createElement('span', { key: 'l', className: 'pv_chipLabel' }, chip.label + ':'),
    react.createElement('span', { key: 't', style: { color: toneColor(chip.percent) } }, chip.text),
  ]
  if (chip.reset !== undefined && chip.reset !== '') {
    parts.push(react.createElement('span', { key: 'r', className: 'pv_chipReset' }, ' ◷ ' + resetCountdownText(chip.reset)))
  }
  return react.createElement('span', { key: String(key), className: 'pv_chipItem' }, parts)
}

/** 能力徽章文案 → 样式类（模型行与详情卡共用一套）。 */
var CAP_CLASS: Record<string, string> = { '视觉': 'pv_capVision', '推理': 'pv_capReason', '视频': 'pv_capVideo' }

/**
 * 一条详情里**已知为真**的能力（顺序：视觉、推理、视频），离线可测的纯函数。
 *
 * 只认 `true`：`false` 是「明确不支持」，`undefined` 是「没查过」（自定义模型 id 在 pi-ai
 * 目录里查不到、route 也没声明模态时就是这样）。两者都不出徽章，但它们是两回事——
 * 详情卡里必须分开写，否则等于把「没查过」渲染成「没有视觉」。
 */
export function capabilityBadges(detail: ModelDetail | undefined): string[] {
  var badges: string[] = []
  if (detail === undefined || detail === null) return badges
  if (detail.vision === true) badges.push('视觉')
  if (detail.reasoning === true) badges.push('推理')
  if (detail.video === true) badges.push('视频')
  return badges
}

/** 能力字段有没有出处：三样全是 undefined 就是「未知」，界面得说明白。 */
export function capabilitiesKnown(detail: ModelDetail | undefined): boolean {
  if (detail === undefined || detail === null) return false
  return detail.vision !== undefined || detail.video !== undefined || detail.reasoning !== undefined
}

/** 详情索引里取一条：键是 provider + id（见 data.ts 的 detailKeyOf，跨 provider 重名靠它分开）。 */
function detailOf(detailsById: Record<string, ModelDetail> | undefined | null, provider: string, modelId: string) {
  if (detailsById === undefined || detailsById === null) return undefined
  return detailsById[detailKeyOf(provider, modelId)]
}

/** 模型行：名称 + 能力徽章（视觉/推理/视频）+ 上下文标签，悬浮出 Cherry 式详情卡。 */
export function modelRow(model: CatalogModel, account: PlanAccount, detailsById: Record<string, ModelDetail> | undefined | null) {
  var detail = detailOf(detailsById, account.id, model.id)
  var cw = detail !== undefined && detail.contextWindow !== undefined ? detail.contextWindow : model.contextWindow
  var ctx = formatContext(cw)
  var caps = capabilityBadges(detail).map(function (label) {
    return react.createElement('span', { key: label, className: 'pv_capMini ' + CAP_CLASS[label] }, label)
  })
  return react.createElement(
    'div',
    { className: 'pv_mRow', key: 'm-' + model.id },
    react.createElement('span', { className: 'pv_mId', title: model.id }, model.id),
    react.createElement('span', { className: 'pv_mName', title: model.name }, model.name),
    react.createElement('span', { className: 'pv_mCaps' }, caps),
    react.createElement('span', { className: 'pv_mCtx' }, ctx === undefined ? '' : ctx),
    modelTip(model, account, detail),
  )
}

/** Cherry 式模型详情卡：服务商 / 模型 ID / 能力标记 / 上下文 / 最大输出 / 思维链。 */
export function modelTip(model: CatalogModel, account: PlanAccount, detail: ModelDetail | undefined) {
  var rows = [react.createElement('div', { className: 'pv_tipTitle', key: 't' }, model.name)]
  rows.push(tipLine('服务商', shortName(account), 'p'))
  rows.push(tipLine('模型 ID', model.id, 'id'))
  var badges = capabilityBadges(detail)
  if (badges.length > 0) {
    rows.push(react.createElement('div', { className: 'pv_tipCaps', key: 'c' }, badges.map(function (label) {
      return tipCap(label, CAP_CLASS[label])
    })))
  }
  // 能力没出处就明说：写「关闭」等于替用户断言它不支持，比留白更误导
  if (!capabilitiesKnown(detail)) {
    rows.push(react.createElement('div', { className: 'pv_tipDim', key: 'caps-unknown' }, '能力未知'))
  }
  if (detail !== undefined) {
    // 窗口兜底到目录里的值——和模型行的算法一致：有出处的那份优先
    var cw = detail.contextWindow !== undefined ? detail.contextWindow : model.contextWindow
    if (cw !== undefined) rows.push(tipLine('上下文窗口', cw.toLocaleString('en-US'), 'cw'))
    if (detail.maxTokens !== undefined) rows.push(tipLine('最大输出', detail.maxTokens.toLocaleString('en-US'), 'mt'))
    rows.push(tipLine('思维链', detail.reasoning === undefined
      ? '未知'
      : (detail.reasoning === true
        ? (Array.isArray(detail.thinkingLevels) && detail.thinkingLevels.length > 0 ? detail.thinkingLevels.join('、') : '自动')
        : '关闭'), 'tk'))
  } else {
    rows.push(react.createElement('div', { className: 'pv_tipDim', key: 'dim' }, '该模型没有本地元数据'))
  }
  return react.createElement('div', { className: 'pv_tip' }, rows)
}

function tipLine(label: unknown, value: unknown, key: unknown) {
  return react.createElement(
    'div',
    { className: 'pv_tipRow', key: String(key) },
    react.createElement('span', { className: 'pv_tipLabel' }, label),
    react.createElement('span', null, String(value)),
  )
}

function tipCap(text: unknown, cls: string) {
  return react.createElement('span', { className: 'pv_cap ' + cls }, text)
}

/**
 * 「添加供应商」下拉里一项的状态：已配置**且密钥在**才禁选。
 * 路由配好了但还没密钥（插件自带 config 就声明了 deepseek 这种）仍可选中——选中它就是走一遍
 * 表单把密钥存进去，否则用户既加不了新的、也补不了那一条缺的 key。
 */
export function presetPickState(preset: ProviderPreset): { disabled: boolean; tag: string | null } {
  if (preset.configured !== true) return { disabled: false, tag: null }
  if (preset.missingKey === true) return { disabled: false, tag: '缺密钥' }
  return { disabled: true, tag: '已配置' }
}

/**
 * 保存供应商要发的 `settings/mutate` ops：**逐字段写**，不是整段覆盖。
 *
 * 原来这条发的是 `{op:'set', path:['providers', id], value:{api,baseURL,apiKeyEnv}}`，
 * 而宿主的 applyPathOp 对「路径正好到对象本身」的 set 是 `{...section, [id]: op.value}` ——
 * 也就是**整段替换**：对一个已有 route 点一次「确认添加」，手写的 models（逐模型
 * contextWindow / maxTokens / input / reasoningEfforts）、compat.thinkingFormat、retryPolicy
 * 会一起消失（issue #1 顺带报的写入路径坑，代价是静默的数据丢失）。
 *
 * 逐字段 set（路径带字段名）在 applyPathOp 里是 `{...child, [field]: value}`：只覆盖我们
 * 负责的那三个字段，其余原样保留。新建 route 时逐字段写同样成立（中间对象按需创建），
 * 所以不用分「新建 / 已存在」两条路径。
 *
 * 空值不发 op：没选协议（api 为空）时不该把已有的 api 抹成空串。
 * @param routeId - 目标 route id。
 * @param form - 表单里的三个字段。
 */
export function providerSaveOps(routeId: string, form: { api?: string; baseURL?: string; apiKeyEnv?: string }): unknown[] {
  var ops: unknown[] = []
  var fields: { field: string; value: string }[] = [
    { field: 'api', value: String(form.api ?? '') },
    { field: 'baseURL', value: String(form.baseURL ?? '').trim() },
    { field: 'apiKeyEnv', value: String(form.apiKeyEnv ?? '').trim() },
  ]
  for (var i = 0; i < fields.length; i += 1) {
    if (fields[i].value === '') continue
    ops.push({ op: 'set', path: ['providers', routeId, fields[i].field], value: fields[i].value })
  }
  return ops
}

/**
 * 这条 route 是不是已经配过了（决定「添加」还是「更新」的措辞与提示）。
 *
 * 依据是预设清单上的 configured 标记（宿主 `/provider/presets` 给的，与卡片上的
 * 「已配置 / 缺密钥」同源）——界面里不该另算一套「已存在」的判断。
 * @param presets - `/provider/presets` 的清单。
 * @param routeId - 要查的 route id。
 */
export function isRouteConfigured(presets: unknown, routeId: string): boolean {
  if (!Array.isArray(presets)) return false
  for (var i = 0; i < presets.length; i += 1) {
    var preset = presets[i] as AnyRecord
    if (preset !== null && typeof preset === 'object' && preset['id'] === routeId && preset['configured'] === true) return true
  }
  return false
}

/**
 * 删除前把一条 route 的配置导出成 YAML 文本（issue #3 的期望 4：删除要能留下原文）。
 *
 * 删除一次做两件事——清路由、清凭据——且都不可撤销；手写的 `models` / `compat` /
 * `retryPolicy` 会一起消失。给一份能直接贴回 `settings.yaml` 的原文是最低成本的补救。
 *
 * 密钥值**不导出**：浏览器端只拿得到掩码（宿主不下发真值），所以导出的是凭据名，
 * 让用户知道删除后该重填哪一条。
 * @param account - 卡片上的那条账户（含路由元信息）。
 */
export function routeYamlOf(account: PlanAccount): string {
  var lines = ['# dsh-llm-provider 删除前导出的 route 配置（贴回 settings.yaml 的 llm-pi-ai.providers 下）', account.id + ':']
  if (typeof account.displayName === 'string' && account.displayName !== '') lines.push('  displayName: ' + account.displayName)
  if (typeof account.api === 'string' && account.api !== '') lines.push('  api: ' + account.api)
  if (typeof account.baseUrl === 'string' && account.baseUrl !== '') lines.push('  baseURL: ' + account.baseUrl)
  if (typeof account.apiKeyEnv === 'string' && account.apiKeyEnv !== '') {
    lines.push('  apiKeyEnv: ' + account.apiKeyEnv)
    lines.push('  # 凭据值不导出（浏览器端只拿得到掩码）——删除后请重新填回这个凭据名')
  }
  return lines.join('\n') + '\n'
}

/**
 * 「刷新余量 / 保存密钥」之后的结果判定：成功返回 undefined，失败给出原因。
 *
 * 宿主这两条路由一律回 200，成败看 body 的 ok；凭据没值时 ok=false，原因挂在 account.error
 * 上（"DEEPSEEK_API_KEY 没有值"）。只判 account 在不在会在没配 key 时弹一句"✓ 余量已刷新"，
 * 跟卡片上那句"未配置 key"直接打架。
 */
export function refreshFailure(result: unknown): string | undefined {
  var record = result === null || result === undefined ? {} : (result as AnyRecord)
  if (record.ok === true) return undefined
  var account = record.account
  if (account !== null && typeof account === 'object') {
    var reason = (account as AnyRecord).error
    if (reason !== undefined && reason !== null && String(reason) !== '') return String(reason)
  }
  if (record.error !== undefined && record.error !== null) return String(record.error)
  return '未知错误'
}

/**
 * 添加 provider：选预设 → 填密钥/端点 → 测试 → 通过才能添加。
 * 测试走官方 llm/discoverModels 草稿探测（不落盘）；写入走官方同一套控制器
 * （settings/mutate 写 llm-pi-ai.providers 段 + credentials/set 存密钥），
 * 与官方 Models 页的存储完全同源。
 */
function AddProviderPanel(props: AddProviderPanelProps) {
  var presets: ProviderPreset[] = Array.isArray(props.presets) ? props.presets : []
  var openState = react.useState(false)
  var open = openState[0]
  var setOpen = openState[1]
  var formState = react.useState({ routeId: '', key: '', baseURL: '', api: '', apiKeyEnv: '', websiteUrl: undefined })
  var form = formState[0]
  var setForm = formState[1]
  var testState = react.useState({ phase: 'idle', message: '' })
  var test = testState[0]
  var setTest = testState[1]
  var busyState = react.useState(false)
  var busy = busyState[0]
  var setBusy = busyState[1]
  var noteState = react.useState(null)
  var note = noteState[0]
  var setNote = noteState[1]
  var pickRef = react.useRef(null)
  var pickOpenState = react.useState(false)
  var pickOpen = pickOpenState[0]
  var setPickOpen = pickOpenState[1]
  var pickFilterState = react.useState('')
  var pickFilter = pickFilterState[0]
  var setPickFilter = pickFilterState[1]

  // 供应商下拉：点外部关闭
  react.useEffect(
    function () {
      if (pickOpen !== true) return undefined
      function onPointerDown(event: PointerEvent) {
        if (pickRef.current !== null && pickRef.current.contains(event.target) === false) {
          setPickOpen(false)
        }
      }
      document.addEventListener('pointerdown', onPointerDown)
      return function () {
        document.removeEventListener('pointerdown', onPointerDown)
      }
    },
    [pickOpen],
  )

  function patchForm(patch: AnyRecord) {
    setForm(function (prev: AnyRecord) {
      return withKeys(prev, patch)
    })
  }
  function pickPreset(id: string) {
    var preset = findById(presets, id)
    if (preset === undefined) return
    patchForm({
      routeId: preset.id,
      baseURL: preset.baseURL,
      api: preset.api,
      apiKeyEnv: preset.apiKeyEnv,
      websiteUrl: preset.websiteUrl,
      key: '',
    })
    setTest({ phase: 'idle', message: '' })
    setNote(null)
  }
  function runTest() {
    if (form.routeId.trim() === '' || form.baseURL.trim() === '' || form.key.trim() === '') {
      setTest({ phase: 'fail', message: '路由 ID / API 地址 / API 密钥都要填' })
      return
    }
    setTest({ phase: 'run', message: '正在用这把密钥实连供应商探测模型…' })
    apiCall('llm/discoverModels', {
      settingsNs: 'llm-pi-ai',
      request: {
        provider: form.routeId.trim(),
        baseURL: form.baseURL.trim(),
        api: form.api,
        apiKey: form.key.trim(),
      },
    })
      .then(function (value) {
        var models = Array.isArray(value) ? value : (value !== null && typeof value === 'object' && Array.isArray(value.models) ? value.models : [])
        var names = []
        for (var i = 0; i < models.length && i < 3; i += 1) {
          var m = models[i]
          names.push(typeof m === 'string' ? m : String((m && (m.name || m.id)) || '?'))
        }
        setTest({
          phase: 'ok',
          message: '✓ 连通，发现 ' + String(models.length) + ' 个模型'
            + (names.length > 0 ? '：' + names.join('、') + (models.length > 3 ? ' …' : '') : ''),
        })
      })
      .catch(function (cause) {
        setTest({ phase: 'fail', message: '✗ ' + String(cause && cause.message ? cause.message : cause) })
      })
  }
  /**
   * 保存供应商：**逐字段写**，不是整段覆盖。
   *
   * 原来这条发的是 `{op:'set', path:['providers', id], value:{api,baseURL,apiKeyEnv}}`，
   * 而宿主的 applyPathOp 对「路径到对象本身」的 set 是 `{...section, [id]: op.value}` ——
   * 也就是**整段替换**：对一个已有 route 点一次「确认添加」，手写的 models（逐模型
   * contextWindow/maxTokens/input/reasoningEfforts）、compat.thinkingFormat、retryPolicy
   * 会一起消失（issue #1 顺带报的写入路径坑，代价是静默的数据丢失）。
   *
   * 逐字段 set（路径带字段名）在 applyPathOp 里是 `{...child, [field]: value}`：只覆盖我们
   * 负责的那三个字段，其余原样保留。新建 route 时逐字段写同样成立（中间对象按需创建），
   * 所以这里不需要分「新建 / 已存在」两条路径。
   */
  function add() {
    setBusy(true)
    setNote(null)
    var routeId = form.routeId.trim()
    var existed = isRouteConfigured(presets, routeId)
    apiCall('settings/mutate', { ns: 'llm-pi-ai', ops: providerSaveOps(routeId, form) })
      .then(function () {
        return apiCall('credentials/set', { ref: form.apiKeyEnv.trim(), value: form.key.trim() })
      })
      .then(function () {
        setNote((existed ? '已更新 ' : '已添加 ') + routeId + (existed ? '（原有 models / compat 等手写配置保留）' : ''))
        setTest({ phase: 'idle', message: '' })
        patchForm({ key: '' })
        if (typeof props.onAdded === 'function') props.onAdded()
      })
      .catch(function (cause) {
        setNote('添加失败：' + String(cause && cause.message ? cause.message : cause)
          + '（配置可能已写入、仅密钥未存，检查后可重试）')
      })
      .then(function () {
        setBusy(false)
      })
  }

  if (!open) {
    return react.createElement(
      'button',
      { type: 'button', className: 'pv_addBtn', onClick: function () { setOpen(true) } },
      t('addProvider'),
    )
  }

  // 供应商可过滤下拉：fuzzyMatch 复用模型过滤那套（缩写/错拼都行）
  var pickedPreset = findById(presets, form.routeId)
  var pickedLabel = pickedPreset === undefined ? form.routeId : pickedPreset.label
  var customPicked = pickedPreset !== undefined && pickedPreset.custom === true
  var pickItems = []
  for (var pk = 0; pk < presets.length; pk += 1) {
    ;(function (preset) {
      if (pickFilter.trim() !== '' && fuzzyMatch(pickFilter, preset.label + ' ' + preset.id) !== true) return
      var pick = presetPickState(preset)
      pickItems.push(
        react.createElement(
          'button',
          {
            key: preset.id,
            type: 'button',
            className: 'pv_pickItem',
            disabled: pick.disabled,
            onClick: function () {
              pickPreset(preset.id)
              setPickOpen(false)
            },
          },
          preset.label,
          pick.tag === null
            ? null
            : react.createElement('span', { className: 'plan_tag', style: { marginLeft: '6px' } }, pick.tag),
        ),
      )
    })(presets[pk])
  }
  if (pickItems.length === 0) {
    pickItems.push(react.createElement('div', { className: 'pv_pickEmpty', key: 'empty' }, '没有匹配的供应商'))
  }

  return react.createElement(
    'div',
    { className: 'pv_pc' },
    react.createElement('div', { className: 'pv_pcBody', style: { borderTop: '0', paddingTop: '10px', gap: '6px' } },
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, '供应商'),
        react.createElement(
          'span',
          { className: 'pv_pick', ref: pickRef },
          react.createElement(
            'button',
            {
              type: 'button',
              className: 'pv_field pv_pickBtn',
              onClick: function () {
                setPickOpen(!pickOpen)
                setPickFilter('')
              },
            },
            react.createElement('span', null, form.routeId === '' ? '选择供应商…' : pickedLabel),
            react.createElement('span', { className: 'pv_pcCaret' }, pickOpen ? '▾' : '▸'),
          ),
          pickOpen === false
            ? null
            : react.createElement(
                'div',
                { className: 'pv_pickMenu' },
                react.createElement('input', {
                  className: 'pv_mFilter',
                  style: { width: '100%' },
                  type: 'text',
                  placeholder: '过滤供应商',
                  value: pickFilter,
                  autoFocus: true,
                  onChange: function (event: FieldEvent) { setPickFilter(event.target.value) },
                }),
                react.createElement('div', { className: 'pv_pickList' }, pickItems),
              ),
        ),
      ),
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, '路由 ID'),
        react.createElement('input', {
          className: customPicked ? 'pv_field pv_key' : 'pv_field pv_ro',
          value: form.routeId,
          readOnly: customPicked !== true,
          title: customPicked ? '给这个网关起个名字（kebab-case）' : '由所选供应商决定',
          onChange: function (event: FieldEvent) {
            if (customPicked !== true) return
            patchForm({ routeId: event.target.value, apiKeyEnv: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY' })
          },
        }),
      ),
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, 'API 密钥'),
        react.createElement('input', {
          className: 'pv_field pv_key',
          type: 'password',
          placeholder: 'sk-…',
          value: form.key,
          onChange: function (event: FieldEvent) { patchForm({ key: event.target.value }) },
        }),
        form.websiteUrl === undefined
          ? null
          : react.createElement('a', { className: 'pv_pcLink', href: form.websiteUrl, target: '_blank', rel: 'noreferrer', style: { marginLeft: '8px' } }, '获取密钥 ↗'),
      ),
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, 'API 地址'),
        react.createElement('input', {
          className: form.baseURL === '' ? 'pv_field pv_key' : 'pv_field pv_ro',
          value: form.baseURL,
          readOnly: form.baseURL !== '',
          onChange: function (event: FieldEvent) { patchForm({ baseURL: event.target.value }) },
        }),
      ),
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, '协议'),
        customPicked
          ? react.createElement(
              'select',
              {
                className: 'pv_field',
                value: form.api,
                onChange: function (event: FieldEvent) { patchForm({ api: event.target.value }) },
              },
              react.createElement('option', { value: 'openai-completions' }, 'OpenAI'),
              react.createElement('option', { value: 'anthropic-messages' }, 'Anthropic'),
            )
          : react.createElement('input', {
              className: 'pv_field pv_ro',
              value: form.api,
              readOnly: true,
            }),
      ),
      // 凭据名：单独一行小字，不挤在协议行右侧
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, ''),
        react.createElement('span', { className: 'pv_hint' }, '密钥存为 ' + form.apiKeyEnv),
      ),
      react.createElement(
        'div',
        { className: 'pv_actRow' },
        react.createElement('button', { type: 'button', className: 'pv_action', style: { marginLeft: '0' }, disabled: test.phase === 'run', onClick: runTest },
          test.phase === 'run' ? '测试中…' : '测试'),
        react.createElement('button', {
          type: 'button',
          className: 'pv_action',
          disabled: busy || test.phase !== 'ok',
          title: test.phase === 'ok' ? '' : '先通过测试才能添加',
          onClick: add,
        }, busy ? '添加中…' : '添加到列表'),
        react.createElement('button', { type: 'button', className: 'pv_action', style: { marginLeft: 'auto' }, onClick: function () { setOpen(false); setTest({ phase: 'idle', message: '' }); setNote(null) } }, '取消'),
      ),
      test.message === ''
        ? null
        : react.createElement('div', { className: 'plan_note' + (test.phase === 'fail' ? ' plan_badText' : '') }, test.message),
      note === null ? null : react.createElement('div', { className: 'plan_note' }, note),
    ),
  )
}

/**
 * Provider 标签：CC Switch 式卡片。
 * 每个 provider 一张分割明显的卡片，头部一行直给最关键信息（coding plan 的
 * 5小时/订阅余量、API 的余额），点卡片展开看窗口进度与明细；有报警/错误的卡片
 * 默认展开。pi-ai 桥接沉底且默认折叠（次要信息）。
 */
export function ProviderSettingsSection() {
  var statusState = react.useState(null)
  var status = statusState[0]
  var setStatus = statusState[1]
  var planState = react.useState(null)
  var plan = planState[0]
  var setPlan = planState[1]
  var noteState = react.useState(null)
  var note = noteState[0]
  var setNote = noteState[1]
  var busyState = react.useState(false)
  var busy = busyState[0]
  var setBusy = busyState[1]
  var tabState = react.useState('providers')
  var tab = tabState[0]
  var setTab = tabState[1]
  var groupsState = react.useState([])
  var catalogGroups = groupsState[0]
  var setCatalogGroups = groupsState[1]
  var detailsState = react.useState({})
  var detailsById = detailsState[0]
  var setDetailsById = detailsState[1]
  var filtersState = react.useState({})
  var filters = filtersState[0]
  var setFilters = filtersState[1]
  var presetsState = react.useState([])
  var presets = presetsState[0]
  var setPresets = presetsState[1]
  var catTickState = react.useState(0)
  var setCatTick = catTickState[1]
  var delState = react.useState({})
  var delConfirm = delState[0]
  var setDelConfirm = delState[1]
  // 备份导出结果（按 provider id 存）：'copied' | 一段错误说明。
  // 删除不可撤销，所以确认区带一个「导出配置」动作——出事了手上还有一份原文（issue #3 的期望 4）。
  var backupState = react.useState({})
  var backups = backupState[0]
  var setBackups = backupState[1]
  var refreshingState = react.useState({})
  var setRefreshing = refreshingState[1]
  // 卡片里"补密钥"的输入草稿与保存中标记（都按 provider id 存）
  var keyDraftState = react.useState({})
  var keyDrafts = keyDraftState[0]
  var setKeyDrafts = keyDraftState[1]
  var savingKeyState = react.useState({})
  var savingKey = savingKeyState[0]
  var setSavingKey = savingKeyState[1]
  var toastState = react.useState(null)
  var toast = toastState[0]
  var setToast = toastState[1]
  var toastTimer: ReturnType<typeof setTimeout> | null = null
  // 相对时间每 30 秒跳一次，让「N 分钟前」自己往前走
  var nowTickState = react.useState(0)
  var setNowTick = nowTickState[1]
  react.useEffect(
    function () {
      var timer = setInterval(function () {
        setNowTick(function (n: number) { return n + 1 })
      }, 30000)
      return function () {
        clearInterval(timer)
      }
    },
    [],
  )
  var openState = react.useState({})
  var openMap = openState[0]
  var setOpenMap = openState[1]

  var refresh = react.useCallback(function (force: boolean) {
    loadProviderStatus()
      .then(function (payload) {
        setStatus(payload)
      })
      .catch(function () {
        setStatus(STATUS_UNAVAILABLE)
      })
    loadPlanStatus(force)
      .then(function (payload) {
        setPlan(payload)
      })
      .catch(function (cause) {
        setNote(cause && cause.message ? String(cause.message) : String(cause))
      })
  }, [])

  // 卡片跟着共享额度快照走：座位那边的轮询、别的入口触发的重拉，都会经由这条广播到达这里。
  // 不订阅的话，卡片会停在"自己上次拉的"那一份上，跟触发器显示的数字不一致。
  react.useEffect(
    function () {
      return onPlanChange(function (payload) {
        setPlan(payload)
      })
    },
    [],
  )

  react.useEffect(
    function () {
      refresh(false)
    },
    [refresh],
  )

  // 展开区要显示的模型列表：模型目录走官方同一条 RPC（catTick 触发重载，添加 provider 后用）
  react.useEffect(
    function () {
      var cancelled = false
      loadModelCatalog()
        .then(function (next) {
          if (!cancelled) setCatalogGroups(next.groups)
        })
        .catch(function () { /* 模型列表拿不到就留空，卡片头部信息不受影响 */ })
      return function () {
        cancelled = true
      }
    },
    [catTickState[0]],
  )

  // 可添加的供应商预设清单
  react.useEffect(
    function () {
      reloadPresets()
    },
    [],
  )

  // 预设清单重载（添加/删除后都要：勾选状态变化）
  function reloadPresets() {
    getJson('/provider/presets')
      .then(function (payload) {
        if (payload !== null && Array.isArray(payload.presets)) setPresets(payload.presets)
      })
      .catch(function () { /* 下次刷新会带上 */ })
  }

  // 添加 provider 成功后的收尾：强制刷余额（新 provider 不在缓存里）+ 预设 + 模型目录
  function onProviderAdded() {
    refresh(true)
    setCatTick(function (t: number) { return t + 1 })
    reloadPresets()
  }

  // 删除 provider 的收尾：不打上游（余量没变），只本地移除 + 重载预设/目录。
  // 本组件的 plan 状态由 onPlanChange 那条广播更新，这里不用再自己算一遍。
  function onProviderRemoved(account: PlanAccount) {
    dropPlanAccount(account.id)
    setCatTick(function (t: number) { return t + 1 })
    reloadPresets()
  }

  // 模型详情（悬浮卡元数据）：来自生效 pi-ai 包的数据文件
  react.useEffect(
    function () {
      var cancelled = false
      loadModelDetailMap()
        .then(function (map) {
          if (!cancelled) setDetailsById(map)
        })
        .catch(function () { /* 详情拿不到就只显示目录基础信息 */ })
      return function () {
        cancelled = true
      }
    },
    [],
  )

  // 刷新单个 provider 的余量（卡片上的 ↻ 按钮）：宿主实查并回传新账户，本地替换。
  // 等待时按钮旋转，完成弹一条成功/失败提示（2.6 秒后自动消失）。
  function setRefreshingFlag(id: string, value: boolean) {
    setRefreshing(function (prev: AnyRecord) {
      return withKey(prev, id, value)
    })
  }
  function showToast(text: string, ok: boolean) {
    setToast({ text: text, ok: ok })
    if (toastTimer !== null) clearTimeout(toastTimer)
    toastTimer = setTimeout(function () {
      setToast(null)
      toastTimer = null
    }, 2600)
  }
  function refreshSummary(account: PlanAccount) {
    var percent = worstPercent(account)
    if (percent !== undefined) return '（余 ' + String(percent) + '%）'
    if (Array.isArray(account.balances) && account.balances.length > 0) return '（' + account.balances[0].value + '）'
    return ''
  }
  function refreshAccount(account: PlanAccount) {
    setRefreshingFlag(account.id, true)
    postJson('/provider/refresh', { providerId: account.id })
      .then(function (res) {
        if (res !== null && res !== undefined && res.account !== undefined) {
          // 并进共享快照：广播会把新值同时送到本组件、座位指示器与 /model 命令。
          mergePlanAccount(res.account)
        }
        var failure = refreshFailure(res)
        if (failure === undefined) {
          showToast('✓ ' + shortName(account) + ' 余量已刷新' + refreshSummary(res.account), true)
        } else {
          showToast('✗ ' + shortName(account) + ' 刷新失败：' + failure, false)
        }
      })
      .catch(function (cause) {
        showToast('✗ ' + shortName(account) + ' 刷新失败：' + String(cause && cause.message ? cause.message : cause), false)
      })
      .then(function () {
        setRefreshingFlag(account.id, false)
      })
  }

  /**
   * 卡片里直接补密钥：路由已经在了（插件自己的 config 就声明了 deepseek），缺的只是凭据。
   * 存进官方同一个凭据仓库（credentials/set，与添加面板同一条 RPC），随后立刻实测一次余量。
   */
  function saveKey(account: PlanAccount) {
    var ref = account.apiKeyEnv === undefined ? '' : String(account.apiKeyEnv)
    var draft = keyDrafts[account.id]
    var value = draft === undefined ? '' : String(draft).trim()
    if (ref === '') {
      showToast('✗ ' + shortName(account) + ' 这条路由没有凭据名，无法存密钥', false)
      return
    }
    if (value === '') {
      showToast('✗ ' + shortName(account) + ' 先填密钥', false)
      return
    }
    setSavingKey(function (prev: AnyRecord) { return withKey(prev, account.id, true) })
    apiCall('credentials/set', { ref: ref, value: value })
      .then(function () {
        setKeyDrafts(function (prev: AnyRecord) { return withKey(prev, account.id, '') })
        return postJson('/provider/refresh', { providerId: account.id })
      })
      .then(function (res) {
        if (res !== null && res !== undefined && res.account !== undefined) mergePlanAccount(res.account)
        var failure = refreshFailure(res)
        if (failure === undefined) {
          showToast('✓ ' + shortName(account) + ' 密钥已保存，' + refreshSummary(res.account), true)
        } else {
          showToast('✓ 密钥已保存，但余量没查通：' + failure, false)
        }
        // 预设清单里这一家的「缺密钥」标记要跟着消失
        reloadPresets()
      })
      .catch(function (cause) {
        var message = String(cause && cause.message ? cause.message : cause)
        // 配置已经在了、只存凭据也可能失败：分开报，免得用户以为整家都没配上
        showToast('✗ 密钥保存失败：' + message, false)
      })
      .then(function () {
        setSavingKey(function (prev: AnyRecord) { return withKey(prev, account.id, false) })
      })
  }

  /**
   * 删除前把这条 route 的配置导出成 YAML 文本（issue #3 期望 4）。
   *
   * 删除是「清路由 + 清凭据」且不可撤销，手写的 `models` / `compat` / `retryPolicy` 一起没。
   * 界面上给一份能直接贴回 `settings.yaml` 的原文，是这里唯一成本够低、又真能救回配置的办法。
   * 密钥**不导出**：值在浏览器端拿不到（宿主只下发掩码），导出凭据名让用户知道该重填哪一个。
   */
  function exportRoute(account: PlanAccount) {
    var text = routeYamlOf(account)
    var clipboard = navigator !== undefined && navigator !== null ? navigator.clipboard : undefined
    if (clipboard === undefined || typeof clipboard.writeText !== 'function') {
      setBackups(function (prev: AnyRecord) {
        return withKey(prev, account.id, '这个环境不允许写剪贴板，请手动抄写：' + text)
      })
      return
    }
    clipboard.writeText(text).then(
      function () {
        setBackups(function (prev: AnyRecord) { return withKey(prev, account.id, 'copied') })
      },
      function (cause) {
        setBackups(function (prev: AnyRecord) {
          return withKey(prev, account.id, '复制失败：' + String(cause && cause.message ? cause.message : cause))
        })
      },
    )
  }

  function toggleDeleteMode(id: string, on: boolean) {
    setDelConfirm(function (prev: AnyRecord) { return withKey(prev, id, on) })
    setBackups(function (prev: AnyRecord) { return withKey(prev, id, undefined) })
  }

  // 删除 provider（✕ → 卡片底部确认区）：配置与密钥一起清掉
  function removeProvider(account: PlanAccount) {    postJson('/provider/remove', { providerId: account.id })
      .then(function (res) {
        setDelConfirm(function (prev: AnyRecord) {
          return withKey(prev, account.id, false)
        })
        setBackups(function (prev: AnyRecord) { return withKey(prev, account.id, undefined) })
        if (res === null || res === undefined || res.ok !== true) {
          setNote('删除失败：' + String((res && res.error) || '未知错误'))
          return
        }
        onProviderRemoved(account)
      })
      .catch(function (cause) {
        setNote('删除失败：' + String(cause && cause.message ? cause.message : cause))
      })
  }

  function checkUpdate() {
    setBusy(true)
    setNote('正在检查上游 ...')
    postJson('/provider/update')
      .then(function (result) {
        if (result.error !== undefined) {
          setNote('更新失败：' + String(result.error))
        } else if (result.applied === true) {
          setNote('已下载 ' + String(result.latest) + '，验证通过（完整性 + 兼容性），重启 dsh 后生效')
        } else if (result.compatible === false) {
          setNote(String(result.latest) + ' 验证没通过，已跳过（不会切过去）')
        } else {
          setNote('已是最新（' + String(result.latest) + '）')
        }
        refresh(true)
      })
      .catch(function (cause) {
        setNote('更新失败：' + String(cause && cause.message ? cause.message : cause))
      })
      .then(function () {
        setBusy(false)
      })
  }

  /** 折叠态记忆：undefined 时回落到默认值（报警/错误的卡片默认展开）。 */
  function isOpen(key: string, dflt: boolean) {
    return openMap[key] === undefined ? dflt : openMap[key]
  }
  function toggle(key: string, dflt: boolean) {
    setOpenMap(function (prev: AnyRecord) {
      return withKey(prev, key, isOpen(key, dflt) !== true)
    })
  }
  /** 模型列表过滤词（按模型 ID 或名称匹配）。 */
  function setFilter(id: string, value: string) {
    setFilters(function (prev: AnyRecord) {
      return withKey(prev, id, value)
    })
  }

  var bridge = status === null || status.bridge === undefined ? undefined : status.bridge
  var update = status === null || status.update === undefined ? undefined : status.update
  // 桥接明细：放在「pi-ai 桥接」二级标签页里展示。行的内容由 piAiBridgeRows 给（纯函数，离线可测）
  var bridgeRows = piAiBridgeRows(bridge, update)
  var bridgeLines = []
  for (var bi = 0; bi < bridgeRows.length; bi += 1) {
    var row = bridgeRows[bi]
    var children = [row.text]
    if (row.value !== undefined) {
      children.push(react.createElement(
        'span',
        { className: 'plan_tag pv_push', title: row.title === undefined ? '' : row.title, key: 'value' },
        row.value,
      ))
    }
    bridgeLines.push(react.createElement(
      'div',
      { className: 'pv_line' + (row.bad === true ? ' plan_badText' : row.warn === true ? ' plan_warnText' : ''), key: row.key },
      children,
    ))
  }
  // 上游那一行右侧跟按钮：检查更新（宿主先校验下载内容、再做兼容性体检，都过了才等重启生效）
  bridgeLines.push(
    react.createElement(
      'div',
      { className: 'pv_line', key: 'action' },
      piAiUpstreamText(update),
      react.createElement(
        'button',
        { type: 'button', className: 'pv_action pv_push', disabled: busy, onClick: checkUpdate },
        busy ? '检查中 ...' : '检查更新',
      ),
    ),
  )
  var accounts = plan !== null && Array.isArray(plan.accounts) ? plan.accounts : []
  var modelsByProvider: Record<string, CatalogModel[]> = {}
  for (var gi = 0; gi < catalogGroups.length; gi += 1) {
    modelsByProvider[catalogGroups[gi].id] = catalogGroups[gi].models
  }
  var cards = []
  for (var i = 0; i < accounts.length; i += 1) {
    ;(function (account: PlanAccount) {
      var chips = headlineChips(account)
      var dflt = account.error !== undefined || typeof account.credentialWarning === 'string'
      var expanded = isOpen(account.id, dflt)

      var chipEls = []
      for (var c = 0; c < chips.length; c += 1) chipEls.push(headlineChip(chips[c], c))

      var bodyRows = []
      if (expanded) {
        // 路由 ID：和「添加供应商」表单里的同一个值（settings 的 llm-pi-ai.providers 键）
        bodyRows.push(
          react.createElement(
            'div',
            { className: 'pv_line pv_row', key: 'id' },
            react.createElement('span', null, '路由 ID'),
            react.createElement('span', { className: 'pv_field' }, String(account.id)),
          ),
        )
        // API 密钥行：配好了显示掩码提示（宿主派生前3+后4，值不出宿主）；
        // 只有路由、还没密钥时这里就是唯一能补 key 的地方（官方 Models 页已被本插件的
        // cordis.patch.yml 禁用，别处没有入口）。原生路由（source: native）也走同一条
        // credentials/set：凭据名就是它的 apiKeyEnv。
        var keyless = account.authConfigured === false && typeof account.apiKeyEnv === 'string' && account.apiKeyEnv !== ''
        bodyRows.push(
          react.createElement(
            'div',
            { className: 'pv_line pv_row', key: 'key' },
            react.createElement('span', null, 'API 密钥'),
            keyless
              ? react.createElement(
                  'span',
                  { className: 'pv_pick', style: { display: 'inline-flex', alignItems: 'center', gap: '6px', flex: '1 1 auto' } },
                  react.createElement('input', {
                    className: 'pv_field pv_key',
                    style: { flex: '1 1 auto' },
                    type: 'password',
                    placeholder: 'sk-…',
                    value: keyDrafts[account.id] === undefined ? '' : String(keyDrafts[account.id]),
                    disabled: savingKey[account.id] === true,
                    onChange: function (event: FieldEvent) {
                      var next = event.target.value
                      setKeyDrafts(function (prev: AnyRecord) { return withKey(prev, account.id, next) })
                    },
                  }),
                  react.createElement('button', {
                    type: 'button',
                    className: 'pv_action',
                    style: { marginLeft: '0', flex: '0 0 auto' },
                    disabled: savingKey[account.id] === true,
                    title: '存进 ' + String(account.apiKeyEnv) + ' 并立刻实测一次余量',
                    onClick: function () { saveKey(account) },
                  }, savingKey[account.id] === true ? '保存中…' : '保存'),
                )
              : react.createElement(
                  'span',
                  { className: 'pv_field' },
                  account.keyHint !== undefined ? account.keyHint : '已配置',
                ),
          ),
        )
        if (account.baseUrl !== undefined) {
          bodyRows.push(
            react.createElement(
              'div',
              { className: 'pv_line pv_row', key: 'url' },
              react.createElement('span', null, 'API 地址'),
              react.createElement('span', { className: 'pv_field' }, String(account.baseUrl)),
            ),
          )
        }
        // 协议 / 凭据名：原生适配器路由（deepseek-official 这类）不写 settings 段，可能只有其中一个
        if (account.api !== undefined) {
          bodyRows.push(
            react.createElement(
              'div',
              { className: 'pv_line pv_row', key: 'api' },
              react.createElement('span', null, '协议'),
              react.createElement('span', { className: 'pv_field' }, String(account.api)),
            ),
          )
        }
        if (account.apiKeyEnv !== undefined) {
          bodyRows.push(
            react.createElement(
              'div',
              { className: 'pv_line pv_row', key: 'ref' },
              react.createElement('span', null, ''),
              react.createElement('span', { className: 'pv_hint' }, '密钥存为 ' + String(account.apiKeyEnv)),
            ),
          )
        }
        // 模型列表：目录（服务端）为骨架，pi-ai 详情补元数据；悬浮显示 Cherry 式详情卡
        var models = modelsByProvider[account.id]
        if (models === undefined) {
          bodyRows.push(react.createElement('div', { className: 'pv_line', key: 'm-load' }, '模型目录加载中…'))
        } else if (models.length === 0) {
          bodyRows.push(react.createElement('div', { className: 'pv_line', key: 'm-none' }, '目录里没有这个 provider 的模型'))
        } else {
          // 模型区（带外框）独立折叠：卡片展开时默认收起，点「模型（N）」头展开
          var modelsOpen = isOpen(account.id + ':models', false)
          // 过滤：模糊匹配模型 ID 或名称（子串 / 缩写子序列 / 编辑距离容错）
          var filterText = filters[account.id] === undefined ? '' : String(filters[account.id])
          var needle = filterText.trim().toLowerCase()
          var filtered = []
          for (var fi = 0; fi < models.length; fi += 1) {
            if (fuzzyMatch(filterText, models[fi].id + ' ' + models[fi].name)) {
              filtered.push(models[fi])
            }
          }
          var mBoxRows = []
          // 模型区头部（仿父卡片范式）：标题左；展开时过滤器靠右；最右 Chevron 旋转切换
          var mTopChildren = [
            react.createElement(
              'button',
              { type: 'button', className: 'pv_mHead', key: 'm-head', onClick: function () { toggle(account.id + ':models', false) } },
              react.createElement('span', null, '模型（' + (needle === '' ? String(models.length) : String(filtered.length) + '/' + String(models.length)) + '）'),
            ),
          ]
          if (modelsOpen) {
            mTopChildren.push(
              react.createElement(
                'span',
                { className: 'pv_fbox', key: 'm-filter' },
                react.createElement('input', {
                  className: 'pv_mFilter',
                  type: 'text',
                  placeholder: '过滤',
                  value: filterText,
                  onChange: function (event: FieldEvent) {
                    setFilter(account.id, event.target.value)
                  },
                }),
                filterText === ''
                  ? null
                  : react.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'pv_fclear',
                        title: '清除',
                        onClick: function () { setFilter(account.id, '') },
                      },
                      '×',
                    ),
              ),
            )
          }
          mTopChildren.push(
            react.createElement(
              'div',
              {
                className: 'pv_mCaretCol',
                key: 'm-caret',
                title: modelsOpen ? '收起' : '展开',
                onClick: function () { toggle(account.id + ':models', false) },
              },
              caretSvg(modelsOpen),
            ),
          )
          mBoxRows.push(react.createElement('div', { className: 'pv_mTop', key: 'm-top' }, mTopChildren))
          if (modelsOpen) {
            var mListRows = []
            // 列标题：与模型行同一套列宽类，保证严格对齐
            mListRows.push(
              react.createElement(
                'div',
                { className: 'pv_mHeadRow', key: 'm-colhead' },
                react.createElement('span', { className: 'pv_mId', style: { fontFamily: 'inherit' } }, '模型 ID'),
                react.createElement('span', { className: 'pv_mName' }, '名称'),
                react.createElement('span', { className: 'pv_mCaps' }, '能力'),
                react.createElement('span', { className: 'pv_mCtx' }, '上下文'),
              ),
            )
            if (filtered.length === 0) {
              mListRows.push(react.createElement('div', { className: 'pv_line', key: 'm-empty' }, '没有匹配「' + filterText + '」的模型'))
            } else {
              for (var m = 0; m < filtered.length; m += 1) {
                mListRows.push(modelRow(filtered[m], account, detailsById))
              }
            }
            // 列表区：分割线上边缘贯穿模型框
            mBoxRows.push(react.createElement('div', { className: 'pv_mList', key: 'm-list' }, mListRows))
          }
          bodyRows.push(react.createElement('div', { className: 'pv_mBox', key: 'mbox' }, mBoxRows))
        }
        if (account.error !== undefined) {
          bodyRows.push(react.createElement('div', { className: 'plan_note plan_badText', key: 'err' }, String(account.error)))
        }
        // 凭据体检结论：多个 provider 共用同一把 key（值本身不会下发到浏览器）
        if (typeof account.credentialWarning === 'string') {
          bodyRows.push(react.createElement('div', { className: 'plan_note plan_badText', key: 'warn' }, account.credentialWarning))
        }
        // 删除确认区：**放在卡片底部**，不占 ✕ 那个槽位（issue #3：确认按钮与 ✕ 同位置时，
        // 双击的第二下正好落在刚变成「确认删除」的按钮上，二次确认等于没挡）。文案写清代价：
        // 这一步会同时删掉整条路由与凭据，手写配置不可恢复；旁边给一个导出动作兜底。
        if (account.deletable === true && delConfirm[account.id] === true) {
          var backup = backups[account.id]
          var delRows = [
            react.createElement(
              'div',
              { className: 'pv_delPanelTitle', key: 't' },
              '删除 provider「' + account.id + '」？',
            ),
            react.createElement(
              'div',
              { className: 'pv_delPanelBody', key: 'b' },
              '将删除整条路由配置'
                + (typeof account.apiKeyEnv === 'string' && account.apiKeyEnv !== '' ? '与其凭据 ' + account.apiKeyEnv : '与它的凭据')
                + '。手写的 models / compat / retryPolicy 会一起消失，且不可恢复。',
            ),
          ]
          if (backup === 'copied') {
            delRows.push(react.createElement('div', { className: 'plan_note', key: 'ok' }, '✓ 配置已复制到剪贴板，可直接贴回 settings.yaml'))
          } else if (typeof backup === 'string' && backup !== '') {
            delRows.push(react.createElement('div', { className: 'plan_note plan_badText', key: 'fail' }, backup))
          }
          delRows.push(
            react.createElement(
              'div',
              { className: 'pv_delPanelActs', key: 'a' },
              react.createElement(
                'button',
                { type: 'button', className: 'pv_delYes', onClick: function () { removeProvider(account) } },
                '删除此 provider',
              ),
              react.createElement(
                'button',
                { type: 'button', className: 'pv_delNo', onClick: function () { exportRoute(account) } },
                '导出配置',
              ),
              react.createElement(
                'button',
                {
                  type: 'button',
                  className: 'pv_delNo',
                  onClick: function () { toggleDeleteMode(account.id, false) },
                },
                '取消',
              ),
            ),
          )
          bodyRows.push(react.createElement('div', { className: 'pv_delPanel', key: 'del' }, delRows))
        }
      }

      var linkUrl = typeof account.websiteUrl === 'string' && account.websiteUrl !== ''
        ? account.websiteUrl
        : (typeof account.baseUrl === 'string' && account.baseUrl !== '' ? account.baseUrl : undefined)

      cards.push(
        react.createElement(
          'div',
          { className: 'pv_pc' + (expanded ? ' pv_pcOpen' : ''), key: account.id },
          react.createElement(
            'div',
            { className: 'pv_pcTop' },
            react.createElement(
              'div',
              { className: 'pv_pcMain' },
            // 第一行：绿点 + 名称 + 等级 + 网页图标——对齐官方插件卡头部
            react.createElement(
              'div',
              {
                className: 'pv_pcHead',
                role: 'button',
                tabIndex: 0,
                'aria-expanded': expanded ? 'true' : 'false',
                onClick: function () { toggle(account.id, dflt) },
                onKeyDown: function (ev: KeyboardEvent) {
                  if (ev && (ev.key === 'Enter' || ev.key === ' ')) {
                    if (typeof ev.preventDefault === 'function') ev.preventDefault()
                    toggle(account.id, dflt)
                  }
                },
              },
              react.createElement(
                'span',
                { className: 'pv_pcLead' },
                react.createElement(
                  'span',
                  { className: 'pv_pcLeadRow' },
                  react.createElement('span', { className: dotClass(account) }),
                  react.createElement('span', { className: 'pv_pcName' }, shortName(account)),
                  linkUrl === undefined
                    ? null
                    : react.createElement('a', {
                        className: 'pv_pcWeb',
                        href: linkUrl,
                        target: '_blank',
                        rel: 'noreferrer',
                        title: '打开官网 ' + linkTextOf(linkUrl),
                        onClick: function (event: MouseEvent) {
                          if (event && typeof event.stopPropagation === 'function') event.stopPropagation()
                        },
                      }, '↗'),
                ),
              ),
            ),
            // 第二行：余量摘要左对齐；右侧 刷新时间｜刷新｜删除
            react.createElement(
              'div',
              { className: 'pv_pcMeta' },
              chipEls,
              react.createElement(
                'span',
                { className: 'pv_metaActs' },
                account.fetchedAt === undefined
                  ? null
                  : react.createElement(
                      'span',
                      { className: 'pv_fresh', title: '上次刷新 ' + String(account.fetchedAt).slice(11, 19) },
                      '◷ ' + relativeTime(account.fetchedAt),
                    ),
                react.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'pv_iconBtn' + (refreshingState[0][account.id] === true ? ' pv_spin' : ''),
                    disabled: refreshingState[0][account.id] === true,
                    title: refreshingState[0][account.id] === true ? '刷新中…' : '刷新余量' + (account.fetchedAt !== undefined ? '（上次 ' + String(account.fetchedAt).slice(11, 19) + '）' : ''),
                    onClick: function () { refreshAccount(account) },
                  },
                  '↻',
                ),
                account.deletable === true
                  ? (delConfirm[account.id] === true
                      ? null
                      : react.createElement(
                          'button',
                          {
                            type: 'button',
                            className: 'pv_iconBtn',
                            title: '删除这个 provider',
                            onClick: function () { toggleDeleteMode(account.id, true) },
                          },
                          '✕',
                        ))
                  : null,
              ),
            ),
            ),
            // 箭头列：只在「标题+余量」区域垂直居中（分割线上方），点击展开/收起
            react.createElement(
              'div',
              {
                className: 'pv_pcCaretCol',
                title: expanded ? '收起' : '展开',
                onClick: function () { toggle(account.id, dflt) },
              },
              caretSvg(expanded),
            ),
          ),
          // 展开体：分割线上边缘贯穿整卡
          expanded ? react.createElement('div', { className: 'pv_pcBody' }, bodyRows) : null,
        ),
      )
    })(accounts[i])
  }
  if (cards.length === 0) {
    cards.push(
      react.createElement('div', { className: 'pv_line', key: '__none' }, String(plan !== null && plan.error !== undefined ? plan.error : '暂无 provider 额度数据')),
    )
  }

  // 页内二级标签：Provider（配置的 provider 卡片）/ pi-ai 桥接
  var tabProviders = react.createElement(
    'button',
    { type: 'button', className: 'pv_tab' + (tab === 'providers' ? ' pv_tabOn' : ''), onClick: function () { setTab('providers') } },
    t('tabProviders'),
  )
  var tabBridge = react.createElement(
    'button',
    { type: 'button', className: 'pv_tab' + (tab === 'bridge' ? ' pv_tabOn' : ''), onClick: function () { setTab('bridge') } },
    'pi-ai 桥接',
  )
  return react.createElement(
    'div',
    { className: 'pv_stack' },
    react.createElement('div', { className: 'pv_tabs' }, tabProviders, tabBridge),
    tab === 'bridge'
      ? react.createElement(
          'div',
          { className: 'pv_pc' },
          react.createElement('div', { className: 'pv_pcBody', style: { borderTop: '0', paddingTop: '8px' } },
            bridgeLines,
            note === null ? null : react.createElement('div', { className: 'plan_note' }, note)),
        )
      : react.createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
          react.createElement(AddProviderPanel, { presets: presets, onAdded: onProviderAdded }),
          cards,
        ),
    toast === null
      ? null
      : react.createElement(
          'div',
          { className: 'pv_toast ' + (toast.ok === true ? 'pv_toastOk' : 'pv_toastFail') },
          toast.text,
        ),
  )
}
