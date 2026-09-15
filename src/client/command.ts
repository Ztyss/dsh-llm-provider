/**
 * /model 命令：按 provider 过滤 / 搜索模型 / 显示余额。
 * commandUi 对同名是「重复即抛」，没有 priority 遮蔽——官方 ui-model-selection 行还在时
 * 注册会抛，调用方静默让位；官方行被禁用后这里接管。
 */
import { accountsById, loadModelCatalog, loadPlanStatus, submitSelection } from './data.js'
import { quotaTextOf } from './format.js'
import type { ClientScope } from './types.js'

export function registerModelCommand(scope: ClientScope): void {
  var commandUi = scope.commandUi
  if (commandUi === undefined || typeof commandUi.register !== 'function') return
  scope.effect(
    function () {
      try {
        return commandUi!.register({
          name: 'model',
          label: function () {
            return '切换模型'
          },
          description: function () {
            return '按 provider 过滤 / 搜索模型 / 显示余额'
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
                throw new Error('无法解析这个模型行')
              }
              var sessionId = session !== null && session !== undefined ? session.sessionId : undefined
              if (typeof sessionId !== 'string') throw new Error('当前没有会话，无法切换模型')
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
