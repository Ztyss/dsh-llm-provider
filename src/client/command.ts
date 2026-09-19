/**
 * /model 命令：按 provider 过滤 / 搜索模型 / 显示余额。
 * commandUi 对同名是「重复即抛」，没有 priority 遮蔽——官方 ui-model-selection 行还在时
 * 注册会抛，调用方静默让位；官方行被禁用后这里接管。
 */
import { accountsById, loadModelCatalog, loadPlanStatus, submitSelection } from './data.js'
import { quotaTextOf } from './format.js'
import { t } from './i18n.js'
import type { ClientScope, SessionsFace } from './types.js'

export function registerModelCommand(scope: ClientScope): void {
  var commandUi = scope.commandUi
  if (commandUi === undefined || typeof commandUi.register !== 'function') return
  scope.effect(
    function () {
      try {
        return commandUi!.register({
          name: 'model',
          label: function () {
            return t('cmd.label')
          },
          description: function () {
            return t('cmd.description')
          },
          /**
           * 官方 ui-commands 的契约里这一项是**必填**：CommandUiRuntime.candidates() 对注册表里
           * 每一条贡献都直接调 `contribution.available(session)`，不做防御；漏了它那一抛会打挂
           * **整批** `/` 候选（菜单一组不剩 → 自动关闭），用户看到的就是 composer 左下那枚「＋」
           * 点了没反应、打 `/` 也不弹（issue #7）。
           *
           * 口径照官方 ui-model-selection 的同名实现：被寻址成子代理的会话不能用模型选择
           * （那是 agent 自己的事），普通会话放行。sessions 面缺席或没有这个方法时一律放行——
           * 契约只要求返回布尔，不能因为拿不到服务就抛。
           */
          available: function (session: { sessionId?: string }): boolean {
            var sessions = scope.sessions as SessionsFace | undefined
            if (sessions === undefined || sessions === null || typeof sessions.subagentAddress !== 'function') return true
            var sessionId = session !== null && session !== undefined ? session.sessionId : undefined
            if (typeof sessionId !== 'string' || sessionId === '') return true
            return sessions.subagentAddress(sessionId) === undefined
          },
          ui: {
            kind: 'popupSelect',
            options: function () {
              return Promise.all([loadModelCatalog(), loadPlanStatus(false)])
                .then(function (both) {
                  var groups = both[0].groups
                  var accounts = accountsById(both[1])
                  var rows = []
                  for (var i = 0; i < groups.length; i += 1) {
                    var group = groups[i]
                    var quota = quotaTextOf(accounts[group.id])
                    for (var j = 0; j < group.models.length; j += 1) {
                      rows.push({
                        id: group.id + '/' + group.models[j].id,
                        label: group.models[j].id,
                        detail: group.id + (quota === undefined ? '' : ' · ' + quota),
                      })
                    }
                  }
                  return rows
                })
            },
            onSelect: function (option, session) {
              var parts = String(option.id).split('/')
              var provider = parts.shift()
              var model = parts.join('/')
              if (provider === undefined || provider === '' || model === '') {
                throw new Error(t('cmd.badRow'))
              }
              var sessionId = session !== null && session !== undefined ? session.sessionId : undefined
              if (typeof sessionId !== 'string') throw new Error(t('cmd.noSession'))
              return submitSelection(sessionId, provider, model, undefined)
            },
          },
        })
      } catch (cause) {
        // 同名命令已存在（官方 /model 还在）：让位，其余功能不受影响
        return function () {}
      }
    },
    'dsh-llm-provider: /model contribution',
  )
}
