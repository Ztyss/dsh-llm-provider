/**
 * 浏览器端数据层：同源 HTTP/RPC、额度快照缓存、目录/投影的读与归一化。
 * 组件不直接 fetch——全走这里。
 */
import react from 'react'
import type { AnyRecord } from '../types.js'
import type {
  CatalogGroup,
  CatalogModel,
  ModelDetail,
  ModelSelection,
  PlanAccount,
  ProjectionCell,
  SessionsFace,
  SnapshotStore,
} from './types.js'

/** 同源 GET → JSON：宿主自建读路由（/plan/status、/provider/status|presets|models）的唯一入口。 */
export function getJson(url: string): Promise<any> {
  return fetch(url).then(function (response) {
    return response.json()
  })
}

/** 同源 POST JSON → JSON：宿主自建写路由（refresh / remove / test / update）的唯一入口。 */
export function postJson(url: string, body?: unknown): Promise<any> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body === undefined ? {} : body),
  }).then(function (response) {
    return response.json()
  })
}

/** 额度快照：60 秒内复用，force 绕过（和宿主端缓存同拍）。 */
var planCache: { at: number; value: unknown } = { at: 0, value: null }
export function loadPlanStatus(force: boolean): Promise<any> {
  if (!force && planCache.value !== null && Date.now() - planCache.at < 60000) {
    return Promise.resolve(planCache.value)
  }
  return getJson('/plan/status' + (force === true ? '?refresh=1' : '')).then(function (payload) {
    planCache = { at: Date.now(), value: payload }
    return payload
  })
}

/** 宿主桥接状态（pi-ai 版本、路由表、测试环境标记）。 */
export function loadProviderStatus() {
  return getJson('/provider/status')
}

/** 桥接状态拿不到时的占位：设置页据此渲染错误行，界面不至于空着。 */
export var STATUS_UNAVAILABLE = { bridge: { active: false, error: '宿主端状态不可用' } }

/** 模型详情（生效 pi-ai 包的全量元数据），按模型 id 建索引：悬浮详情卡与能力徽章共用。 */
export function loadModelDetailMap(): Promise<Record<string, ModelDetail>> {
  return getJson('/provider/models').then(function (payload) {
    var map: Record<string, ModelDetail> = {}
    if (payload === null || payload === undefined || !Array.isArray(payload.models)) return map
    for (var i = 0; i < payload.models.length; i += 1) map[payload.models[i].id] = payload.models[i]
    return map
  })
}

/** 不可变地合并一组 key（几个 setState 都这么写，集中一处）。 */
export function withKeys(prev: AnyRecord, patch: AnyRecord): AnyRecord {
  var next: AnyRecord = {}
  for (var k in prev) next[k] = prev[k]
  for (var k2 in patch) next[k2] = patch[k2]
  return next
}

/** 不可变地改 map 里的一个 key。 */
export function withKey(prev: AnyRecord, key: string, value: unknown): AnyRecord {
  var patch: AnyRecord = {}
  patch[key] = value
  return withKeys(prev, patch)
}

/** 快照里剔掉一家（删除 provider 后用：不打上游、不让卡片复活）。 */
export function withoutAccount(payload: unknown, id: string): unknown {
  if (payload === null || payload === undefined || typeof payload !== 'object') return payload
  var record = payload as AnyRecord
  if (!Array.isArray(record.accounts)) return payload
  return {
    ...record,
    accounts: record.accounts.filter(function (account) {
      return account.id !== id
    }),
  }
}

/** 快照里替换一家（单卡刷新用：宿主实查回传的新账户盖掉旧值，并更新 fetchedAt）。 */
export function withRefreshedAccount(payload: unknown, fresh: AnyRecord): unknown {
  if (payload === null || payload === undefined || typeof payload !== 'object') return payload
  var record = payload as AnyRecord
  if (!Array.isArray(record.accounts)) return payload
  return {
    ...record,
    accounts: record.accounts.map(function (account) {
      return account.id === fresh.id ? fresh : account
    }),
    fetchedAt: new Date().toISOString(),
  }
}

/** 从客户端缓存里剔除一家。 */
export function dropPlanAccount(id: string) {
  planCache.value = withoutAccount(planCache.value, id)
}

/**
 * 官方远程 RPC 同源调用（/api/<ns>/<method>，client-request 信封，cookie 自动认证）。
 * @param failMessage 信封里没有 error 对象时的兜底文案（默认「调用失败」）。
 */
