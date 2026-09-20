/**
 * 设置页 Provider 标签：CC Switch 式卡片 + 「添加供应商」面板 + 「pi-ai 桥接」二级标签。
 * 桥接明细行是纯函数（piAiBridgeRows），组件照着渲染——离线可测。
 */
import react from 'react'
import type { AnyRecord } from '../types.js'
import {
  apiCall,
  detailsOfProvider,
  detailKeyOf,
  dropPlanAccount,
  findById,
  getJson,
  loadModelCatalog,
  loadModelDetailMap,
  loadPlanStatus,
  loadProviderStatus,
  lookupDetail,
  lookupDetailAnySource,
  mergePlanAccount,
  onPlanChange,
  postJson,
  statusUnavailable,
  withKey,
  withKeys,
} from './data.js'
import { dotClass, formatContext, fuzzyMatch, headlineChips, linkTextOf, relativeTime, resetCountdownText, shortName, toneColor, worstPercent } from './format.js'
import { caretSvg } from './icons.js'
import { t, tf } from './i18n.js'
import { addModelRow, buildModelEditor, modelListPayload, patchModelRow, validateModelRows } from './model-editor.js'
import type { ModelEditorRow, ModelEditorState } from './model-editor.js'
import { PROVIDER_API_OPTIONS, isProviderEditDirty, providerEditForm, providerEditSaveOps, validateProviderEdit } from './provider-edit.js'
import type { ProviderEditForm } from './provider-edit.js'
import type { AddProviderPanelProps, BridgeRow, CatalogModel, DeclaredModel, FieldEvent, HeadlineChip, ModelDetail, ModelEditRow, PlanAccount, ProviderPreset } from './types.js'

/** 当前用的是哪一档 pi-ai，只分两桶：官方（'dsh' / 'dsh-app'，dsh 自带）vs vendor（'vendor' / 'dependency' / 版本号，插件包自带）。 */
function piAiSourceLabel(source: unknown): string {
  if (source === 'dsh' || source === 'dsh-app') return t('bridge.srcOfficial')
  return t('bridge.srcVendored')
}

function piAiSourceHint(source: unknown): string {
  if (source === 'dsh' || source === 'dsh-app') return t('bridge.hintOfficial')
  return t('bridge.hintVendored')
}

/**
 * 「pi-ai 桥接」标签页的明细行。纯函数，只返回数据，组件照着渲染——这样能离线测，
 * 也免得一堆拼字符串的逻辑埋在组件里。
 * @param bridge - /provider/status 的 bridge 段（当前加载的那份）。
 * @param update - 同上的 update 段（上游最新 / 待生效 / 体检没过的）。
 * @returns `[{ key, text, value?, title?, warn? }]`；value 是右侧的次要文字。
 */
export function piAiBridgeRows(bridge: unknown, update: unknown, updatesEnabled?: boolean): BridgeRow[] {
  var rows: BridgeRow[] = []
  if (bridge === undefined || bridge === null) return rows
  var bridgeRecord = bridge as AnyRecord
  if (bridgeRecord.active !== true) {
    rows.push({ key: 'err', text: String(bridgeRecord.error), bad: true })
    return rows
  }
  rows.push({
    key: 'pi',
    text: t('bridge.version'),
    value: tf('bridge.srcParen', { version: bridgeRecord.piAiVersion, source: piAiSourceLabel(bridgeRecord.source) }),
    title: piAiSourceHint(bridgeRecord.source),
  })
  // 本地版（issue #4）：默认停用自动下载时不再显示说明行——桥接页只留版本一行（官方 / vendor）；
  // updatesEnabled 只由组件用来决定上游行与按钮是否渲染
  // 体检没执行（bundle 的 import 需求解析不出）：这份 pi-ai 是靠「目录存在」放行的，没验证过
  if (bridgeRecord.probeUnverified === true) {
    rows.push({
      key: 'unverified',
      text: t('bridge.probeUnverified'),
      value: t('bridge.reason'),
      title: t('bridge.probeUnverifiedTip'),
      warn: true,
    })
  }
  // 体检没过的候选：为什么没用上更新的那版
  var rejected = Array.isArray(bridgeRecord.rejected) ? bridgeRecord.rejected : []
  for (var i = 0; i < rejected.length; i += 1) {
    var skipped = rejected[i] as AnyRecord
    rows.push({
      key: 'skip-' + i,
      text: tf('bridge.skip', { version: skipped.version }),
      value: t('bridge.reason'),
      title: String(skipped.error),
      warn: true,
    })
  }
  // 最近一次检查更新的结论
  if (update !== undefined && update !== null) {
    var updateRecord = update as AnyRecord
    if (updateRecord.pending !== undefined) {
      rows.push({ key: 'pending', text: tf('bridge.pending', { version: updateRecord.pending }), warn: true })
    }
    if (updateRecord.rejected !== undefined && updateRecord.rejected !== null) {
      var rejectedLatest = updateRecord.rejected as AnyRecord
      rows.push({
        key: 'rejected',
        text: tf('bridge.rejected', { version: rejectedLatest.version }),
        value: t('bridge.reason'),
        title: String(rejectedLatest.error),
        warn: true,
      })
    }
  }
  return rows
}

