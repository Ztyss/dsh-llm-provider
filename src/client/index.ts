/**
 * dsh-llm-provider 浏览器端入口。
 *
 * 挂在 composer 的 `conversation.input.model` 座位：模型选择器（当前模型 + 思考强度）。
 * 额度数据来自宿主端同源路由 `GET /plan/status`；
 * 当前 provider 从会话投影读；切换通过同源 /api/session/selectModel RPC 提交。
 *
 * 模块划分（都在这一个目录下，客户端打包时全部内联成一个 lib/client.js）：
 *   types.ts     —— 宿主/自家路由下发 JSON 的就地声明
 *   format.ts    —— 纯格式化/匹配工具（无 react、无网络，离线可测）
 *   data.ts      —— 同源 HTTP/RPC、额度快照缓存、目录/投影的读与归一化
 *   model-seat.ts—— conversation.input.model 座位组件
 *   settings.ts  —— 设置页 Provider 标签 + 桥接明细纯函数
 *   command.ts   —— /model 命令注册
 *   styles.ts    —— CSS 与样式挂载、测试环境角标
 *   i18n.ts      —— 翻译（官方 locale 优先，本地字典兜底）
 *   icons.ts     —— 官方图标库的 SVG 拷贝
 *   diag.ts      —— window.__dshLlmProvider 诊断
 *
 * lib/client.js 由 tsdown 产出（见 tsdown.config.ts 的 client 段），外面那层
 * window.__ModuleLoader__.load 外壳是构建配置里的 banner/footer/intro，源码里不写。
 */
import { registerModelCommand } from './command.js'
import { loadProviderStatus } from './data.js'
import { recordDiagnostic } from './diag.js'
import { defaultEffortOf, reasoningTextOf } from './format.js'
import { LOCAL_DICT, localT, setT, t } from './i18n.js'
import { ModelSwitchSeat } from './model-seat.js'
import { piAiBridgeRows, piAiUpstreamText, piAiToggleState, ProviderSettingsSection } from './settings.js'
import { installCss, markTestEnv } from './styles.js'
import type { AnyRecord } from '../types.js'
import type { ClientContext, ModelDirectoriesService, ModelSelection } from './types.js'

/**
 * 需要的客户端服务：座位注册表 + 会话。
 * `remote` / `remote.session` 是官方目录服务内部要用的：其方法被绑定到调用方上下文，
 * 少声明就会在 directoryFor 里报 "cannot get property remote.session without inject"。
 */
export var inject = ['slots', 'sessions', 'remote', 'remote.session', 'locale']