export function apiCall(method: string, args: unknown, failMessage?: string): Promise<any> {
  return postJson('/api/' + method, {
    type: 'client-request',
    rpcId: 'dsh-provider-' + String(Date.now()) + '-' + String(Math.random()).slice(2, 8),
    method: method,
    payload: { args: args },
  }).then(function (envelope) {
    var result = envelope && envelope.result
    if (result && result.ok === true) return result.value
    throw new Error(result && result.error
      ? String(result.error.code) + ': ' + String(result.error.message)
      : (failMessage === undefined ? '调用失败' : failMessage))
  })
}

/**
 * 模型目录：session/modelCatalog 的同源 RPC（官方选择器走的是同一条）。
 * @returns `{ groups, default }`；default 是宿主默认选择，官方用它兜底
 *   （`current = projected.next ?? catalog.default`）——会话还没选过模型时显示的就是它。
 */
export function loadModelCatalog() {
  return apiCall('session/modelCatalog', {}, '模型目录加载失败').then(function (value) {
    var catalog = value === null || typeof value !== 'object' ? {} : value
    return { groups: normalizeGroups(catalog.groups), default: normalizeSelection(catalog.default) }
  })
}

/** 一个 provider/model/reasoningEffort 选择；形状不对就当作没有。 */
export function normalizeSelection(value: unknown): ModelSelection | undefined {
  if (value === null || typeof value !== 'object') return undefined
  var record = value as AnyRecord
  if (typeof record.provider !== 'string' || typeof record.model !== 'string') return undefined
  return typeof record.reasoningEffort === 'string'
    ? { provider: record.provider, model: record.model, reasoningEffort: record.reasoningEffort }
    : { provider: record.provider, model: record.model }
}

/** 切换模型：GUI 自己的同源 RPC，和官方选择器同一条路。 */
export function submitSelection(sessionId: string, provider: string, model: string, reasoningEffort: unknown): Promise<boolean> {
  var request: { sessionId: string; provider: string; model: string; reasoningEffort?: string } = { sessionId: sessionId, provider: provider, model: model }
  if (typeof reasoningEffort === 'string') request.reasoningEffort = reasoningEffort
  return apiCall('session/selectModel', { request: request }, '切换失败').then(function () {
    return true
  })
}

/** provider id → 额度账户（两边用同一套 route id，直接对上）。 */
export function accountsById(payload: unknown): Record<string, PlanAccount> {
  var map: Record<string, PlanAccount> = {}
  var source: AnyRecord | undefined = payload === null || payload === undefined ? undefined : (payload as AnyRecord)
  var accounts = source !== undefined && Array.isArray(source.accounts)
    ? source.accounts
    : []
  for (var i = 0; i < accounts.length; i += 1) map[accounts[i].id] = accounts[i]
  return map
}

var EMPTY_CELL = {
  getSnapshot: function () {
    return undefined
  },
  subscribe: function () {
    return function () {}
  },
}

/** 模型选择投影的 cell；读不到时给一个永远 undefined 的假 cell，组件照样能渲染。 */
export function selectionCell(sessions: SessionsFace | undefined, sessionId: string): ProjectionCell {
  if (sessions === undefined || typeof sessions.binding !== 'function') return EMPTY_CELL
  var binding
  try {
    binding = sessions.binding(sessionId)
  } catch (error) {
    return EMPTY_CELL
  }
  var face = binding && binding.session && binding.session.projections
  if (face === undefined || typeof face.faceOf !== 'function') return EMPTY_CELL
  try {
    var cell = face.faceOf('modelSelection')
    if (cell !== undefined && typeof cell.getSnapshot === 'function' && typeof cell.subscribe === 'function') return cell
  } catch (error) {
    return EMPTY_CELL
  }
  return EMPTY_CELL
}

/** 投影值 → 当前 provider/model；投影可能是原值或 {next} 形状。 */
export function unwrap(value: unknown): ModelSelection | undefined {
  var record = value as AnyRecord
  if (value !== null && typeof value === 'object' && typeof record.provider === 'string') return record as unknown as ModelSelection
  if (value !== null && typeof value === 'object' && record.next !== null && typeof record.next === 'object') {
    var next = record.next as AnyRecord
    if (typeof next.provider === 'string') return next as unknown as ModelSelection
  }
  return undefined
}