/** 上游那一行的文字（右侧按钮由组件补）。updatesEnabled === false 时说明自动下载已停用。 */
export function piAiUpstreamText(update: unknown, updatesEnabled?: boolean): string {
  if (updatesEnabled === false) return t('bridge.upstreamPaused')
  if (update === undefined || update === null) return t('bridge.upstreamUnchecked')
  var updateRecord = update as AnyRecord
  if (updateRecord.latest === undefined) return t('bridge.upstreamUnchecked')
  var when = updateRecord.lastCheck === undefined
    ? ''
    : tf('bridge.upstreamCheckedAt', { when: relativeTime(updateRecord.lastCheck) })
  return tf('bridge.upstreamVersion', { version: updateRecord.latest }) + when
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

/**
 * 能力 id → 样式类 + 字典 key（模型行与详情卡共用一套）。
 *
 * 分开两件事是必须的：**样式类以 id 为键**（语言无关），显示名才走 t()。
 * 原来拿中文显示名当键，切到英文就一个类都匹配不上——徽章会丢掉配色。
 */
var CAP_KEYS: Record<string, { cls: string; label: string }> = {
  vision: { cls: 'pv_capVision', label: 'cap.vision' },
  reasoning: { cls: 'pv_capReason', label: 'cap.reasoning' },
  video: { cls: 'pv_capVideo', label: 'cap.video' },
}

/**
 * 一条详情里**已知为真**的能力 id（顺序：视觉、推理、视频），离线可测的纯函数。
 *
 * 返回 id 而不是显示名：id 是语言无关的内部标识，显示名在渲染时才 t() 出来。
 * 只认 `true`：`false` 是「明确不支持」，`undefined` 是「没查过」（自定义模型 id 在 pi-ai
 * 目录里查不到、route 也没声明模态时就是这样）。两者都不出徽章，但它们是两回事——
 * 详情卡里必须分开写，否则等于把「没查过」渲染成「没有视觉」。
 */
export function capabilityKeysOf(detail: ModelDetail | undefined): string[] {
  var keys: string[] = []
  if (detail === undefined || detail === null) return keys
  if (detail.vision === true) keys.push('vision')
  if (detail.reasoning === true) keys.push('reasoning')
  if (detail.video === true) keys.push('video')
  return keys
}

/** 一条详情的**显示用**能力徽章文案（顺序同 {@link capabilityKeysOf}）；语言由 t() 现取。 */
export function capabilityBadges(detail: ModelDetail | undefined): string[] {
  return capabilityKeysOf(detail).map(function (id) { return t(CAP_KEYS[id].label) })
}

/** 能力 id → 样式类；未知 id 不给类，不塞半条样式。 */
function capClassOf(id: string): string {
  return CAP_KEYS[id] === undefined ? '' : CAP_KEYS[id].cls
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

/** 模型行：ID + 能力徽章（视觉/推理/视频）+ 上下文 / 最大输出标签，悬浮出 Cherry 式详情卡。 */
export function modelRow(model: CatalogModel, account: PlanAccount, detailsById: Record<string, ModelDetail> | undefined | null) {
  // issue #5：详情按 provider+id 查（同名模型不串家），查不到才退回裸 id
  var detail = lookupDetail(detailsById, account.id, model.id)
  var cw = detail !== undefined && detail.contextWindow !== undefined ? detail.contextWindow : model.contextWindow
  var ctx = formatContext(cw)
  var mt = detail !== undefined && detail.maxTokens !== undefined ? detail.maxTokens : undefined
  var max = formatContext(mt)
  var caps = capabilityKeysOf(detail).map(function (id) {
    return react.createElement('span', { key: id, className: 'pv_capMini ' + capClassOf(id) }, t(CAP_KEYS[id].label))
  })
  // 能力来自路由声明（pi-ai 目录没收录这个 id）：标记一下，别让人以为是从上游目录读的
  if (detail !== undefined && detail.source === 'declared') {
    caps.push(react.createElement('span', { key: 'declared', className: 'pv_capMini pv_capDeclared', title: t('cap.declaredTip') }, t('cap.declared')))
  }
  // 不放「名称」列：显示名是 ID 的注脚，详情卡悬浮里有，占着最宽的一列还把长 ID 挤成省略号；
  // 「最大输出」才是清单页缺的硬信息（与编辑器同款格式化，目录没给就留空）
  return react.createElement(
    'div',
    { className: 'pv_mRow', key: 'm-' + model.id },
    react.createElement('span', { className: 'pv_mId', title: model.id }, model.id),
    react.createElement('span', { className: 'pv_mCaps' }, caps),
    react.createElement('span', { className: 'pv_mCtx' }, ctx === undefined ? '' : ctx),
    react.createElement('span', { className: 'pv_mMax' }, max === undefined ? '' : max),
    modelTip(model, account, detail),
  )
}

/** Cherry 式模型详情卡：服务商 / 模型 ID / 能力标记 / 上下文 / 最大输出 / 思维链。 */
export function modelTip(model: CatalogModel, account: PlanAccount, detail: ModelDetail | undefined) {
  var rows = [react.createElement('div', { className: 'pv_tipTitle', key: 't' }, model.name)]
  rows.push(tipLine(t('prov.provider'), shortName(account), 'p'))
  rows.push(tipLine(t('prov.modelId'), model.id, 'id'))
  var capIds = capabilityKeysOf(detail)
  if (capIds.length > 0) {
    rows.push(react.createElement('div', { className: 'pv_tipCaps', key: 'c' }, capIds.map(function (id) {
      return tipCap(t(CAP_KEYS[id].label), capClassOf(id))
    })))
  }
  // 能力没出处就明说：写「关闭」等于替用户断言它不支持，比留白更误导
  if (!capabilitiesKnown(detail)) {
    rows.push(react.createElement('div', { className: 'pv_tipDim', key: 'caps-unknown' }, t('cap.unknown')))
  }
  if (detail !== undefined) {
    // 窗口兜底到目录里的值——和模型行的算法一致：有出处的那份优先
    var cw = detail.contextWindow !== undefined ? detail.contextWindow : model.contextWindow
    if (cw !== undefined) rows.push(tipLine(t('cap.cw'), cw.toLocaleString('en-US'), 'cw'))
    if (detail.maxTokens !== undefined) rows.push(tipLine(t('cap.maxTokens'), detail.maxTokens.toLocaleString('en-US'), 'mt'))
    rows.push(tipLine(t('cap.chain'), detail.reasoning === undefined
      ? t('cap.unknownShort')
      : (detail.reasoning === true
        ? (Array.isArray(detail.thinkingLevels) && detail.thinkingLevels.length > 0 ? detail.thinkingLevels.join('、') : t('cap.auto'))
        : t('cap.off')), 'tk'))
  if (detail.source === 'declared') {
    rows.push(react.createElement('div', { className: 'pv_tipDim', key: 'src' }, t('cap.sourceDeclared')))
  }
  } else {
    rows.push(react.createElement('div', { className: 'pv_tipDim', key: 'dim' }, t('cap.noMeta')))
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
 * 逐模型清单编辑的一行：勾选框 + 模型 ID + 展开后的可改字段。
 *
 * 只暴露 `name` / `contextWindow` / `maxTokens` 三个可改字段：官方 schema 还认
 * `reasoningEfforts` / `compat`，但那两样的值是各家 wire 的拼写（写错会让**整条路由**解析失败），
 * 界面给不出可靠输入与提示，所以宁可**不写**（不写 = 沿用目录里那份）也不写错。
 * 输入模态只做只读回显，同理。
 * @param row - 编辑器里的一行。
 * @param routeId - 这行属于哪个 route。
 * @param editor - 该 route 的编辑器状态（改行时整份替换）。
 * @param update - 改状态的入口。
 * @param expanded - 行级展开表（key 是 routeId:modelId）。
 * @param toggleExpand - 切换某行的展开。
 */
function modelEditorRow(
  row: ModelEditorRow,
  routeId: string,
  editor: ModelEditorState,
  update: (routeId: string, next: ModelEditorState) => void,
  expanded: AnyRecord,
  toggleExpand: (key: string) => void,
) {
  var expandKey = routeId + ':' + row.id
  var isOpen = expanded[expandKey] === true
  var head = react.createElement(
    'div',
    { className: 'pv_edRow', key: 'head' },
    react.createElement('input', {
      type: 'checkbox',
      checked: row.served,
      onChange: function (ev: FieldEvent) {
        var next = (ev.target as unknown as { checked?: boolean }).checked === true
        update(routeId, { ...editor, rows: patchModelRow(editor.rows, row.id, { served: next }) })
      },
    }),
    react.createElement('span', { className: 'pv_edId', title: row.id }, row.id),
    row.source === 'declared' ? react.createElement('span', { className: 'pv_edTag' }, '自定义') : null,
    react.createElement(
      'button',
      {
        type: 'button',
        className: 'pv_edCaret',
        title: isOpen ? '收起参数' : '改参数',
        onClick: function () { toggleExpand(expandKey) },
      },
      isOpen ? '▾' : '▸',
    ),
  )
  var children: unknown[] = [head]
  if (isOpen) {
    children.push(
      react.createElement(
        'div',
        { className: 'pv_edFields', key: 'fields' },
        react.createElement(
          'label',
          { className: 'pv_edField' },
          '名称',
          react.createElement('input', {
            className: 'pv_field',
            value: row.name,
            onChange: function (ev: FieldEvent) {
              update(routeId, { ...editor, rows: patchModelRow(editor.rows, row.id, { name: ev.target.value }) })
            },
          }),
        ),
        react.createElement(
          'label',
          { className: 'pv_edField' },
          '上下文窗口',
          react.createElement('input', {
            className: 'pv_field',
            placeholder: '留空 = 用默认值',
            value: row.contextWindow,
            onChange: function (ev: FieldEvent) {
              update(routeId, { ...editor, rows: patchModelRow(editor.rows, row.id, { contextWindow: ev.target.value }) })
            },
          }),
        ),
        react.createElement(
          'label',
          { className: 'pv_edField' },
          '最大输出',
          react.createElement('input', {
            className: 'pv_field',
            placeholder: '留空 = 用默认值',
            value: row.maxTokens,
            onChange: function (ev: FieldEvent) {
              update(routeId, { ...editor, rows: patchModelRow(editor.rows, row.id, { maxTokens: ev.target.value }) })
            },
          }),
        ),
        react.createElement(
          'div',
          { className: 'pv_edField' },
          '输入模态',
          react.createElement(
            'span',
            { className: 'pv_hint' },
            row.input === undefined || row.input.length === 0 ? '未知（不写这个字段）' : row.input.join(' + '),
          ),
        ),
      ),
    )
  }
  return react.createElement(
    'div',
    { className: 'pv_edItem' + (row.served ? '' : ' pv_edItemOff'), key: 'ed-' + row.id },
    children,
  )
}

/**
 * 「添加供应商」下拉里一项的状态：已配置**且密钥在**才禁选。
 * 路由配好了但还没密钥（插件自带 config 就声明了 deepseek 这种）仍可选中——选中它就是走一遍
 * 表单把密钥存进去，否则用户既加不了新的、也补不了那一条缺的 key。
 */
export function presetPickState(preset: ProviderPreset): { disabled: boolean; tag: string | null } {
  if (preset.configured !== true) return { disabled: false, tag: null }
  if (preset.missingKey === true) return { disabled: false, tag: t('prov.presetMissingKey') }
  return { disabled: true, tag: t('prov.presetConfigured') }
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
  var lines = [t('yaml.header'), account.id + ':']
  if (typeof account.displayName === 'string' && account.displayName !== '') lines.push('  displayName: ' + account.displayName)
  if (typeof account.api === 'string' && account.api !== '') lines.push('  api: ' + account.api)
  if (typeof account.baseUrl === 'string' && account.baseUrl !== '') lines.push('  baseURL: ' + account.baseUrl)
  if (typeof account.apiKeyEnv === 'string' && account.apiKeyEnv !== '') {
    lines.push('  apiKeyEnv: ' + account.apiKeyEnv)
    lines.push(t('yaml.credNote'))
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
  return t('err.unknown')
}

/**
 * 添加 provider：选预设 → 填密钥/端点 → 测试 → 通过才能添加。
 * 测试走官方 llm/discoverModels 草稿探测（不落盘）；写入走官方同一套控制器
 * （settings/mutate 写 llm-pi-ai.providers 段 + credentials/set 存密钥），
 * 与官方 Models 页的存储完全同源。
 */
function AddProviderPanel(props: AddProviderPanelProps) {
  var presets: ProviderPreset[] = Array.isArray(props.presets) ? props.presets : []
  var detailsIndex = props.details !== undefined && props.details !== null ? props.details : null
  var openState = react.useState(false)
  var open = openState[0]
  var setOpen = openState[1]
  var formState = react.useState({ presetId: '', routeId: '', key: '', baseURL: '', api: '', apiKeyEnv: '', websiteUrl: undefined })
  var form = formState[0]
  var setForm = formState[1]
  // 「发现模型」成功时把发现的模型一并留下：自定义网关（目录外路由）在 settings/mutate 时
  // 必须带 models 清单，否则官方校验直接拒绝（"resolves no models"）
  var testState = react.useState({ phase: 'idle', message: '', models: [] as { id: string; name?: string; ctx?: number; max?: number; input?: string[] }[] })
  var test = testState[0]
  var setTest = testState[1]
  // 发现的模型的勾选态（id → 是否加入）；用户要求：发现模型后弹出清单供选择，不自动全加
  var modelPickState = react.useState({} as AnyRecord)
  var modelPick = modelPickState[0]
  var setModelPick = modelPickState[1]
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
      // presetId 单独记「选中的是哪个预设」：customPicked 靠它判断。此前用 routeId 反查，
      // 用户一改自定义路由 ID，反查就落空，输入框立刻变回只读——字打到一半就被锁死
      presetId: preset.id,
      // 自定义网关（custom: true）的路由 ID 是「建议值」不是预填值：留空让用户输入，
      // 输入框里以 placeholder 展示建议（custom-gateway），一旦输入即覆盖（对齐密钥框行为）
      routeId: preset.custom === true ? '' : preset.id,
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
    // 路由 ID 留空时（自定义网关的建议值形态）不拦测试——探测的是端点+密钥，
    // provider 名只是请求里的标签，用预设建议值顶上即可
    var providerId = form.routeId.trim() !== '' ? form.routeId.trim() : (pickedPreset !== undefined ? pickedPreset.id : '')
    if (providerId === '' || form.baseURL.trim() === '' || form.key.trim() === '') {
      setTest({ phase: 'fail', message: t('prov.addManualHint') })
      return
    }
    setTest({ phase: 'run', message: t('prov.testing') })
    apiCall('llm/discoverModels', {
      settingsNs: 'llm-pi-ai',
      request: {
        provider: providerId,
        baseURL: form.baseURL.trim(),
        api: form.api,
        apiKey: form.key.trim(),
      },
    })
      .then(function (value) {
        var models = Array.isArray(value) ? value : (value !== null && typeof value === 'object' && Array.isArray(value.models) ? value.models : [])
        var names = []
        // 网关的 /models 一般只回 id；有的（openrouter 这类）会附带 contextWindow /
        // inputModalities——有就带上，发现清单能多显示一列是一列
        var discovered: { id: string; name?: string; ctx?: number; max?: number; input?: string[] }[] = []
        for (var i = 0; i < models.length; i += 1) {
          var m = models[i]
          var mid = typeof m === 'string' ? m : String((m && (m.id || m.name)) || '')
          if (mid === '') continue
          if (typeof m === 'string') {
            discovered.push({ id: mid })
          } else {
            var rec = m as AnyRecord
            var entry: { id: string; name?: string; ctx?: number; max?: number; input?: string[] } = { id: mid }
            if (rec['name'] !== undefined && rec['name'] !== null && String(rec['name']) !== '') entry.name = String(rec['name'])
            var ctxRaw = rec['contextWindow'] !== undefined ? rec['contextWindow'] : rec['context_length']
            if (typeof ctxRaw === 'number' && ctxRaw > 0) entry.ctx = ctxRaw
            var maxRaw = rec['maxTokens'] !== undefined ? rec['maxTokens'] : rec['max_output_tokens']
            if (typeof maxRaw === 'number' && maxRaw > 0) entry.max = maxRaw
            var input = rec['inputModalities'] !== undefined ? rec['inputModalities'] : rec['input']
            if (Array.isArray(input)) entry.input = input.filter(function (x: unknown) { return typeof x === 'string' })
            discovered.push(entry)
          }
          if (names.length < 3) names.push(typeof m === 'string' ? m : String((m && (m.name || m.id)) || '?'))
        }
        setTest({
          phase: 'ok',
          message: names.length === 0
            ? tf('prov.testOk', { count: models.length })
            : tf('prov.testOkNames', {
              count: models.length,
              names: models.length > 3
                ? tf('prov.testOkMore', { names: names.join('、') })
                : names.join('、'),
            }),
          models: discovered,
        })
        // 发现后默认全部勾选，由用户逐个取消（用户要求：弹出清单供选择，不自动全加）
        var initialPick: AnyRecord = {}
        for (var pi = 0; pi < discovered.length; pi += 1) initialPick[discovered[pi].id] = true
        setModelPick(initialPick)
      })
      .catch(function (cause) {
        setTest({ phase: 'fail', message: '✗ ' + String(cause && cause.message ? cause.message : cause), models: [] })
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
    var routeId = form.routeId.trim()
    if (routeId === '') {
      // 自定义网关的路由 ID 是建议值形态（留空待填），空着就添加会写出残缺路由
      setNote(t('prov.routeIdRequired'))
      return
    }
    setBusy(true)
    setNote(null)
    var existed = isRouteConfigured(presets, routeId)
    var ops = providerSaveOps(routeId, form)
    // 目录外的自定义网关必须带 models 清单（官方校验：catalog 不描述这条路由时，
    // models 必须列在配置里，否则 "resolves no models" 整体拒绝——StepFun 就是它）。
    // 「发现模型」成功后弹出的清单里，只把用户勾选的写进去（条目 {id, name?}，
    // 上下文/输出由路由默认值兜底 262144 / 32768）。
    // 已存在的路由不动它的 models（避免覆盖手写清单），走逐模型编辑器改。
    if (existed !== true && Array.isArray(test.models) && test.models.length > 0) {
      var chosen = test.models.filter(function (m: { id: string; name?: string; ctx?: number; max?: number; input?: string[] }) {
        return modelPick[m.id] !== false
      })
      if (chosen.length === 0) {
        setNote(t('prov.pickSomeModels'))
        return
      }
      ops = ops.concat([{
        op: 'set',
        path: ['providers', routeId, 'models'],
        value: chosen.map(function (m: { id: string; name?: string }) {
          return m.name !== undefined ? { id: m.id, name: m.name } : { id: m.id }
        }),
      }])
    }
    apiCall('settings/mutate', { ns: 'llm-pi-ai', ops: ops })
      .then(function () {
        return apiCall('credentials/set', { ref: form.apiKeyEnv.trim(), value: form.key.trim() })
      })
      .then(function () {
        setNote(existed ? tf('prov.updated', { id: routeId }) : tf('prov.added', { id: routeId }))
        setTest({ phase: 'idle', message: '' })
        patchForm({ key: '' })
        if (typeof props.onAdded === 'function') props.onAdded()
      })
      .catch(function (cause) {
        setNote(tf('prov.addFailed', { reason: cause && cause.message ? cause.message : cause }))
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
  var pickedPreset = findById(presets, form.presetId !== '' ? form.presetId : form.routeId)
  var pickedLabel = pickedPreset === undefined ? form.routeId : pickedPreset.label
  var customPicked = pickedPreset !== undefined && pickedPreset.custom === true
  // 自定义网关的建议值：路由 ID 用预设 id（custom-gateway），清空路由后凭据名回落到预设建议值
  var suggestedId = pickedPreset !== undefined && customPicked ? pickedPreset.id : ''
  var suggestedEnv = pickedPreset !== undefined && customPicked ? pickedPreset.apiKeyEnv : ''
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
    pickItems.push(react.createElement('div', { className: 'pv_pickEmpty', key: 'empty' }, t('prov.noMatch')))
  }

  return react.createElement(
    'div',
    { className: 'pv_pc' },
    react.createElement('div', { className: 'pv_pcBody', style: { borderTop: '0', paddingTop: '10px', gap: '6px' } },
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, t('prov.provider')),
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
            react.createElement('span', null, pickedLabel === '' ? t('prov.selectPlaceholder') : pickedLabel),
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
                  placeholder: t('prov.filter'),
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
        react.createElement('span', null, t('prov.routeId')),
        react.createElement('input', {
          className: customPicked ? 'pv_field pv_key' : 'pv_field pv_ro',
          value: form.routeId,
          readOnly: customPicked !== true,
          // 自定义网关：路由 ID 是建议值（placeholder 展示），一旦输入即覆盖；
          // 清空则凭据名回落到预设建议值（CUSTOM_GATEWAY_API_KEY），不产生 _API_KEY 这种残缺名
          placeholder: suggestedId,
          title: customPicked ? t('prov.routeIdHintCustom') : t('prov.routeIdHintFixed'),
          onChange: function (event: FieldEvent) {
            if (customPicked !== true) return
            var next = event.target.value
            if (next.trim() === '') {
              // 清空 = 回到建议状态：凭据名也回落到预设自带的建议值
              patchForm({ routeId: '', apiKeyEnv: suggestedEnv })
              return
            }
            patchForm({ routeId: next, apiKeyEnv: next.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY' })
          },
        }),
      ),
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, t('prov.apiKey')),
        react.createElement('input', {
          className: 'pv_field pv_key',
          type: 'password',
          // 不放 sk-… 占位：自定义网关的密钥格式不一定是 sk 开头，别误导（用户要求）
          value: form.key,
          onChange: function (event: FieldEvent) { patchForm({ key: event.target.value }) },
        }),
        form.websiteUrl === undefined
          ? null
          : react.createElement('a', { className: 'pv_pcLink', href: form.websiteUrl, target: '_blank', rel: 'noreferrer', style: { marginLeft: '8px' } }, t('prov.keyLink')),
      ),
      react.createElement(
        'div',
        { className: 'pv_line pv_row' },
        react.createElement('span', null, t('prov.apiBase')),
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
        react.createElement('span', null, t('prov.protocol')),
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
        react.createElement('span', { className: 'pv_hint' }, tf('prov.credStoredAs', { ref: form.apiKeyEnv })),
      ),
      react.createElement(
        'div',
        { className: 'pv_actRow' },
        react.createElement('button', { type: 'button', className: 'pv_action', style: { marginLeft: '0' }, disabled: test.phase === 'run', onClick: runTest },
          test.phase === 'run' ? t('prov.discovering') : t('prov.discover')),
        react.createElement('button', {
          type: 'button',
          className: 'pv_action',
          disabled: busy || test.phase !== 'ok',
          title: test.phase === 'ok' ? '' : t('prov.needTestFirst'),
          onClick: add,
        }, busy ? t('prov.adding') : t('prov.addToList')),
        react.createElement('button', { type: 'button', className: 'pv_action', style: { marginLeft: 'auto' }, onClick: function () { setOpen(false); setTest({ phase: 'idle', message: '' }); setNote(null) } }, t('prov.cancel')),
      ),
      test.message === ''
        ? null
        : react.createElement('div', { className: 'plan_note' + (test.phase === 'fail' ? ' plan_badText' : '') }, test.message),
      // 发现模型后弹出可勾选清单（用户要求）：默认全勾，不想要的取消勾选，
      // 「添加到列表」只写勾选中的。排版与逐模型编辑器同一套表格（勾选 | 模型 ID |
      // 能力 | 上下文 | 最大输出）；能力/上下文优先用网关 /models 自带的元数据，没有就
      // 跨 provider 查 pi-ai 目录同名模型（官方参数），再没有就显示「—」（用户要求）
      test.phase === 'ok' && test.models.length > 0
        ? (function () {
            var allPicked = test.models.every(function (m: { id: string }) { return modelPick[m.id] !== false })
            function pickAll(picked: boolean) {
              var next: AnyRecord = {}
              for (var pi = 0; pi < test.models.length; pi += 1) next[test.models[pi].id] = picked
              setModelPick(next)
            }
            var rows = test.models.map(function (m: { id: string; name?: string; ctx?: number; max?: number; input?: string[] }) {
              // 元数据：网关自报优先，其次跨 provider 查 pi-ai 目录同名模型（只认 source==='pi-ai'）
              var detail = lookupDetailAnySource(detailsIndex, m.id)
              var vision = m.input !== undefined ? m.input.indexOf('image') !== -1 : (detail !== undefined && detail.vision === true)
              var video = m.input !== undefined ? m.input.indexOf('video') !== -1 : (detail !== undefined && detail.video === true)
              var reasoning = detail !== undefined && detail.reasoning === true
              var ctxText = m.ctx !== undefined ? formatContext(m.ctx) : (detail !== undefined && detail.source === 'pi-ai' ? formatContext(detail.contextWindow) : undefined)
              var maxText = m.max !== undefined ? formatContext(m.max) : (detail !== undefined && detail.source === 'pi-ai' ? formatContext(detail.maxTokens) : undefined)
              var caps: unknown[] = []
              if (vision === true) caps.push(react.createElement('span', { key: 'v', className: 'pv_capMini pv_capVision' }, '视觉'))
              if (video === true) caps.push(react.createElement('span', { key: 'd', className: 'pv_capMini pv_capVideo' }, '视频'))
              if (reasoning === true) caps.push(react.createElement('span', { key: 'r', className: 'pv_capMini pv_capReason' }, '推理'))
              return react.createElement(
                'div',
                { className: 'pv_meRow', key: m.id },
                react.createElement('input', {
                  type: 'checkbox',
                  className: 'pv_meCheck',
                  checked: modelPick[m.id] !== false,
                  onChange: function () {
                    setModelPick(function (prev: AnyRecord) { return withKeys(prev, { [m.id]: modelPick[m.id] === false }) })
                  },
                }),
                react.createElement(
                  'span',
                  { className: 'pv_mId', title: m.name !== undefined && m.name !== m.id ? m.name : m.id },
                  m.id,
                  m.name !== undefined && m.name !== '' && m.name !== m.id
                    ? react.createElement('span', { className: 'pv_modelPickName' }, m.name)
                    : null,
                ),
                react.createElement('span', { className: 'pv_mCaps' }, caps.length > 0 ? caps : [react.createElement('span', { key: 'none', className: 'pv_pickNone' }, '—')]),
                react.createElement('span', { className: 'pv_mCtx' }, ctxText !== undefined ? ctxText : '—'),
                react.createElement('span', { className: 'pv_mMax' }, maxText !== undefined ? maxText : '—'),
              )
            })
            return react.createElement(
              'div',
              { className: 'pv_modelPick' },
              react.createElement(
                'div',
                { className: 'pv_meHeadRow' },
                react.createElement('span', null,
                  react.createElement('input', {
                    type: 'checkbox',
                    className: 'pv_meCheck',
                    checked: allPicked,
                    title: allPicked ? '全不选' : '全选',
                    onChange: function () { pickAll(allPicked !== true) },
                  }),
                ),
                react.createElement('span', { style: { fontFamily: 'inherit' } }, t('prov.modelId')),
                react.createElement('span', null, t('prov.caps')),
                react.createElement('span', null, t('prov.ctx')),
                react.createElement('span', null, t('cap.maxTokens')),
              ),
              rows,
            )
          })()
        : null,
      !note ? null : react.createElement('div', { className: 'plan_note' }, note),
    ),
  )
}

/**
 * 逐模型编辑器的一行：列序固定（勾选 | 模型 ID | 能力 | 上下文 | 最大输出 | 移除），
 * 与表头共用同一套网格列宽，逐列严格对齐。不设名称列——模型 ID 本身就是唯一标识，
 * 单行省略号截断（title 兜底）。所有行都只读展示（目录条目与自定义条目同款外观，
 * 自定义条目要改参数就 ✕ 掉重新添加）——清单只做新增与移除。
 *
 * 勾选语义（回归草稿制）：勾选 / 取消只改草稿，点「保存」一次性写入 settings.yaml；
 * ✕ 只出现在「添加模型」加进来的行上（本会话新加的 + 路由声明里已有的条目），
 * 目录候选行没有 ✕——不想要就不勾。
 */
function modelEditRow(
  row: ModelEditRow,
  _patch: (id: string, next: AnyRecord) => void,
  remove: (id: string) => void,
  onToggle: (row: ModelEditRow, checked: boolean) => void,
  busy: boolean,
) {
  var known = row.known === true
  // 能力列：统一只读徽章（与显示清单同款）。推理标记：目录条目来自元数据，
  // 自定义条目来自添加表单的勾选（保存时写进声明条目的 reasoning: true）。
  var caps = [
    row.vision === true ? react.createElement('span', { key: 'v', className: 'pv_capMini pv_capVision', title: known ? '目录元数据：支持图片输入' : '添加时勾选：支持图片输入' }, '视觉') : null,
    row.video === true ? react.createElement('span', { key: 'd', className: 'pv_capMini pv_capVideo', title: known ? '目录元数据：支持视频输入' : '添加时勾选：支持视频输入' }, '视频') : null,
    (row.knownReasoning === true || row.reasoning === true) ? react.createElement('span', { key: 'r', className: 'pv_capMini pv_capReason', title: known ? '目录元数据：支持思维链' : '添加时勾选：支持思维链（声明条目写 reasoning: true）' }, '推理') : null,
  ]
  return react.createElement(
    'div',
    { className: 'pv_meRow' + (row.enabled ? '' : ' pv_meRowOff'), key: row.id },
    react.createElement('input', {
      type: 'checkbox',
      className: 'pv_meCheck',
      checked: row.enabled,
      disabled: busy,
      title: '勾选 / 取消只改草稿，点「保存」后写入 settings.yaml',
      onChange: function (event: FieldEvent) { onToggle(row, event.target.checked === true) },
    }),
    react.createElement(
      'span',
      { className: 'pv_meIdBox' },
      react.createElement('span', { className: 'pv_mId', title: row.id }, row.id),
    ),
    react.createElement('span', { className: 'pv_mCaps' }, caps),
    // 上下文 / 最大输出统一只读展示：目录条目显示元数据值，自定义条目显示添加时填的值
    react.createElement('span', { className: 'pv_mCtx', title: '上下文窗口' }, known ? (formatContext(row.knownContextWindow) ?? '') : (formatContext(parsePositiveInt(row.contextWindow)) ?? '')),
    react.createElement('span', { className: 'pv_mMax', title: '最大输出' }, known ? (formatContext(row.knownMaxTokens) ?? '') : (formatContext(parsePositiveInt(row.maxTokens)) ?? '')),
    // ✕ 只给「pi-ai 目录之外」的行：known 只说明"有元数据可显示"，元数据可能是 declared
    // （settings 声明兜底）或 adapter（网关自报）——这些目录外条目同样必须有 ✕（用户要求：
    // 手写进 settings.yaml 的自定义 id 目录没收录，也必须能删）。pi-ai 目录收录的（inPiAi）
    // 不配 ✕——不想要取消勾选即可。
    row.inPiAi !== true
      ? react.createElement('button', {
          type: 'button',
          className: 'pv_iconBtn',
          disabled: busy,
          title: '把这条自定义模型从清单里删掉（点「保存」后生效）',
          onClick: function () { remove(row.id) },
        }, '✕')
      : null,
  )
}

/**
 * 「添加模型」表单留空时的默认值，三级优先（用户批注定的策略）：
 *   ① 精确匹配：pi-ai 目录（source==='pi-ai'，全量元数据不分 provider）里有同 id 条目 →
 *      用它的官方 contextWindow / maxTokens（跨供应商同名模型就是官方参数）；
 *   ② 没有精确匹配：按目录已知模型的「最小档」填——保守，宁可窗口偏小也别虚报导致上游拒绝；
 *   ③ 连已知模型都没有：回退保守常数 131072 / 8192。
 * ①② 都只认 source==='pi-ai' 的目录值：declared（settings 声明兜底）/ adapter（网关自报，
 * 比如 opencode 给 deepseek-v4.1-flash 报 203K）不是官方参数，不能当默认值——用户报过
 * 「自动填的 203K 不对，应该是 1M」，根因就是适配器自报值混进了默认值链。
 * 导出供离线测试钉住（精确匹配 / 最小档 / 常数回退 / 非法值忽略）。
 */
export function resolveAddDefaults(
  rows: ModelEditRow[],
  modelId: string,
  details: Record<string, ModelDetail> | undefined | null,
): { ctx: string; max: string } {
  // ① 精确匹配：pi-ai 目录（source==='pi-ai'，不分 provider）里同 id 的条目 → 官方参数。
  //    多条同名时取各维度的最小值，保守且确定。
  var exactCtx: number | undefined = undefined
  var exactMax: number | undefined = undefined
  if (details !== null && details !== undefined && modelId !== '') {
    var ctxs: number[] = []
    var maxs: number[] = []
    for (var dk in details) {
      var d = details[dk]
      if (d === null || d === undefined || d.id !== modelId) continue
      if (d.source !== 'pi-ai') continue
      if (typeof d.contextWindow === 'number' && d.contextWindow > 0) ctxs.push(d.contextWindow)
      if (typeof d.maxTokens === 'number' && d.maxTokens > 0) maxs.push(d.maxTokens)
    }
    if (ctxs.length > 0) exactCtx = Math.min.apply(null, ctxs)
    if (maxs.length > 0) exactMax = Math.min.apply(null, maxs)
  }
  // ② 目录已知模型（source==='pi-ai'）里的最小档：虚报大窗口会让超长输入打到上游才被拒，
  //    最小档是最不误导的默认。declared/adapter 行的手填/自报值不进这个池子。
  var tierCtx: number | undefined = undefined
  var tierMax: number | undefined = undefined
  for (var i = 0; i < rows.length; i += 1) {
    var r = rows[i]
    if (r.inPiAi !== true) continue
    if (typeof r.knownContextWindow === 'number' && r.knownContextWindow > 0 && (tierCtx === undefined || r.knownContextWindow < tierCtx)) tierCtx = r.knownContextWindow
    if (typeof r.knownMaxTokens === 'number' && r.knownMaxTokens > 0 && (tierMax === undefined || r.knownMaxTokens < tierMax)) tierMax = r.knownMaxTokens
  }
  var ctx = exactCtx !== undefined ? exactCtx : tierCtx !== undefined ? tierCtx : 131072
  var max = exactMax !== undefined ? exactMax : tierMax !== undefined ? tierMax : 8192
  return { ctx: String(ctx), max: String(max) }
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === null) return undefined
  var trimmed = String(raw).trim()
  if (trimmed === '') return undefined
  var num = Number(trimmed)
  if (!isFinite(num) || Math.floor(num) !== num || num <= 0) return undefined
  return num
}

/** 编辑器初始行：当前生效的目录模型 + 目录里该 provider 的全部模型 + 路由声明过的模型。 */
/** 导出供离线测试钉住初始勾选语义（跟随目录勾目录快照 / 自定义清单只勾声明条目）。 */
export function buildEditRows(
  account: PlanAccount,
  catalog: CatalogModel[],
  details: Record<string, ModelDetail> | undefined | null,
): ModelEditRow[] {
  var declared = Array.isArray(account.models) ? account.models : []
  var followingCatalog = declared.length === 0
  var rows: ModelEditRow[] = []
  var seen: AnyRecord = {}
  function add(id: string, name: string, detail: ModelDetail | undefined, entry: DeclaredModel | undefined, inCatalog: boolean) {
    if (id === '' || seen[id] === true) return
    seen[id] = true
    var declaredInput: string[] = entry !== undefined && Array.isArray(entry.input) ? entry.input : []
    rows.push({
      id: id,
      name: name,
      // 勾选 = 当前真正生效的模型：
      //   声明过的条目（第一来源）恒勾；
      //   配了 models（自定义清单）→ 其余行只勾声明过的；
      //   没配 models（跟随目录）→ 只有「目录快照」里的在生效——pi-ai 跟随的是目录，
      //   不是元数据库里的全量历史模型。所以目录行全勾，元数据补进来的候选行**不勾**：
      //   此前把候选也全勾，编辑器报「当前已添加17个」而卡片头是「模型 (3)」，对不上
      //   （深度求索官方路由，用户报的就是它；最早那版「一个都不勾」的修正仍然保留）。
      enabled: entry !== undefined ? true : followingCatalog ? inCatalog : declared.some(function (item) { return item.id === id }),
      contextWindow: entry !== undefined && entry.contextWindow !== undefined ? String(entry.contextWindow) : '',
      maxTokens: entry !== undefined && entry.maxTokens !== undefined ? String(entry.maxTokens) : '',
      vision: detail !== undefined ? detail.vision === true : declaredInput.indexOf('image') !== -1,
      video: detail !== undefined ? detail.video === true : declaredInput.indexOf('video') !== -1,
      known: detail !== undefined,
      // 目录收录与否只认详情来源：declared（settings 声明兜底）/ adapter（适配器自报，如网关
      // 上报的新 id）都不算「pi-ai 目录里有」——目录外的行必须给 ✕（用户要求）
      inPiAi: detail !== undefined && detail.source === 'pi-ai',
      knownContextWindow: detail === undefined ? undefined : detail.contextWindow,
      knownMaxTokens: detail === undefined ? undefined : detail.maxTokens,
      knownReasoning: detail !== undefined && detail.reasoning === true,
      originVision: detail !== undefined ? detail.vision === true : declaredInput.indexOf('image') !== -1,
      originVideo: detail !== undefined ? detail.video === true : declaredInput.indexOf('video') !== -1,
      declared: entry,
    })
  }
  // 1. 声明过的（含别名 id）优先占位；2. 当前生效目录；3. 目录里该 provider 的全量候选
  for (var d = 0; d < declared.length; d += 1) {
    var entry = declared[d]
    if (entry === null || typeof entry !== 'object') continue
    var entryId = typeof entry.id === 'string' ? entry.id : ''
    if (entryId === '') continue
    var entryDetail = lookupDetail(details, account.id, entryId)
    add(entryId, entry.name !== undefined ? String(entry.name) : (entryDetail !== undefined && entryDetail.name !== undefined ? entryDetail.name : entryId), entryDetail, entry, false)
  }
  for (var c = 0; c < catalog.length; c += 1) {
    var model = catalog[c]
    add(model.id, model.name, lookupDetail(details, account.id, model.id), undefined, true)
  }
  var own = detailsOfProvider(details, account.id)
  for (var o = 0; o < own.length; o += 1) {
    if (typeof own[o].id !== 'string') continue
    add(own[o].id as string, own[o].name === undefined ? String(own[o].id) : String(own[o].name), own[o], undefined, false)
  }
  return rows
}

/**
 * 逐模型清单编辑器（本地版新增，实现 issue #1）。
 *
 * 官方 Models 页被本插件禁用（cordis.patch.yml），而它独有的「逐模型清单编辑」没有替代，
 * 于是「只想留 DeepSeek 三个模型里的一个」这类需求在界面上无处可做。这里补上：
 * 勾选 / 取消 / ✕ / 添加模型都只改草稿，点「保存」→ 写 settings 的 `llm-pi-ai.providers.<id>.models`（与官方 Models 页同一条写路径，
 * 官方 adapter 的 resolveRouteModels 认这个键，`models` 非空就替换整份服务目录）。
 *
 * 语义（回归草稿制）：
 *   勾选 / 取消 / ✕ / 添加模型 —— 都只改草稿，不落盘；
 *   保存 —— 把草稿里勾上的行一次性写 settings 的 `llm-pi-ai.providers.<id>.models`（与官方 Models 页同一条写路径），
 *       目录里没有的自定义 ID 也要带上下文/最大输出（官方 strict 校验会拒），表单留空会按已知模型最大值自动补默认（resolveAddDefaults），填了按填的；
 *   ✕ —— 只在「添加模型」加进来的行上（本会话新加的 + 路由声明里已有的条目），目录候选行不配 ✕；
 *   还原清单按钮已删（用户要求）——要回到跟随目录需手改 settings.yaml 删掉 models 键。
 */
function ModelListEditor(props: {
  account: PlanAccount
  catalog: CatalogModel[]
  details: Record<string, ModelDetail> | undefined | null
  onSaved: (message: string) => void
  onClose: () => void
}) {
  var account = props.account
  var rowsState = react.useState(function () { return buildEditRows(account, props.catalog, props.details) })
  var rows = rowsState[0] as ModelEditRow[]
  var setRows = rowsState[1] as (updater: (prev: ModelEditRow[]) => ModelEditRow[]) => void
  var busyState = react.useState(false)
  var busy = busyState[0] as boolean
  var setBusy = busyState[1] as (next: boolean) => void
  var errorState = react.useState(null)
  var error = errorState[0] as string | null
  var setError = errorState[1] as (next: string | null) => void
  var enabledCount = rows.filter(function (r) { return r.enabled === true }).length
  // 「添加模型」表单（仿添加供应商：点按钮浮出填写面板，各参数一次填全）。
  // testModel = 「测试」按钮的状态（像添加供应商一样，保存前先验证端点真的供这个模型）
  var testModelState = react.useState({ phase: 'idle', message: '' })
  var testModel = testModelState[0] as { phase: string; message: string }
  var setTestModel = testModelState[1] as (next: { phase: string; message: string }) => void
  var formState = react.useState(function () { return { open: false, id: '', name: '', ctx: '', max: '', vision: false, video: false, reasoning: false } })
  var form = formState[0] as { open: boolean; id: string; name: string; ctx: string; max: string; vision: boolean; video: boolean; reasoning: boolean }
  var setForm = formState[1] as (updater: (prev: typeof form) => typeof form) => void
  var emptyForm = function () { return { open: false, id: '', name: '', ctx: '', max: '', vision: false, video: false, reasoning: false } }

  function patch(id: string, next: AnyRecord) {
    setRows(function (prev) {
      return prev.map(function (row) {
        return row.id === id ? withKeys(row as unknown as AnyRecord, next) as unknown as ModelEditRow : row
      })
    })
  }
  function remove(id: string) {
    setRows(function (prev) {
      return prev.filter(function (row) { return row.id !== id })
    })
  }
  /** 表单「添加」：校验通过就追加一行自定义条目（默认勾上，保存后才生效）。
   *  上下文/最大输出留空 = 自动按清单里已知模型的最大值填默认（没有已知值则回退保守值），
   *  填进行里随时可改；填了但不是正整数才拦。 */
  function addFromForm() {
    var id = form.id.trim()
    if (id === '') { setError('先填模型 ID'); return }
    var exists = false
    for (var i = 0; i < rows.length; i += 1) if (rows[i].id === id) exists = true
    if (exists) { setError('「' + id + '」已经在清单里了'); return }
    if (lookupDetail(props.details, account.id, id) !== undefined) { setError('「' + id + '」已在 pi-ai 目录里，直接在清单里勾选即可'); return }
    var defaults = resolveAddDefaults(rows, id, props.details)
    var ctxRaw = form.ctx.trim() === '' ? defaults.ctx : form.ctx.trim()
    var maxRaw = form.max.trim() === '' ? defaults.max : form.max.trim()
    var ctxNum = Number(ctxRaw)
    if (!isFinite(ctxNum) || Math.floor(ctxNum) !== ctxNum || ctxNum <= 0) { setError('上下文窗口要填正整数'); return }
    var maxNum = Number(maxRaw)
    if (!isFinite(maxNum) || Math.floor(maxNum) !== maxNum || maxNum <= 0) { setError('最大输出要填正整数'); return }
    var name = form.name.trim()
    setRows(function (prev) {
      return prev.concat([{
        id: id,
        name: name !== '' ? name : id,
        enabled: true,
        contextWindow: String(ctxNum),
        maxTokens: String(maxNum),
        vision: form.vision === true,
        video: form.video === true,
        known: false,
        inPiAi: false,
        knownContextWindow: undefined,
        knownMaxTokens: undefined,
        knownReasoning: false,
        originVision: form.vision === true,
        originVideo: form.video === true,
        declared: undefined,
        added: true,
        reasoning: form.reasoning === true,
      }])
    })
    setForm(emptyForm)
    setError(null)
  }

  /**
   * 「测试」：像添加供应商的测试一样，保存前先验证端点真的在供这个模型。
   * 走插件宿主的 /provider/test-model——宿主用凭据仓库里的 key 请求端点的模型清单，
   * key 不出宿主；浏览器只拿到「端点共 N 个模型，含不含这个 id」。
   */
  function testAddModel() {
    var id = form.id.trim()
    if (id === '') { setError('先填模型 ID'); return }
    setTestModel({ phase: 'run', message: t('prov.testing') })
    postJson('/provider/test-model', { providerId: account.id, modelId: id })
      .then(function (res) {
        if (res === null || res === undefined || res.ok !== true) {
          setTestModel({ phase: 'fail', message: '✗ ' + String((res && res.error) || '未知错误') })
          return
        }
        setTestModel({
          phase: res.served === true ? 'ok' : 'fail',
          message: res.served === true
            ? '✓ ' + tf('prov.testModelYes', { total: String(res.total ?? ''), id: id })
            : '✗ ' + tf('prov.testModelNo', { total: String(res.total ?? ''), id: id }),
        })
      })
      .catch(function (cause) {
        setTestModel({ phase: 'fail', message: '✗ ' + String(cause && cause.message ? cause.message : cause) })
      })
  }

  /**
   * 给定行列表 → settings 的 models 数组；形状不合法时返回 undefined 并写好错误提示。
   *
   * 清单只做「新增 / 移除」，不改现有条目的字段：
   *   现有条目（路由声明过的 / 目录收录的）——原样保留：声明过的整条带回去，目录收录的只写 {id}；
   *   自定义条目（目录里没有）——上下文 / 最大输出必填，能力开关写进 input 模态。
   */
  function payloadFrom(list: ModelEditRow[]): DeclaredModel[] | undefined {
    var out: DeclaredModel[] = []
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i]
      if (row.enabled !== true) continue
      if (row.declared !== undefined) {
        out.push({ ...row.declared, id: row.id })
        continue
      }
      if (row.known === true) {
        out.push({ id: row.id })
        continue
      }
      var ctx = row.contextWindow.trim()
      if (ctx === '') { setError('自定义模型「' + row.id + '」要填上下文窗口'); return undefined }
      var ctxNum = Number(ctx)
      if (!isFinite(ctxNum) || Math.floor(ctxNum) !== ctxNum || ctxNum <= 0) { setError('「' + row.id + '」的上下文窗口要填正整数'); return undefined }
      var max = row.maxTokens.trim()
      if (max === '') { setError('自定义模型「' + row.id + '」要填最大输出'); return undefined }
      var maxNum = Number(max)
      if (!isFinite(maxNum) || Math.floor(maxNum) !== maxNum || maxNum <= 0) { setError('「' + row.id + '」的最大输出要填正整数'); return undefined }
      var input = ['text']
      if (row.vision === true) input.push('image')
      if (row.video === true) input.push('video')
      // 键序按 settings.yaml 惯例：id、name、contextWindow、maxTokens、input
      var entry: DeclaredModel = { id: row.id }
      // 表单里填了显示名（且不等于 ID）才写 name，避免冗余字段进 settings.yaml
      if (typeof row.name === 'string' && row.name !== '' && row.name !== row.id) entry.name = row.name
      entry.contextWindow = ctxNum
      entry.maxTokens = maxNum
      entry.input = input
      if (row.reasoning === true) entry.reasoning = true
      out.push(entry)
    }
    if (out.length === 0) { setError('至少要勾选一个模型（全部不勾的清单无法保存）'); return undefined }
    return out
  }

  function payload(): DeclaredModel[] | undefined {
    return payloadFrom(rows)
  }

  /**
   * 勾选 / 取消只改草稿：点「保存」时把「勾选后的清单」一次性写进 settings.yaml。
   * （曾经做过「勾选即时落盘」，用户要求改回草稿制——见「保存」按钮。）
   */
  function toggleDraft(row: ModelEditRow, checked: boolean) {
    if (busy === true) return
    setRows(function (prev) {
      return prev.map(function (r) {
        return r.id === row.id ? withKeys(r as unknown as AnyRecord, { enabled: checked }) as unknown as ModelEditRow : r
      })
    })
  }

  /** 一键全选 / 全不选（表头复选框）。 */
  function toggleAll(enabled: boolean) {
    if (busy === true) return
    setRows(function (prev) {
      return prev.map(function (r) {
        return r.enabled === enabled ? r : withKeys(r as unknown as AnyRecord, { enabled: enabled }) as unknown as ModelEditRow
      })
    })
  }

  function submit(models: DeclaredModel[], done: string) {
    setBusy(true)
    setError(null)
    postJson('/provider/set-models', { providerId: account.id, models: models })
      .then(function (res) {
        if (res === null || res === undefined || res.ok !== true) {
          setError('保存失败：' + String((res && res.error) || '未知错误'))
          return
        }
        props.onSaved(done)
        props.onClose()
      })
      .catch(function (cause) {
        setError('保存失败：' + String(cause && cause.message ? cause.message : cause))
      })
      .then(function () { setBusy(false) })
  }

  var rows_ = []
  for (var r = 0; r < rows.length; r += 1) rows_.push(modelEditRow(rows[r], patch, remove, toggleDraft, busy))

  // 列头（模型 ID / 能力 / 上下文 / 最大输出）与数据行共用同一套网格列宽，逐列严格对齐。
  // 表头的复选框 = 一键全选 / 全不选。
  var allEnabled = rows.length > 0
  for (var ar = 0; ar < rows.length; ar += 1) {
    if (rows[ar].enabled !== true) { allEnabled = false; break }
  }
  var colHead = react.createElement(
    'div',
    { className: 'pv_meHeadRow', key: 'colhead' },
    react.createElement('span', { key: 'h-check' },
      react.createElement('input', {
        type: 'checkbox',
        className: 'pv_meCheck',
        checked: allEnabled,
        disabled: busy,
        title: allEnabled ? '全不选' : '全选',
        onChange: function () { toggleAll(allEnabled !== true) },
      }),
    ),
    react.createElement('span', { key: 'h-id', style: { fontFamily: 'inherit' } }, t('prov.modelId')),
    react.createElement('span', { key: 'h-caps' }, t('prov.caps')),
    react.createElement('span', { key: 'h-ctx' }, t('prov.ctx')),
    react.createElement('span', { key: 'h-max' }, t('cap.maxTokens')),
    react.createElement('span', { key: 'h-del' }),
  )

  // 「添加模型」表单：仿添加供应商面板——标签在左、输入在右，同一套 pv_line/pv_row 行样式
  function formRow(label: string, control: unknown, key: string) {
    return react.createElement('div', { className: 'pv_line pv_row', key: key }, react.createElement('span', null, label), control)
  }
  function formField(placeholder: string, value: string, key: string, numeric?: boolean) {
    return react.createElement('input', {
      className: 'pv_field',
      type: 'text',
      inputMode: numeric === true ? 'numeric' : 'text',
      placeholder: placeholder,
      value: value,
      onChange: function (event: FieldEvent) {
        var next = event.target.value
        setForm(function (prev) { return withKeys(prev as unknown as AnyRecord, { [key]: next }) as typeof prev })
      },
    })
  }
  var formEl = form.open !== true ? null : react.createElement(
    'div',
    { className: 'pv_meForm' },
    react.createElement('div', { className: 'pv_meFormTitle' }, '新增自定义模型（保存后才生效）'),
    formRow('模型 ID', formField('目录里没有的自定义 ID', form.id, 'id'), 'f-id'),
    formRow('显示名', formField('留空则同模型 ID', form.name, 'name'), 'f-name'),
    formRow('上下文窗口', formField('留空自动按已知模型填', form.ctx, 'ctx', true), 'f-ctx'),
    formRow('最大输出', formField('留空自动按已知模型填', form.max, 'max', true), 'f-max'),
    react.createElement('div', { className: 'pv_line pv_row', key: 'f-caps' },
      react.createElement('span', null, '能力'),
      react.createElement('span', { className: 'pv_meFormCaps' },
        react.createElement('label', {
          className: 'pv_meCap' + (form.vision ? ' pv_capVision' : ' pv_capOff'),
          title: '声明支持图片输入（写进模型的 input 模态）',
        }, react.createElement('input', {
          type: 'checkbox',
          checked: form.vision,
          onChange: function (event: FieldEvent) {
            var next = event.target.checked === true
            setForm(function (prev) { return withKeys(prev as unknown as AnyRecord, { vision: next }) as typeof prev })
          },
        }), '视觉'),
        react.createElement('label', {
          className: 'pv_meCap' + (form.video ? ' pv_capVideo' : ' pv_capOff'),
          title: '声明支持视频输入（写进模型的 input 模态）',
        }, react.createElement('input', {
          type: 'checkbox',
          checked: form.video,
          onChange: function (event: FieldEvent) {
            var next = event.target.checked === true
            setForm(function (prev) { return withKeys(prev as unknown as AnyRecord, { video: next }) as typeof prev })
          },
        }), '视频'),
        react.createElement('label', {
          className: 'pv_meCap' + (form.reasoning ? ' pv_capReason' : ' pv_capOff'),
          title: '声明支持思维链（声明条目写 reasoning: true）',
        }, react.createElement('input', {
          type: 'checkbox',
          checked: form.reasoning,
          onChange: function (event: FieldEvent) {
            var next = event.target.checked === true
            setForm(function (prev) { return withKeys(prev as unknown as AnyRecord, { reasoning: next }) as typeof prev })
          },
        }), '推理'),
      ),
    ),
    react.createElement('div', { className: 'pv_actRow', key: 'f-acts' },
      react.createElement('button', { type: 'button', className: 'pv_action', style: { marginLeft: '0' }, disabled: busy, onClick: addFromForm }, '添加'),
      react.createElement('button', {
        type: 'button',
        className: 'pv_action',
        style: { marginLeft: '0' },
        disabled: busy || testModel.phase === 'run',
        title: '验证端点真的在供这个模型（用凭据仓库里的 key 请求端点的模型清单，key 不出宿主）',
        onClick: testAddModel,
      }, testModel.phase === 'run' ? '测试中…' : '测试'),
      react.createElement('button', {
        type: 'button',
        className: 'pv_action',
        style: { marginLeft: 'auto' },
        disabled: busy,
        onClick: function () {
          setForm(emptyForm)
          setTestModel({ phase: 'idle', message: '' })
        },
      }, '取消'),
    ),
    testModel.message === ''
      ? null
      : react.createElement('div', { className: 'pv_line', key: 'f-test' }, testModel.message),
  )

  return react.createElement(
    'div',
    { className: 'pv_me' },
    react.createElement(
      'div',
      { className: 'pv_hint' },
      '当前已添加' + String(enabledCount) + '个模型',
    ),
    react.createElement('div', { className: 'pv_meList' }, [colHead].concat(rows_)),
    react.createElement(
      'div',
      { className: 'pv_meActs' },
      react.createElement('button', {
        type: 'button',
        className: 'pv_action',
        style: { marginLeft: '0' },
        disabled: busy,
        title: '新增目录里没有的自定义模型：填 ID / 上下文 / 最大输出等参数',
        onClick: function () {
          setError(null)
          setForm(function (prev) { return withKeys(prev as unknown as AnyRecord, { open: true }) as typeof prev })
        },
      }, '添加模型'),
      react.createElement('button', {
        type: 'button',
        className: 'pv_action',
        style: { marginLeft: 'auto' },
        disabled: busy,
        title: '把草稿里的勾选与增删一次性写入 settings.yaml',
        onClick: function () {
          setError(null)
          var models = payload()
          if (models === undefined) return
          submit(models, '✓ ' + shortName(account) + ' 的模型清单已保存（' + String(models.length) + ' 个）')
        },
      }, busy ? '保存中…' : '保存'),
    ),
    formEl,
    error === null ? null : react.createElement('div', { className: 'plan_note plan_badText' }, error),
  )
}

/**
 * 删除 provider 的确认弹层（本地版新增，实现 issue #3）。
 *
 * 上游第一版是在 ✕ 旁边原地摊开「确认删除 / 取消」两个小按钮：位置就是刚点过的那个槽位，
 * 代价（清掉哪条配置、哪把密钥、影响谁）一句没说，误点一次就等于把一整家供应商拆掉。
 * 这里改成遮罩弹层：把要清的东西逐条列出来，危险按钮单独一个色，取消是默认落点。
 */
function DeleteProviderModal(props: {
  account: PlanAccount
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
  onExport: () => void
}) {
  var account = props.account
  var modelCount = Array.isArray(account.models) ? account.models.length : 0
  var keyRef = typeof account.apiKeyEnv === 'string' && account.apiKeyEnv !== '' ? String(account.apiKeyEnv) : undefined
  var facts = [
    { key: 'id', label: '路由 ID', value: String(account.id) },
    {
      key: 'cfg',
      label: '删除的配置',
      value: 'settings.yaml → llm-pi-ai.providers.' + String(account.id)
        + '（baseURL / 协议' + (modelCount > 0 ? ' / 模型清单 ' + String(modelCount) + ' 个' : '') + ' 一并删除）',
    },
    {
      key: 'key',
      label: '删除的密钥',
      value: keyRef === undefined ? '这条路由没有绑定凭据名' : keyRef + '（凭据仓库里的值一起清掉）',
    },
    {
      key: 'impact',
      label: '影响',
      value: '模型选择器里这家会消失；正在用 ' + shortName(account) + ' 的会话下次落到默认模型',
    },
  ]
  var rows = []
  for (var i = 0; i < facts.length; i += 1) {
    rows.push(react.createElement(
      'div',
      { className: 'pv_modalRow', key: facts[i].key },
      react.createElement('span', { className: 'pv_modalLabel' }, facts[i].label),
      react.createElement('span', { className: 'pv_modalValue' }, facts[i].value),
    ))
  }
  return react.createElement(
    'div',
    {
      className: 'pv_mask',
      onClick: function () { if (props.busy !== true) props.onCancel() },
    },
    react.createElement(
      'div',
      {
        className: 'pv_modal',
        onClick: function (event: MouseEvent) { if (typeof event.stopPropagation === 'function') event.stopPropagation() },
      },
      react.createElement('div', { className: 'pv_modalTitle' }, '删除 provider：' + shortName(account) + '？'),
      rows,
      react.createElement('div', { className: 'pv_modalWarn' }, '删除后需要重新填一遍密钥与端点才能恢复，不能撤销。'),
      props.error === null ? null : react.createElement('div', { className: 'plan_note plan_badText' }, props.error),
      react.createElement(
        'div',
        { className: 'pv_modalActs' },
        // 取消贴弹层内容左缘：pv_action 自带 margin-left:auto，会把取消顶离左边（与导出/删除均分空隙）
        react.createElement('button', { type: 'button', className: 'pv_action', style: { marginLeft: '0' }, disabled: props.busy, onClick: props.onCancel }, t('prov.cancel')),
        react.createElement('button', { type: 'button', className: 'pv_action', disabled: props.busy, onClick: props.onExport }, t('del.exportBtn')),
        react.createElement('button', {
          type: 'button',
          className: 'pv_delYes pv_dangerBtn',
          disabled: props.busy,
          onClick: props.onConfirm,
        }, props.busy === true ? '删除中…' : '删除这条路由'),
      ),
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
  // 用量快照首次加载中：页面刚打开时先给「正在刷新用量…」占位，数据到了才渲染 provider 界面
  var usageWaitState = react.useState(true)
  var usageWait = usageWaitState[0] as boolean
  var setUsageWait = usageWaitState[1]
  var noteState = react.useState(null)
  var note = noteState[0]
  var setNote = noteState[1]
  var busyState = react.useState(false)
  var busy = busyState[0] as boolean
  var setBusy = busyState[1] as (next: boolean) => void
  var tabState = react.useState('providers')
  var tab = tabState[0]
  var setTab = tabState[1]
  var groupsState = react.useState([])
  var catalogGroups = groupsState[0]
  var setCatalogGroups = groupsState[1]
  var detailsState = react.useState({})
  var detailsById = detailsState[0]
  var setDetailsById = detailsState[1]
  var presetsState = react.useState([])
  var presets = presetsState[0]
  var setPresets = presetsState[1]
  // 逐模型清单编辑器：每张卡片一份编辑态（不预建——渲染到那张卡且有目录数据时才建，
  // 否则会把「目录还在加载」的空清单当成用户的编辑结果）。
  var modelEditorsState = react.useState({})
  var modelEditors = modelEditorsState[0]
  var setModelEditors = modelEditorsState[1]
  // 行级展开：key 是 `routeId:modelId`
  var editorOpenState = react.useState({})
  var editorOpen = editorOpenState[0]
  var setEditorOpen = editorOpenState[1]
  // 宿主下发的那份路由原文（含已声明的 models）：编辑要基于它，免得把手写字段丢掉
  var routesState = react.useState({})
  var routesById = routesState[0]
  var setRoutesById = routesState[1]
  var catTickState = react.useState(0)
  var setCatTick = catTickState[1]
  // 删除确认：目标账户 + 进行中 + 失败原因（弹层式二次确认，见 DeleteProviderModal；issue #3）
  var delState = react.useState(null)
  var delTarget = delState[0] as PlanAccount | null
  var setDelTarget = delState[1] as (next: PlanAccount | null) => void
  var delBusyState = react.useState(false)
  var delBusy = delBusyState[0] as boolean
  var setDelBusy = delBusyState[1] as (next: boolean) => void
  var delErrorState = react.useState(null)
  var delError = delErrorState[0] as string | null
  var setDelError = delErrorState[1] as (next: string | null) => void
  var refreshingState = react.useState({})
  var setRefreshing = refreshingState[1]
  // 卡片里"补密钥"的输入草稿与保存中标记（都按 provider id 存）
  var keyDraftState = react.useState({})
  var keyDrafts = keyDraftState[0]
  var setKeyDrafts = keyDraftState[1]
  var savingKeyState = react.useState({})
  var savingKey = savingKeyState[0]
  var setSavingKey = savingKeyState[1]
  // 卡片级编辑（就地编辑，按 provider id 存）：
  //   editForms  —— 表单草稿（没改过的卡没有草稿，字段直接显示 route 快照值）
  //   editBusy   —— 正在保存（防连点）
  // 原值不再快照存储：随时从 routesById 现算（打开编辑模式的旧机制已删——字段就地可编辑，
  // 保存按钮只在有改动时出现）
  var editFormsState = react.useState({})
  var editForms = editFormsState[0]
  var setEditForms = editFormsState[1]
  var editBusyState = react.useState({})
  var editBusy = editBusyState[0]
  var setEditBusy = editBusyState[1]
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
        // routes 里带着每个 provider 已声明的 models 原文：逐模型编辑要基于它改，
        // 手写字段（reasoningEfforts / compat）才不会被界面写丢。
        var byId: AnyRecord = {}
        var list = payload !== null && payload !== undefined && Array.isArray(payload.routes) ? payload.routes : []
        for (var i = 0; i < list.length; i += 1) {
          var entry = list[i]
          if (entry !== null && typeof entry === 'object' && typeof entry.id === 'string') byId[entry.id] = entry
        }
        setRoutesById(byId)
      })
      .catch(function () {
        setStatus(statusUnavailable())
      })
    loadPlanStatus(force)
      .then(function (payload) {
        setPlan(payload)
        setUsageWait(false)
      })
      .catch(function (cause) {
        setNote(cause && cause.message ? String(cause.message) : String(cause))
        // 加载失败也不能把用户晾在占位页上：回落到空列表 + 错误提示
        setUsageWait(false)
      })
  }, [])

  // 卡片跟着共享额度快照走：座位那边的轮询、别的入口触发的重拉，都会经由这条广播到达这里。
  // 不订阅的话，卡片会停在"自己上次拉的"那一份上，跟触发器显示的数字不一致。
  react.useEffect(
    function () {
      return onPlanChange(function (payload) {
        setPlan(payload)
        // 广播到了 = 用量数据在手，占位可以撤了
        setUsageWait(false)
      })
    },
    [],
  )

  /** 覆盖某个 provider 的编辑态。 */
  function updateModelEditor(routeId: string, next: ModelEditorState) {
    setModelEditors(function (prev: AnyRecord) {
      return withKey(prev, routeId, next)
    })
  }

  /** 行级展开/收起（key = routeId:modelId）。 */
  function toggleEditorRow(key: string) {
    setEditorOpen(function (prev: AnyRecord) {
      return withKey(prev, key, prev[key] !== true)
    })
  }

  /**
   * 保存逐模型清单：只写 `providers.<id>.models` 这一个字段。
   *
   * 之所以只写这一个字段、而不是整段写 route：整段写会重复 issue #1 那个数据丢失洞
   * （手写的 compat / retryPolicy / headers 一起没）。`models` 非空即「整段替换目录」——
   * 所以勾掉一个模型 = 往数组里少写一条 = 不再提供它。
   */
  function saveModelList(account: PlanAccount, rows: readonly ModelEditorRow[]) {
    var error = validateModelRows(rows)
    if (error !== undefined) {
      setNote(error)
      return
    }
    var payload = modelListPayload(rows)
    if (payload.length === 0) {
      setNote('至少要留一个模型；一个都不留的话请用「恢复目录默认」')
      return
    }
    setNote('正在保存模型清单 …')
    apiCall('settings/mutate', {
      ns: 'llm-pi-ai',
      ops: [{ op: 'set', path: ['providers', account.id, 'models'], value: payload }],
    })
      .then(function () {
        setNote('已保存 ' + account.id + ' 的模型清单（' + String(payload.length) + ' 个模型）')
        updateModelEditor(account.id, { routeId: account.id, mode: 'custom', rows: [...rows], pendingId: '' })
        refresh(true)
      })
      .catch(function (cause) {
        setNote('保存失败：' + String(cause && cause.message ? cause.message : cause))
      })
  }

  /**
   * 恢复目录默认：把 `models` 整个删掉（unset）。
   *
   * 不写空数组——官方 `resolveRouteModels` 判的是 `configured.length > 0`，
   * 空数组等于没写，但留着个空数组会让用户以为「清单还在，只是空的」。删干净更好懂。
   */
  function resetModelList(account: PlanAccount) {
    setNote('正在恢复目录默认 …')
    apiCall('settings/mutate', {
      ns: 'llm-pi-ai',
      ops: [{ op: 'unset', path: ['providers', account.id, 'models'] }],
    })
      .then(function () {
        setNote('已恢复 ' + account.id + ' 的目录默认模型清单')
        // 编辑态整份丢掉，下次渲染按新状态重建（否则会停在旧清单上）
        setModelEditors(function (prev: AnyRecord) {
          var next = { ...prev }
          delete next[account.id]
          return next
        })
        refresh(true)
      })
      .catch(function (cause) {
        setNote('恢复失败：' + String(cause && cause.message ? cause.message : cause))
      })
  }

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
    if (percent !== undefined) return tf('toast.refreshSummaryPct', { percent: percent })
    if (Array.isArray(account.balances) && account.balances.length > 0) return tf('toast.refreshSummaryBalance', { value: account.balances[0].value })
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
          showToast('✓ ' + tf('toast.refreshed', { name: shortName(account) }) + refreshSummary(res.account), true)
        } else {
          showToast('✗ ' + tf('toast.refreshFailed', { name: shortName(account), reason: failure }), false)
        }
      })
      .catch(function (cause) {
        showToast('✗ ' + tf('toast.refreshFailed', { name: shortName(account), reason: cause && cause.message ? cause.message : cause }), false)
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
      showToast('✗ ' + tf('toast.noCredentialRef', { name: shortName(account) }), false)
      return
    }
    if (value === '') {
      showToast('✗ ' + tf('toast.emptyKey', { name: shortName(account) }), false)
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
          showToast('✓ ' + tf('toast.keySaved', { name: shortName(account), summary: refreshSummary(res.account) }), true)
        } else {
          showToast('✓ ' + tf('toast.keySavedNoQuota', { reason: failure }), false)
        }
        // 预设清单里这一家的「缺密钥」标记要跟着消失
        reloadPresets()
      })
      .catch(function (cause) {
        var message = String(cause && cause.message ? cause.message : cause)
        // 配置已经在了、只存凭据也可能失败：分开报，免得用户以为整家都没配上
        showToast('✗ ' + tf('toast.keySaveFailed', { reason: message }), false)
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
    // 删除前把这条 route 的配置导出成 YAML（issue #3 期望 4）。密钥不导出：
    // 值在浏览器端拿不到（宿主只下发掩码），导出凭据名让用户知道该重填哪一个。
    var text = routeYamlOf(account)
    var clipboard = navigator !== undefined && navigator !== null ? navigator.clipboard : undefined
    if (clipboard === undefined || typeof clipboard.writeText !== 'function') {
      setNote(t('del.exportNoClipboard'))
      return
    }
    clipboard.writeText(text).then(
      function () { setNote(t('del.exported')) },
      function (cause) {
        setNote(tf('del.exportFailed', { reason: cause && cause.message ? cause.message : cause }))
      },
    )
  }

  // 删除 provider（✕ → 弹层二次确认 → 这里）：配置与密钥一起清掉
  function removeProvider(account: PlanAccount) {
    setDelBusy(true)
    setDelError(null)
    postJson('/provider/remove', { providerId: account.id })
      .then(function (res) {
        if (res === null || res === undefined || res.ok !== true) {
          setDelError('删除失败：' + String((res && res.error) || '未知错误'))

          return
        }
        setDelTarget(null)
        onProviderRemoved(account)
      })
      .catch(function (cause) {
        setDelError('删除失败：' + String(cause && cause.message ? cause.message : cause))
      })
      .then(function () {
        setDelBusy(false)
      })
  }

  // pi-ai 跟随 DSH 自带那份，下载/更新入口已关闭（见 src/updater.ts 头部）。
  // 按钮保留是为了让用户看到**明确结论**，而不是面对一个消失的入口猜为什么。
  function checkUpdate() {
    setBusy(true)
    setNote('正在检查上游 ...')
    postJson('/provider/update')
      .then(function (result) {
        if (result.disabled === true) {
          setNote('本地版已停用 pi-ai 自动下载：vendor/ 不会落地第二份 pi-ai。要跟上游就用 DSH_PROVIDER_UPDATE=on 启动 dsh')
        } else if (result.error !== undefined) {
          setNote('更新失败：' + String(result.error))
        } else if (result.applied === true) {
          setNote('已下载 ' + String(result.latest) + '，验证通过（完整性 + 兼容性），重启 dsh 后生效')
        } else if (result.compatible === false) {
          setNote(String(result.latest) + ' 验证没通过，已跳过（不会切过去）')
        } else {
          setNote('已是最新（' + String(result.latest) + '）')
        }
      })
  }

  /** 改一个编辑字段（草稿留在本地，按「保存修改」才写盘）。 */
  function setEditField(id: string, field: keyof ProviderEditForm, value: string) {
    setEditForms(function (prev: AnyRecord) {
      // 草稿从 route 快照补全四字段再改（不从 {} 起步）——partial 草稿会让校验与保存读到 undefined
      var base = (prev[id] !== undefined ? prev[id] : providerEditForm(routesById[id] !== undefined ? routesById[id] : {})) as unknown as Record<string, string>
      var next: AnyRecord = {}
      for (var key in base) next[key] = base[key]
      ;(next as Record<string, string>)[field] = value
      return withKey(prev, id, next as unknown as ProviderEditForm)
    })
  }

  /**
   * 保存编辑：**只写改动过的字段**（见 provider-edit.ts 的说明）。
   *
   * 与「添加供应商」那条路径的关键差别：这里**不要求重新测试、不要求重打 API key**。
   * 官方 Models 页被禁用后，改一个端点还得先过一遍连通性测试显然不合理；
   * 配置字段的写入本身不涉及凭据（key 走 credentials 通道，另有补录入口）。
   */
  function saveProviderEdit(account: PlanAccount) {
    var form = (editForms[account.id] !== undefined ? editForms[account.id] : {}) as ProviderEditForm
    var origin = providerEditForm(routesById[account.id] !== undefined ? routesById[account.id] : account)
    var bad = validateProviderEdit(form)
    if (bad !== undefined) {
      setNote(t(bad))
      return
    }
    var ops = providerEditSaveOps(account.id, form, origin)
    if (ops.length === 0) {
      setNote(t('edit.noChange'))
      return
    }
    setEditBusy(function (prev: AnyRecord) { return withKey(prev, account.id, true) })
    apiCall('settings/mutate', { ns: 'llm-pi-ai', ops: ops })
      .then(function () {
        setNote(tf('edit.saved', { id: account.id }))
        // 丢弃草稿：字段回落到刷新后的 route 快照，没有改动 → 保存按钮自动隐藏
        setEditForms(function (prev: AnyRecord) {
          var next: AnyRecord = {}
          for (var key in prev) if (key !== account.id) next[key] = prev[key]
          return next
        })
        return postJson('/provider/refresh').catch(function () { /* 刷新失败不影响已保存的结果 */ })
      })
      .then(function () {
        refresh(true)
      })
      .catch(function (cause) {
        setNote(tf('toast.updateFailed', { reason: cause && cause.message ? cause.message : cause }))
      })
      .then(function () {
        setEditBusy(function (prev: AnyRecord) { return withKey(prev, account.id, false) })
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

  var bridge = status === null || status.bridge === undefined ? undefined : status.bridge
  var update = status === null || status.update === undefined ? undefined : status.update
  // 本地版：/provider/status 报 updatesEnabled=false（自动下载是 opt-in），桥接页据此说明并置灰按钮
  var updatesEnabled = status === null || status.updatesEnabled === undefined ? undefined : status.updatesEnabled === true
  // 桥接明细：放在「pi-ai 桥接」二级标签页里展示。行的内容由 piAiBridgeRows 给（纯函数，离线可测）
  var bridgeRows = piAiBridgeRows(bridge, update, updatesEnabled)
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
  // 上游那一行右侧跟按钮：检查更新（宿主先校验下载内容、再做兼容性体检，都过了才等重启生效）。
  // 只在开启自动下载（DSH_PROVIDER_UPDATE=on）时渲染；默认收起，桥接页只留版本一行（issue #4）。
  // status 还在加载（null）时也不渲染——否则「上游/检查更新」会先闪一下又被收走。
  if (status !== null && updatesEnabled !== false) {
    bridgeLines.push(
      react.createElement(
        'div',
        { className: 'pv_line', key: 'action' },
        piAiUpstreamText(update, updatesEnabled),
        react.createElement(
          'button',
          {
            type: 'button',
            className: 'pv_action pv_push',
            disabled: busy,
            title: '',
            onClick: checkUpdate,
          },
          busy ? t('bridge.checking') : t('bridge.check'),
        ),
      ),
    )
  }
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
            react.createElement('span', null, t('prov.routeId')),
            react.createElement('span', { className: 'pv_field' }, String(account.id)),
          ),
        )
        // —— provider 级配置就地可编辑（没有「编辑模式」、没有下方独立表单）——
        // 草稿没改过时字段直接显示 route 快照值；有改动才出现「保存修改 / 取消」。
        // 原值现算而不是用展示字段：展示值经过格式化（短名、掩码），写回会把展示形态存进配置。
        var editOrigin = providerEditForm(routesById[account.id] !== undefined ? routesById[account.id] : account)
        var editForm = (editForms[account.id] !== undefined ? editForms[account.id] : editOrigin) as ProviderEditForm
        var editDirty = isProviderEditDirty(editForm, editOrigin)
        var busyEdit = editBusy[account.id] === true
        // 显示名（卡片标题的文字）。路由 ID 是配置键，就地改名做不到，保持只读。
        bodyRows.push(
          react.createElement(
            'div',
            { className: 'pv_line pv_row', key: 'name' },
            react.createElement('span', null, t('edit.displayName')),
            react.createElement('input', {
              className: 'pv_field pv_key',
              type: 'text',
              value: editForm.displayName,
              placeholder: account.id,
              onChange: function (event: FieldEvent) { setEditField(account.id, 'displayName', event.target.value) },
            }),
          ),
        )
        // API 密钥行：始终可编辑——输入新值点「保存」= 写进凭据仓库（credentials/set），
        // 凭据名就是这条路由的 apiKeyEnv（如 OPENCODE_GO_API_KEY），值不落 settings.yaml。
        // 已配置的把掩码（宿主派生前3+后4，真值不出宿主）放在占位符里；留空提交不了 = 不动。
        // 官方 Models 页已被 cordis.patch.yml 禁用，这里是界面上改 key 的唯一入口。
        // 路由没绑凭据名时没有写入目标，只读提示。
        var keyRef = typeof account.apiKeyEnv === 'string' && account.apiKeyEnv !== '' ? String(account.apiKeyEnv) : undefined
        var keyDraft = keyDrafts[account.id] === undefined ? '' : String(keyDrafts[account.id])
        bodyRows.push(
          react.createElement(
            'div',
            { className: 'pv_line pv_row', key: 'key' },
            react.createElement('span', null, t('prov.apiKey')),
            keyRef === undefined
              ? react.createElement('span', { className: 'pv_field' }, tf('toast.noCredentialRef', { name: shortName(account) }))
              : react.createElement(
                  'span',
                  { className: 'pv_pick', style: { display: 'inline-flex', alignItems: 'center', gap: '6px', flex: '1 1 auto' } },
                  react.createElement('input', {
                    className: 'pv_field pv_key',
                    style: { flex: '1 1 auto' },
                    type: 'password',
                    placeholder: account.keyHint !== undefined ? String(account.keyHint) : 'sk-…',
                    value: keyDraft,
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
                    disabled: savingKey[account.id] === true || keyDraft.trim() === '',
                    title: tf('prov.saveKeyTip', { ref: keyRef }),
                    onClick: function () { saveKey(account) },
                  }, savingKey[account.id] === true ? t('prov.saving') : t('prov.save')),
                ),
          ),
        )
        // API 地址：就地编辑；清空 = 移除这个键（回到官方默认端点）
        bodyRows.push(
          react.createElement(
            'div',
            { className: 'pv_line pv_row', key: 'url' },
            react.createElement('span', null, t('prov.apiBase')),
            react.createElement('input', {
              className: 'pv_field pv_key',
              type: 'text',
              value: editForm.baseURL,
              placeholder: t('edit.baseUrlPlaceholder'),
              onChange: function (event: FieldEvent) { setEditField(account.id, 'baseURL', event.target.value) },
            }),
          ),
        )
        // 协议：就地选择；（默认）= 不写 api 键，由 pi-ai 按端点自行判定
        bodyRows.push(
          react.createElement(
            'div',
            { className: 'pv_line pv_row', key: 'api' },
            react.createElement('span', null, t('prov.protocol')),
            react.createElement(
              'select',
              {
                className: 'pv_field pv_key',
                value: editForm.api,
                onChange: function (event: FieldEvent) { setEditField(account.id, 'api', event.target.value) },
              },
              react.createElement('option', { value: '' }, t('edit.apiDefault')),
              PROVIDER_API_OPTIONS.map(function (option: string) {
                return react.createElement('option', { value: option, key: option }, option)
              }),
            ),
          ),
        )
        // 凭据名行已删（用户要求）：密钥的写入目标固定是这条路由的 apiKeyEnv，
        // 在「API 密钥」行输入新值即写入该凭据名，界面上不再允许改凭据名本身。
        // 有改动才出现操作区。提示独立成行、按钮行留呼吸距（用户报原来太挤）；
        // 自定义网关（写了 baseURL）没有「官方默认端点」可回，提示语相应缩短（用户要求）
        if (editDirty || busyEdit) {
          bodyRows.push(
            react.createElement('div', { className: 'plan_note pv_editHint', key: 'edit-hint' },
              editOrigin.baseURL !== '' ? t('edit.emptyHintCustom') : t('edit.emptyHint')),
          )
          bodyRows.push(
            react.createElement(
              'div',
              { className: 'pv_editActs', key: 'edit-acts' },
              react.createElement(
                'button',
                {
                  type: 'button',
                  className: 'pv_action',
                  style: { marginLeft: '0' },
                  disabled: busyEdit || !editDirty,
                  onClick: function () { saveProviderEdit(account) },
                },
                busyEdit ? t('edit.saving') : t('edit.save'),
              ),
              react.createElement(
                'button',
                {
                  type: 'button',
                  className: 'pv_action',
                  style: { marginLeft: '0' },
                  disabled: busyEdit,
                  onClick: function () {
                    // 取消 = 丢弃草稿，字段回落到 route 快照（操作区随之隐藏）；
                    // 草稿的校验报错一并清掉——报错是跟着草稿走的，草稿没了就该消失
                    setNote(null)
                    setEditForms(function (prev: AnyRecord) {
                      var next: AnyRecord = {}
                      for (var key in prev) if (key !== account.id) next[key] = prev[key]
                      return next
                    })
                  },
                },
                t('prov.cancel'),
              ),
            ),
          )
        }
        // 模型列表：目录（服务端）为骨架，pi-ai 详情补元数据；悬浮显示 Cherry 式详情卡
        //
        // 目录里没有这家时**回落到详情**：目录是「这条路由当前能路由到什么」的快照，
        // 没配密钥时往往是空的（issue #1 的场景就是「装完还没填 key」），而详情来自
        // pi-ai 的数据文件，没配 key 也在。没有这一步，逐模型编辑器在「刚装完、还没配 key」
        // 这个最常见的状态下根本不出现——而它恰恰是用户第一件想干的事。
        var models = modelsByProvider[account.id]
        if (models !== undefined && models.length === 0) {
          var fromDetails: CatalogModel[] = []
          for (var dk in detailsById) {
            var detail = detailsById[dk]
            if (detail === undefined || detail === null || detail.provider !== account.id) continue
            var detailId = typeof detail.id === 'string' && detail.id !== '' ? detail.id : dk.split('/').pop()
            if (detailId === undefined) continue
            fromDetails.push({ id: detailId, name: typeof detail.name === 'string' && detail.name !== '' ? detail.name : detailId })
          }
          if (fromDetails.length > 0) models = fromDetails
        }
        if (models === undefined) {
          bodyRows.push(react.createElement('div', { className: 'pv_line', key: 'm-load' }, t('prov.modelsLoading')))
        } else if (models.length === 0 && account.deletable !== true) {
          bodyRows.push(react.createElement('div', { className: 'pv_line', key: 'm-none' }, t('prov.noModels')))
        } else {
          // 模型区（带外框）独立折叠：卡片展开时默认收起，点「模型（N）」头展开。
          // 展开先看「当前清单」（只读，即 settings.yaml 生效的模型）；点「编辑模型」才进勾选编辑器。
          var modelsOpen = isOpen(account.id + ':models', false)
          var modelsEdit = isOpen(account.id + ':models-edit', false)
          // 折叠模型框时连同编辑态一起复位：下次展开总是先落在清单页
          function toggleModels() {
            setOpenMap(function (prev: AnyRecord) {
              var next = withKey(prev, account.id + ':models', !modelsOpen)
              return modelsOpen ? withKey(next, account.id + ':models-edit', false) : next
            })
          }
          var mBoxRows = []
          // 模型区头部（仿父卡片范式）：标题左；最右 Chevron 旋转切换
          var mTopChildren = [
            react.createElement(
              'button',
              {
                type: 'button',
                className: 'pv_mHead',
                key: 'm-head',
                onClick: toggleModels,
              },
              react.createElement('span', null, tf('prov.models', { count: models.length })),
            ),
          ]
          mTopChildren.push(
            react.createElement(
              'div',
              {
                className: 'pv_mCaretCol',
                key: 'm-caret',
                title: modelsOpen ? t('prov.collapse') : t('prov.expand'),
                onClick: toggleModels,
              },
              caretSvg(modelsOpen),
            ),
          )
          mBoxRows.push(react.createElement('div', { className: 'pv_mTop', key: 'm-top' }, mTopChildren))
          if (modelsOpen && account.deletable === true && modelsEdit === true) {
            // 编辑态（点「编辑模型」进入）：勾选 / 取消只改草稿，点「保存」才落盘；
            // 现有条目只读展示（不改字段）；自定义 ID 在「添加模型」表单里填参数。
            mBoxRows.push(react.createElement(ModelListEditor, {
              key: 'm-edit',
              account: account,
              catalog: models,
              details: detailsById,
              onSaved: function (message: string) {
                showToast(message, true)
                // 清单变了：重拉余额/路由元信息 + 模型目录 + 预设
                onProviderAdded()
              },
              onClose: function () {
                // 保存后折叠清单框并退出编辑态：下次展开先回到清单页
                setOpenMap(function (prev: AnyRecord) {
                  var next = withKey(prev, account.id + ':models', false)
                  return withKey(next, account.id + ':models-edit', false)
                })
              },
            }))
          } else if (modelsOpen) {
            // 清单页：目录（服务端）为骨架的当前生效模型，悬浮显示 Cherry 式详情卡
            var mListRows = []
            // 列标题：与模型行同一套列宽类，保证严格对齐
            mListRows.push(
              react.createElement(
                'div',
                { className: 'pv_mHeadRow', key: 'm-colhead' },
                react.createElement('span', { className: 'pv_mId', style: { fontFamily: 'inherit' } }, t('prov.modelId')),
                react.createElement('span', { className: 'pv_mCaps' }, t('prov.caps')),
                react.createElement('span', { className: 'pv_mCtx' }, t('prov.ctx')),
                react.createElement('span', { className: 'pv_mMax' }, t('cap.maxTokens')),
              ),
            )
            for (var m = 0; m < models.length; m += 1) {
              mListRows.push(modelRow(models[m], account, detailsById))
            }
            // 列表区：分割线上边缘贯穿模型框
            mBoxRows.push(react.createElement('div', { className: 'pv_mList', key: 'm-list' }, mListRows))
            if (account.deletable === true) {
              // 可编辑路由：清单页给「编辑模型」入口，点击整框切换到勾选编辑器
              mBoxRows.push(
                react.createElement(
                  'div',
                  { className: 'pv_mEditRow', key: 'm-edit-row' },
                  react.createElement('button', {
                    type: 'button',
                    className: 'pv_action',
                    style: { marginLeft: '0' },
                    title: '打开逐模型清单编辑：勾选 / 添加 / 删除，点「保存」后写进 settings.yaml',
                    onClick: function () {
                      setOpenMap(function (prev: AnyRecord) { return withKey(prev, account.id + ':models-edit', true) })
                    },
                  }, '编辑模型'),
                ),
              )
            }
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
                        title: tf('prov.openSite', { url: linkTextOf(linkUrl) }),
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
                      { className: 'pv_fresh', title: tf('prov.lastRefresh', { time: String(account.fetchedAt).slice(11, 19) }) },
                      '◷ ' + relativeTime(account.fetchedAt),
                    ),
                react.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'pv_iconBtn' + (refreshingState[0][account.id] === true ? ' pv_spin' : ''),
                    disabled: refreshingState[0][account.id] === true,
                    title: refreshingState[0][account.id] === true
                      ? t('prov.refreshing')
                      : (account.fetchedAt !== undefined
                        ? tf('prov.refreshQuotaAt', { time: String(account.fetchedAt).slice(11, 19) })
                        : t('prov.refreshQuota')),
                    onClick: function () { refreshAccount(account) },
                  },
                  '↻',
                ),
                account.deletable === true
                  ? react.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'pv_iconBtn',
                        title: '删除这个 provider（会先弹出确认，列清要删的配置与密钥）',
                        onClick: function () {
                          setDelError(null)
                          setDelTarget(account)
                        },
                      },
                      '✕',
                    )
                  : null,
              ),
            ),
            ),
            // 箭头列：只在「标题+余量」区域垂直居中（分割线上方），点击展开/收起
            react.createElement(
              'div',
              {
                className: 'pv_pcCaretCol',
                title: expanded ? t('prov.collapse') : t('prov.expand'),
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
      react.createElement('div', { className: 'pv_line', key: '__none' }, String(plan !== null && plan.error !== undefined ? plan.error : t('prov.none'))),
    )
  }

  // 页内二级标签：Provider（配置的 provider 卡片）/ pi-ai 桥接
  var tabProviders = react.createElement(
    'button',
    { type: 'button', className: 'pv_tab' + (tab === 'providers' ? ' pv_tabOn' : ''), onClick: function () { setNote(null); setTab('providers') } },
    t('tabProviders'),
  )
  var tabBridge = react.createElement(
    'button',
    { type: 'button', className: 'pv_tab' + (tab === 'bridge' ? ' pv_tabOn' : ''), onClick: function () { setNote(null); setTab('bridge') } },
    t('bridge.tab'),
  )
  return react.createElement(
    'div',
    { className: 'pv_stack' },
    react.createElement('div', { className: 'pv_tabs' }, tabProviders, tabBridge),
    // 提示行放在标签栏正下方，两个标签页都看得见。此前它的唯一渲染位在桥接页 body 里：
    // 服务商页的校验失败/保存结果/导出结果全都「点了没反应」，还会漏到桥接页冒出一句没来由的话
    !note ? null : react.createElement('div', { className: 'plan_note pv_pageNote' }, note),
    // 三个分支各带不同 key：React 真实环境里条件分支两边同为 div 时会复用同一个 DOM 节点、
    // 只改 className——pv_pc 的 transition:border-color .16s 会在已有节点上触发，边框色从
    // 初始 currentColor（近黑）过渡到浅灰，肉眼就是「边框先变黑 ~0.2s 再恢复」的闪烁
    // （本地版 issue：桥接页边框变黑）。不同 key 强制卸载重建，新节点带最终 class 插入，
    // transition 不会在插入帧触发，首帧即浅灰。
    tab === 'bridge'
      ? react.createElement(
          'div',
          { className: 'pv_pc', key: 'pane-bridge' },
          react.createElement('div', { className: 'pv_pcBody', style: { borderTop: '0', padding: '10px 18px', justifyContent: 'center' } },
            bridgeLines,
            // status 还在加载时给一行占位：卡壳常在、内容原位填充，避免「空框先出现、数据到了内容再蹦出来」的闪烁
            status === null
              ? react.createElement('div', { className: 'pv_line', key: 'loading' },
                  react.createElement('span', { className: 'pv_spin' }, '↻'),
                  react.createElement('span', null, t('bridge.loading')),
                )
              : null),
        )
      : usageWait === true && plan === null
        ? // 用量快照还没就绪：先给「正在刷新用量…」占位，刷新完再渲染 provider 界面
          react.createElement(
            'div',
            { className: 'pv_pc', key: 'pane-usage' },
            react.createElement(
              'div',
              { className: 'pv_pcBody pv_usageLoading' },
              react.createElement('span', { className: 'pv_spin' }, '↻'),
              react.createElement('span', null, t('prov.usageLoading')),
            ),
          )
        : react.createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '10px' }, key: 'pane-providers' },
            react.createElement(AddProviderPanel, { presets: presets, onAdded: onProviderAdded, details: detailsById }),
            cards,
          ),
    toast === null
      ? null
      : react.createElement(
          'div',
          { className: 'pv_toast ' + (toast.ok === true ? 'pv_toastOk' : 'pv_toastFail') },
          toast.text,
        ),
    // 删除确认弹层（本地版 issue #3）：遮罩 + 代价清单 + 危险按钮
    delTarget === null
      ? null
      : react.createElement(DeleteProviderModal, {
          account: delTarget,
          busy: delBusy,
          error: delError,
          onExport: function () { if (delTarget !== null) exportRoute(delTarget) },
          onCancel: function () {
            if (delBusy === true) return
            setDelTarget(null)
            setDelError(null)
          },
          onConfirm: function () { if (delTarget !== null) removeProvider(delTarget) },
        }),
  )
}
