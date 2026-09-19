/**
 * 逐模型清单编辑（issue #1 的诉求）。
 *
 * 为什么需要它：本插件在 `cordis.patch.yml` 里禁用了官方 `ui-settings-models`，而官方那个
 * Models 页带的逐模型编辑（`ModelListEditor` / `DeepSeekModelsEditor` / `CustomProviderCard`）
 * 没有替代——于是"这个 provider 下暴露哪些模型、每个模型什么参数"在界面上无处可改，
 * 只能手改 `settings.yaml`。
 *
 * 写盘契约（照官方 `@deepseek-ai/dsh-llm-pi-ai` 的 schema 与 `resolveRouteModels`）：
 *   - `llm-pi-ai.providers.<id>.models` 是**整段替换**目录的清单：
 *     `configured.length > 0 ? configured : [...defaults]`。所以「只留 1 个」= 往这个数组里
 *     只写那 1 条；写空数组等于没写（回落目录）。
 *   - 数组元素的字段（官方 `modelFields`）：`id`（必填）、`name`、`contextWindow`、
 *     `maxTokens`、`input`（模态数组，如 ['text','image']）、`reasoningEfforts`、`compat`。
 *   - 官方对每个元素有**硬校验**（正整数窗口/输出、id 不能空也不能重复、只认上面那些字段
 *     里的合法值）。错一条会让整条路由解析失败——[`validateModelRows`] 把这个校验前置到界面上，
 *     宁可不让写，也不要写进去把用户的路由弄挂。
 *
 * 本模块是纯函数（不碰 react、不碰网络），离线可测；界面在 settings.ts 里照着渲染。
 */
import type { AnyRecord } from '../types.js'
import type { CatalogModel, ModelDetail } from './types.js'

/** 一条模型在编辑器里的一行：目录/已有配置里的元数据 + 用户是否勾选 + 可改的参数字段。 */
export interface ModelEditorRow {
  id: string
  name: string
  /** 用户勾选「提供这个模型」——未勾选的行在保存时被丢掉（= 不暴露它）。 */
  served: boolean
  contextWindow: string
  maxTokens: string
  /** 目录/lib 给出的可用模态；未知时 undefined（不下发 input，避免写错）。 */
  input?: string[]
  /** 这条是从哪来的：目录里查到的 / 用户自己声明的 / 两边都有。 */
  source: 'catalog' | 'declared' | 'both'
  /** 变更是只勾了它（true）还是改了参数（false）：只勾选时无需把该行整条写死。 */
  customized: boolean
}

/** 编辑器的整体状态。`mode` 对应官方两种来源：目录默认 / 自己声明的清单。 */
export interface ModelEditorState {
  routeId: string
  mode: 'catalog' | 'custom'
  rows: ModelEditorRow[]
  /** 附加到 row id 上的自定义模型（目录里没有、用户自己加的）。 */
  pendingId: string
}

/**
 * 把一条目录/配置里的模型读成编辑器的一行。
 * @param id - 模型 id。
 * @param name - 显示名（缺省用 id）。
 * @param detail - `/provider/models` 给的详情（可能有窗口/输出/能力）。
 * @param known - 这条是不是已经作为配置声明过。
 */
function rowOf(id: string, name: string | undefined, detail: ModelDetail | undefined, declared: AnyRecord | undefined): ModelEditorRow {
  var fromCatalog = detail !== undefined
  var fromDeclared = declared !== undefined
  var contextWindow = detail?.contextWindow !== undefined
    ? detail.contextWindow
    : (declared !== undefined ? readNumber(declared['contextWindow']) : undefined)
  var maxTokens = detail?.maxTokens !== undefined
    ? detail.maxTokens
    : (declared !== undefined ? readNumber(declared['maxTokens']) : undefined)
  var declaredInput = declared !== undefined && Array.isArray(declared['input']) ? declared['input'] : undefined
  return {
    id: id,
    name: name !== undefined && name !== '' ? name : (declared !== undefined && typeof declared['name'] === 'string' ? declared['name'] : id),
    served: true,
    contextWindow: contextWindow === undefined ? '' : String(contextWindow),
    maxTokens: maxTokens === undefined ? '' : String(maxTokens),
    input: declaredInput !== undefined
      ? declaredInput.filter((x): x is string => typeof x === 'string')
      : (detail?.vision === true ? ['text', 'image'] : undefined),
    source: fromCatalog && fromDeclared ? 'both' : (fromDeclared ? 'declared' : 'catalog'),
    customized: false,
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * 建编辑器状态：目录里的模型 + 已配置清单里的模型，合成一份可勾选的清单。
 *
 * 「已配置清单」优先于目录——`models` 非空时官方就是拿它当全部（目录不再参与），
 * 所以那里面的条目即使目录里没有（自定义 id）也必须出现在编辑器里，否则用户会以为它丢了。
 * @param routeId - 目标 provider 路由 id。
 * @param catalog - 目录里这个 provider 的模型（`session/modelCatalog` 的骨架）。
 * @param details - 该 provider 的模型详情（按 id 索引）。
 * @param configured - `settings.yaml` 里这条 route 已声明的 models 数组。
 */
export function buildModelEditor(
  routeId: string,
  catalog: readonly CatalogModel[],
  details: Record<string, ModelDetail> | undefined | null,
  configured: readonly unknown[] | undefined,
): ModelEditorState {
  var rows: ModelEditorRow[] = []
  var seen = new Set<string>()
  var declared = new Map<string, AnyRecord>()
  var configuredList: readonly unknown[] = Array.isArray(configured) ? configured : []
  for (var i = 0; i < configuredList.length; i += 1) {
    var entry = configuredList[i]
    if (entry === null || typeof entry !== 'object') continue
    var record = entry as AnyRecord
    var declaredId = typeof record['id'] === 'string' ? record['id'] : undefined
    if (declaredId === undefined || declaredId === '') continue
    declared.set(declaredId, record)
  }
  // 已声明的清单优先：它是当前真正生效的那份（官方 configured 非空就不再看目录）
  for (const [id, record] of declared) {
    var detailForDeclared = details !== undefined && details !== null ? details[id] : undefined
    var declaredName = typeof record['name'] === 'string' ? record['name'] : undefined
    rows.push(rowOf(id, declaredName !== undefined ? declaredName : detailForDeclared?.name, detailForDeclared, record))
    seen.add(id)
  }
  // 目录里的其余模型接在后面
  if (Array.isArray(catalog)) {
    for (var c = 0; c < catalog.length; c += 1) {
      var model = catalog[c]
      if (model === null || model === undefined || typeof model.id !== 'string' || model.id === '') continue
      if (seen.has(model.id)) continue
      seen.add(model.id)
      var detail = details !== undefined && details !== null ? details[model.id] : undefined
      rows.push(rowOf(model.id, model.name, detail, undefined))
    }
  }
  return {
    routeId: routeId,
    // 已声明清单非空 = 官方走的就是 configured 分支
    mode: declared.size > 0 ? 'custom' : 'catalog',
    rows: rows,
    pendingId: '',
  }
}

/** 改一行（不可变更新：返回新的 rows）。 */
export function patchModelRow(rows: readonly ModelEditorRow[], id: string, patch: Partial<ModelEditorRow>): ModelEditorRow[] {
  var next: ModelEditorRow[] = []
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].id !== id) {
      next.push(rows[i])
      continue
    }
    next.push({ ...rows[i], ...patch, customized: true })
  }
  return next
}

