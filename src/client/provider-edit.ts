/**
 * Provider 编辑模式的表单模型（纯函数）。
 *
 * ## 为什么需要它
 *
 * 官方 `ui-settings-models` 被本插件禁用后，「供应商级信息」失去了编辑入口。
 * 之前的唯一写入路径是「＋ 添加供应商」面板被复用为"更新已有路由"，代价很大：
 * 必须重选同一个预设、重打一遍 API key、还要测试通过才放行保存
 * （`settings.ts` 的 `test.phase === 'ok'` 门槛）。而**目录预设**的 baseURL 因为
 * `pickPreset` 预填被锁成只读、api 也只在自定义预设时可改——也就是说
 * **非自定义供应商的端点在界面上根本改不了**。
 *
 * 这个模块提供"卡片级编辑"所需的表单模型，和 `model-editor.ts` 一样保持纯函数：
 * 输入是宿主 `/provider/status` 给的 route 数据，输出是可直接写进 `settings/mutate`
 * 的 ops。视图（渲染）留在 `settings.ts`，这里只负责"值怎么来、怎么校验、怎么写"。
 *
 * ## 设计要点
 *
 * - **只写改动过的字段**：表单带 `original` 快照，值没变就不发 op。编辑时最常见的
 *   操作是"只改一项"，没必要把四项全写一遍（也减少误伤用户手写配置的机会）。
 * - **清空 = unset**：删掉 baseURL 的语义是"回到默认端点"，不是"baseURL 等于空串"。
 * - **路径带字段名**：宿主的 `applyPathOp` 对"路径正好到对象本身"的 set 是整段替换，
 *   会静默吃掉手写的 `models` / `compat`（issue #1 的数据丢失坑），所以一律
 *   `['providers', id, field]`。
 * - **apiKey 不进这里**：凭据值走 `credentials/set`（另一条通道），本模块只管配置字段。
 */

/** 一张编辑表单的值（都是字符串；空串表示"清掉这个键"）。 */
export interface ProviderEditForm {
  displayName: string
  api: string
  baseURL: string
  apiKeyEnv: string
}

/** 可编辑的协议种类（与官方 pi-ai 的 adapter 名一致）。 */
export const PROVIDER_API_OPTIONS: readonly string[] = ['openai-completions', 'anthropic-messages']

/**
 * 协议的人类可读文案：界面上不裸露 api 串（用户 09-23 批注）。
 * 认不出的值原样返回——自定义/中转路由可能写了别的 adapter 名。
 */
export function providerApiLabel(api: string): string {
  if (api === 'anthropic-messages') return 'Anthropic Messages'
  if (api === 'openai-completions') return 'OpenAI Completions'
  return api
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 从宿主返回的 route 数据里取出可编辑字段的初始值。
 * @param route - `/provider/status` 的 `routes[]` 里的一条。
 */
export function providerEditForm(route: unknown): ProviderEditForm {
  const record = (route !== null && typeof route === 'object' ? route : {}) as Record<string, unknown>
  return {
    displayName: str(record['displayName'] ?? record['name']),
    api: str(record['api']),
    baseURL: str(record['baseURL'] ?? record['baseUrl']),
    apiKeyEnv: str(record['apiKeyEnv']),
  }
}

/**
 * 表单 → 写入 ops。只发真的改过的字段；空值发 `unset` 而不是 `set ''`。
 *
 * 与「添加供应商」那条路径（`providerSaveOps`）的区别就在这两点上：添加时"空值不发 op"
 * 是对的（没选协议不该把已有 api 抹成空串），而编辑时用户清空一个字段表达的正是
 * "移除这个键"；`set ''` 会在配置里留下一个值为空串的项，下游还得再判一次空。
 *
 * @param routeId - 目标 route id。
 * @param form - 表单当前值。
 * @param original - 打开编辑时的原值快照。
 * @returns 可直接交给 `settings/mutate` 的 ops（空数组 = 什么都没改）。
 */
export function providerEditSaveOps(routeId: string, form: ProviderEditForm, original: ProviderEditForm): unknown[] {
  const ops: unknown[] = []
  const fields: (keyof ProviderEditForm)[] = ['displayName', 'api', 'baseURL', 'apiKeyEnv']
  for (const field of fields) {
    const next = String(form[field] ?? '').trim()
    const prev = String(original[field] ?? '').trim()
    if (next === prev) continue
    if (next === '') {
      ops.push({ op: 'unset', path: ['providers', routeId, field] })
      continue
    }
    ops.push({ op: 'set', path: ['providers', routeId, field], value: next })
  }
  return ops
}

/**
 * 表单校验：返回错误文案的词典键（全部合法时是 undefined）。
 *
 * 只拦真正会出问题的输入，不做多余的格式审查：
 *   - `api` 必须是 pi-ai 认得的那两种之一——写错了适配器装不起来，而且报错很远；
 *   - `baseURL` 给了就必须是 http(s) 开头，否则请求会在很后面才失败；
 *   - `apiKeyEnv` 是环境变量名，限制成大写字母/数字/下划线（与新增面板的派生规则一致）；
 *   - 传了 `original` 时：api/baseURL/apiKeyEnv 改成空串不允许（用户要求：每一项都要有值，
 *     清空无法保存；显示名除外——留空 = 沿用路由 ID）。不传 original（离线测试/无快照）
 *     时退回只查格式。
 * @param form - 表单当前值。
 * @param original - 打开编辑时的原值快照（可选）。
 */
export function validateProviderEdit(form: ProviderEditForm, original?: ProviderEditForm): string | undefined {
  // 字段可能缺省（草稿按字段惰性创建）：undefined 一律按「没填」处理，不能误判成非法值
  const api = String(form.api ?? '')
  const baseURL = String(form.baseURL ?? '')
  const apiKeyEnv = String(form.apiKeyEnv ?? '')
  if (api !== '' && PROVIDER_API_OPTIONS.indexOf(api) === -1) return 'edit.badApi'
  if (baseURL !== '' && !/^https?:\/\//i.test(baseURL)) return 'edit.badBaseUrl'
  if (apiKeyEnv !== '' && !/^[A-Z0-9_]+$/.test(apiKeyEnv)) return 'edit.badKeyEnv'
  if (original !== undefined && original !== null) {
    const mustKeep: (keyof ProviderEditForm)[] = ['api', 'baseURL', 'apiKeyEnv']
    for (const field of mustKeep) {
      if (String(form[field] ?? '').trim() === '' && String(original[field] ?? '').trim() !== '') return 'edit.emptyBlocked'
    }
  }
  return undefined
}

/**
 * 表单里有没有实质改动（用于决定"保存"按钮是否可点）。
 * @param form - 表单当前值。
 * @param original - 打开编辑时的原值快照。
 */
export function isProviderEditDirty(form: ProviderEditForm, original: ProviderEditForm): boolean {
  return providerEditSaveOps('_', form, original).length > 0
}