export function apply(ctx: ClientContext) {
  installCss()
  // 样式挂载固定走 installCss 的手写 style 标签。官方 styles.insert 要 inject 'styles'，
  // 而本插件 inject 列表里没有它：直接取 ctx.styles 会抛
  // "cannot get property "styles" without inject"，把整个插件加载搞挂。所以属性访问必须在
  // try 里，仅用于诊断，不影响样式走哪条路。
  try {
    if (ctx.styles !== undefined && ctx.styles !== null && typeof ctx.styles.insert === 'function') {
      recordDiagnostic('styles', 'styles.insert')
    } else {
      recordDiagnostic('styles', 'fallback-style-tag')
    }
  } catch (cause) {
    // 没 inject 'styles' 时取属性即抛，属常态：记成手写标签
    recordDiagnostic('styles', 'fallback-style-tag')
  }
  recordDiagnostic('applied', new Date().toISOString())

  // i18n：优先官方 locale（register + bind，语言切换实时跟随）；重复注册（热重载）会抛，
  // 旧字典仍在，继续 bind 即可；都失败则回退本地字典（localT）。
  setT(localT)
  try {
    if (ctx.locale !== undefined && ctx.locale !== null && typeof ctx.locale.register === 'function') {
      try {
        ctx.locale.register('dsh-llm-provider', LOCAL_DICT)
      } catch (dup) { /* 已注册过（客户端热重载）：旧字典还有效 */ }
      if (typeof ctx.locale.bind === 'function') {
        var bound = ctx.locale.bind('dsh-llm-provider')
        setT(function (key: string) {
          var value = bound(key)
          return value === key ? localT(key) : value
        })
      }
    }
  } catch (cause) {
    var failure = cause as AnyRecord
    recordDiagnostic('locale', String(failure && failure.message ? failure.message : cause))
  }

  // 测试环境标识：宿主在 DSH_PROVIDER_TEST=1 启动时 /provider/status 会回 testMode:true，
  // 这里给标题加「· 测试」后缀、favicon 盖橙色「测」角标，一眼区分测试实例（正式实例无标）。
  loadProviderStatus()
    .then(function (status) {
      if (status && status.testMode === true) markTestEnv()
    })
    .catch(function () { /* 拿不到状态就算了，不影响功能 */ })

  // 官方模型目录服务（ui-model-selection 提供的客户端 cordis 服务）。
  // 走服务而不是自己读投影/发 RPC：目录、当前选择、切换提交、失效刷新都在它手里。
  // 登记与使用解耦：服务迟到也不影响座位注册——inject 工厂是渲染时才调用的，
  // 那时再读 modelDirectories；读不到就返回空面，组件各自退回同源 HTTP/RPC 路径。
  var modelDirectories: ModelDirectoriesService | undefined
  ctx.inject(['modelDirectories'], function (scope) {
    modelDirectories = scope.modelDirectories
    recordDiagnostic('modelDirectories', modelDirectories === undefined ? 'undefined' : 'ok')
  })

  // 会话 face：目录服务缺席时（plan-test 禁用官方 ui-model-selection），
  // 座位靠它读会话投影 modelSelection 来回显当前模型。
  var sessionsFace = ctx.sessions
  recordDiagnostic('sessions', sessionsFace === undefined ? 'undefined' : 'ok')

  /**
   * 座位/徽标的 inject 面：把官方目录服务包装成组件能用的只读数据 + 两个动作。
   * @param sessionId - 座位所在的会话。
   */
  function directoryFace(sessionId: string) {
    // sessionId 必须随注入面传给座位：目录服务缺席时（plan-test），
    // 座位靠它读会话投影拿当前模型、发切换 RPC。
    if (modelDirectories === undefined || typeof modelDirectories.directoryFor !== 'function') {
      recordDiagnostic('face', { reason: 'no-service', sessionId: String(sessionId) })
      return { sessionId: sessionId, sessions: sessionsFace }
    }
    try {
      var directory = modelDirectories.directoryFor(sessionId)
      recordDiagnostic('face', { reason: 'ok', sessionId: String(sessionId) })
      return {
        sessionId: sessionId,
        sessions: sessionsFace,
        directory: directory.store,
        load: function () {
          directory.load().catch(function () {
            /* 错误会落到它自己的 store 上，由组件呈现 */
          })
        },
        select: function (selection: ModelSelection) {
          return directory.select(selection).then(function () {
            return true
          }, function () {
            return false
          })
        },
      }
    } catch (cause) {
      var failure = cause as AnyRecord
      recordDiagnostic('face', {
        reason: 'threw',
        sessionId: String(sessionId),
        message: failure && failure.message ? String(failure.message) : String(cause),
      })
      return { sessionId: sessionId, sessions: sessionsFace }
    }
  }

  ctx.slots.inject('conversation.input.model', function () {
    return ctx.slots.register(
      {
        name: 'conversation.input.model',
        id: 'provider-model-seat',
        // conversation.input.model 是 single 座位，官方用默认 priority(0) 占着；
        // 同 priority 才冲突，不同 priority 是「遮蔽」，最小者渲染（slots 文档把
        // single 定义为 replacement point）。取负值即由我们渲染。
        priority: -10,
        inject: directoryFace,
      },
      ModelSwitchSeat,
    )
  })

  // 设置页新增 Provider 标签（settings.section 是 list 座位，官方 Models 标签不受影响）
  ctx.slots.inject('settings.section', function () {
    return ctx.slots.register(
      {
        name: 'settings.section',
        id: 'provider',
        order: 15,
        label: function () {
          return t('nav')
        },
      },
      ProviderSettingsSection,
    )
  })

  // /model 命令：commandUi 对同名是「重复即抛」，没有 priority 遮蔽，所以只有官方
  // ui-model-selection 行被禁用时这里才注册得进去；官方在时静默让位（模型座位
  // 靠 priority 遮蔽已经接管，不受影响）。
  ctx.inject(['commandUi'], function (scope) {
    registerModelCommand(scope)
  })
}

// 纯函数，离线测试直接调；组件里用的是同一份实现

export { normalizeSelection, onPlanChange, mergePlanAccount, dropPlanAccount, lookupDetail, detailsOfProvider } from './data.js'
export { aliasSelection, withEffortLadder, LEGACY_PROVIDER_ALIASES } from './model-seat.js'
export { piAiBridgeRows, piAiUpstreamText, piAiToggleState, presetPickState, providerSaveOps, isRouteConfigured, refreshFailure, routeYamlOf, capabilityBadges, capabilityKeysOf, capabilitiesKnown, modelRow, modelTip, buildEditRows, resolveAddDefaults, EFFORT_LEVELS, DEFAULT_EFFORT_LADDER, EFFORT_FAMILY_LADDERS, effortsDraftOf, prefillEffortsOf, effortsToDeclared, payloadFromRows } from './settings.js'
export { providerEditForm, providerEditSaveOps, validateProviderEdit, isProviderEditDirty, PROVIDER_API_OPTIONS } from './provider-edit.js'
export { reasoningTextOf, defaultEffortOf, headlineChips, shortWindowLabel, relativeTime, resetCountdownText, quotaShortOf, quotaTextOf, quotaTipOf, providerAlerts } from './format.js'
export { LOCAL_DICT, localT, t, tf, setT } from './i18n.js'
export { buildModelEditor, patchModelRow, addModelRow, validateModelRows, modelListPayload, isDefaultCatalogEquivalent } from './model-editor.js'