/** 加一行自定义模型（目录里没有的 id）。id 为空或已存在时原样返回。 */
export function addModelRow(rows: readonly ModelEditorRow[], id: string): ModelEditorRow[] {
  var trimmed = String(id).trim()
  if (trimmed === '') return [...rows]
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].id === trimmed) return [...rows]
  }
  return [...rows, {
    id: trimmed,
    name: trimmed,
    served: true,
    contextWindow: '',
    maxTokens: '',
    source: 'declared',
    customized: true,
  }]
}

/**
 * 校验：能不能把这份清单写进 `models`。
 *
 * 官方那边错一条会让**整条路由**解析失败（`invalid()` 抛错），所以这里先拦：
 * 空 id、重复 id、非正整数窗口/输出。
 * @returns 第一条错误信息；全通过返回 undefined。
 */
export function validateModelRows(rows: readonly ModelEditorRow[]): string | undefined {
  var seen = new Set<string>()
  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i]
    if (!row.served) continue
    if (row.id.trim() === '') return '有模型的 ID 是空的'
    if (seen.has(row.id)) return '模型 ID 重复：' + row.id
    seen.add(row.id)
    var window = numericField(row.contextWindow)
    if (window === 'invalid') return row.id + ' 的上下文窗口要填正整数（留空表示用默认值）'
    var output = numericField(row.maxTokens)
    if (output === 'invalid') return row.id + ' 的最大输出要填正整数（留空表示用默认值）'
  }
  return undefined
}

/** 数字字段解析：'' → undefined（不写这个字段），正整数 → number，其余 → 'invalid'。 */
function numericField(text: string): number | undefined | 'invalid' {
  var trimmed = String(text ?? '').trim()
  if (trimmed === '') return undefined
  var value = Number(trimmed)
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return 'invalid'
  return value
}

/**
 * 生成要写进 `llm-pi-ai.providers.<id>.models` 的数组。
 *
 * 只写「需要的字段」：`id` 必填；`name` / `contextWindow` / `maxTokens` / `input` 只在确实有值时写。
 * 不写 `reasoningEfforts` / `compat` —— 那两样语义复杂（档位要配 wire 值），界面上没有可靠的
 * 输入方式，宁可不写（不写 = 沿用目录里那份），也不要写错让整条路由挂掉。
 * @param rows - 编辑器里的行（只取勾选的）。
 */
export function modelListPayload(rows: readonly ModelEditorRow[]): unknown[] {
  var out: unknown[] = []
  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i]
    if (!row.served) continue
    var entry: AnyRecord = { id: row.id }
    if (row.name !== '' && row.name !== row.id) entry['name'] = row.name
    var window = numericField(row.contextWindow)
    if (typeof window === 'number') entry['contextWindow'] = window
    var output = numericField(row.maxTokens)
    if (typeof output === 'number') entry['maxTokens'] = output
    if (Array.isArray(row.input) && row.input.length > 0) entry['input'] = [...row.input]
    out.push(entry)
  }
  return out
}

/**
 * 这份清单能不能用「什么都不写」（= 回落目录默认）表达。
 *
 * 条件：一条都没被改过参数、且目录里的每一条都还勾着（没有裁掉任何模型）。
 * 这时写 `models` 是多余的，而且会把目录里后续新增的模型永久挡在门外——所以宁可 unset。
 */
export function isDefaultCatalogEquivalent(rows: readonly ModelEditorRow[]): boolean {
  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i]
    // 只来自配置的行说明配置里已经写了目录没有的东西：那样无论如何都得保留一份清单
    if (row.source === 'declared') return false
    // 裁掉了某个模型：catalog 语义表达不了，必须显式写清单
    if (!row.served) return false
    // 改过参数（patchModelRow 会置位）：必须显式写
    if (row.customized) return false
  }
  return true
}