/** 读一次 snapshot store，失败当作没有。 */
export function snapshotOf(store: SnapshotStore | undefined | null): AnyRecord | undefined {
  if (store === undefined || store === null || typeof store.getSnapshot !== 'function') return undefined
  try {
    return store.getSnapshot() as AnyRecord | undefined
  } catch (error) {
    return undefined
  }
}

/**
 * 轮询一个 snapshot store（官方目录服务给的 store）。
 * 不用 useSyncExternalStore：不同 dsh 版本上 store 的 subscribe 契约不保证一致，
 * 订阅失败会把整块 UI 拖崩；轮询只影响「当前」标记的实时性。
 */
export function usePolledSnapshot(store: SnapshotStore | undefined, intervalMs: number): AnyRecord | undefined {
  var state = react.useState(function () {
    return snapshotOf(store)
  })
  react.useEffect(
    function () {
      if (store === undefined || store === null) return undefined
      function read() {
        state[1](snapshotOf(store))
      }
      read()
      var timer = setInterval(read, intervalMs)
      return function () {
        clearInterval(timer)
      }
    },
    [store],
  )
  return state[0]
}

/** 官方目录分组 → 我们内部统一的 [{ id, name, models: [{id, name, contextWindow?}] }]。 */
export function normalizeGroups(rawGroups: unknown): CatalogGroup[] {
  var groups = Array.isArray(rawGroups) ? rawGroups : []
  var normalized: CatalogGroup[] = []
  for (var i = 0; i < groups.length; i += 1) {
    var group = groups[i]
    if (group === null || typeof group !== 'object') continue
    var groupRecord = group as AnyRecord
    var providerId = typeof groupRecord.provider === 'string' ? groupRecord.provider : groupRecord.id
    if (typeof providerId !== 'string') continue
    var models: CatalogModel[] = []
    var raw = Array.isArray(groupRecord.models) ? groupRecord.models : []
    for (var j = 0; j < raw.length; j += 1) {
      var model = raw[j]
      if (typeof model === 'string') models.push({ id: model, name: model })
      else if (model !== null && typeof model === 'object') {
        var modelRecord = model as AnyRecord
        // 原先是这个 else-if 的条件；写成 continue 是因为它本来就是循环体最后一段
        if (typeof modelRecord.id !== 'string') continue
        var entry: CatalogModel = {
          id: modelRecord.id,
          name: typeof modelRecord.name === 'string' ? modelRecord.name : modelRecord.id,
        }
        var cw = modelRecord.contextWindow ?? modelRecord.context_window ?? modelRecord.maxContextWindow
        if (typeof cw === 'number' && Number.isFinite(cw) && cw > 0) entry.contextWindow = cw
        // 思考强度档位：官方目录的 reasoning.efforts（id/name 列表 + 默认值）
        if (modelRecord.reasoning !== null && typeof modelRecord.reasoning === 'object') {
          var reasoningRecord = modelRecord.reasoning as AnyRecord
          var efforts = Array.isArray(reasoningRecord.efforts) ? reasoningRecord.efforts : []
          var effortIds: string[] = []
          for (var r = 0; r < efforts.length; r += 1) {
            var effort = efforts[r]
            var effortId = typeof effort === 'string' ? effort : (effort && (effort as AnyRecord).id)
            if (typeof effortId === 'string' && effortId !== '') effortIds.push(effortId)
          }
          if (effortIds.length > 0) {
            entry.reasoning = {
              efforts: effortIds,
              default: typeof reasoningRecord.defaultEffort === 'string' ? reasoningRecord.defaultEffort : undefined,
            }
          }
        }
        models.push(entry)
      }
    }
    normalized.push({
      id: providerId,
      name: typeof groupRecord.name === 'string' ? groupRecord.name : providerId,
      models: models,
    })
  }
  return normalized
}

/** 目录里按 provider id 找分组（预设清单这类 id 列表也复用）。 */
export function findById<T extends { id: string }>(list: T[], id: string): T | undefined {
  for (var i = 0; i < list.length; i += 1) {
    if (list[i].id === id) return list[i]
  }
  return undefined
}

/** 目录里按 provider id + 模型 id 找模型（当前选择回显、点选提交都用它）。 */
export function findModel(groups: CatalogGroup[], providerId: string, modelId: string): CatalogModel | undefined {
  var group = findById(groups, providerId)
  if (group === undefined) return undefined
  for (var j = 0; j < group.models.length; j += 1) {
    if (group.models[j].id === modelId) return group.models[j]
  }
  return undefined
}
