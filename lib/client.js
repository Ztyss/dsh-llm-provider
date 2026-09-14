/**
 * dsh-provider 浏览器端（classic script，无构建步骤）。
 *
 * 挂在 composer 的 `conversation.input.right` 座位：一个额度徽标，点开是账户面板。
 * 额度数据来自宿主端同源路由 `GET /plan/status`；
 * 当前 provider 从会话投影读；切换通过同源 /api/session/selectModel RPC 提交。
 */
window.__ModuleLoader__.load({
  id: 'dsh-provider',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')

    /**
     * 需要的客户端服务：座位注册表 + 会话。
     * `remote` / `remote.session` 是官方目录服务内部要用的：其方法被绑定到调用方上下文，
     * 少声明就会在 directoryFor 里报 "cannot get property remote.session without inject"。
     */
    var inject = ['slots', 'sessions', 'remote', 'remote.session']

    var REFRESH_MS = 300000

    /** 插件样式：沿用 GUI 的 CSS 变量，跟模型座位视觉一致。 */
    var css =
      '.plan_root{position:relative;display:inline-flex;align-items:center}' +
      '.plan_trigger{min-height:28px;display:inline-flex;align-items:center;gap:4px;padding:3px 6px;' +
      'font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);background:0 0;border:0;' +
      'border-radius:6px;cursor:pointer;white-space:nowrap}' +
      '.plan_trigger:hover,.plan_trigger:focus-visible{color:var(--dsw-alias-label-secondary)}' +
      '.plan_dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}' +
      '.plan_dot_ok{background:#22a06b}.plan_dot_warn{background:#d9a300}.plan_dot_bad{background:#d9534f}' +
      '.plan_menu{position:absolute;bottom:calc(100% + 6px);right:0;z-index:100;width:380px;' +
      'max-width:min(440px,100vw - 32px);box-sizing:border-box;padding:6px;display:flex;flex-direction:column;gap:2px;' +
      'background:var(--dsw-specific-menu,var(--dsw-alias-bg-l1,#fff));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
      'border-radius:12px;box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));' +
      'max-height:min(520px,65vh);overflow:auto;text-align:left}' +
      '.plan_row{box-sizing:border-box;width:100%;display:block;padding:8px 10px;border:0;border-radius:8px;' +
      'background:0 0;cursor:pointer;color:var(--dsw-alias-label-primary);text-align:left;font:inherit}' +
      '.plan_row:hover:not(:disabled){background:var(--dsw-alias-fill-l2,rgba(0,0,0,.04))}' +
      '.plan_row:disabled{cursor:default;opacity:.75}' +
      '.plan_rowCurrent{background:var(--dsw-alias-fill-l2,rgba(0,0,0,.04))}' +
      '.plan_head{display:flex;align-items:center;gap:6px;font-size:13px;line-height:18px;font-weight:500}' +
      '.plan_tag{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary);font-weight:400}' +
      '.plan_meta{margin-top:2px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}' +
      '.plan_bar{margin-top:4px;height:4px;border-radius:2px;background:var(--dsw-alias-fill-l2,rgba(0,0,0,.08));overflow:hidden}' +
      '.plan_barFill{display:block;height:100%;border-radius:2px}' +
      '.plan_warnText{color:#b8860b}.plan_badText{color:#d9534f}' +
      '.plan_note{margin-top:3px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);word-break:break-word}' +
      '.plan_footer{display:flex;align-items:center;gap:8px;padding:6px 10px 2px;font-size:11px;' +
      'color:var(--dsw-alias-label-tertiary);border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));margin-top:4px}' +
      '.plan_refresh{margin-left:auto;font:inherit;font-size:11px;color:inherit;background:0 0;border:0;cursor:pointer;padding:0}' +
      '.plan_refresh:hover{text-decoration:underline}' +
      // ---- 模型选择器（搜索/过滤/余额）----
      '.mp_search{box-sizing:border-box;width:100%;padding:6px 10px;margin-bottom:4px;font:inherit;font-size:12px;' +
      'color:var(--dsw-alias-label-primary);background:var(--dsw-alias-fill-l1,rgba(0,0,0,.03));' +
      'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:8px;outline:0}' +
      '.mp_search:focus{border-color:var(--dsw-alias-border-active,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}' +
      '.mp_chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}' +
      '.mp_chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font:inherit;font-size:11px;line-height:16px;' +
      'color:var(--dsw-alias-label-secondary);background:0 0;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
      'border-radius:999px;cursor:pointer}' +
      '.mp_chip[data-on="1"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-fill-l2,rgba(0,0,0,.05));' +
      'border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}' +
      '.mp_modelName{font-weight:500}' +
      '.mp_empty{padding:14px 10px;text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary)}' +
      // ---- 设置页 Provider 标签 ----
      '.pv_section{display:flex;flex-direction:column;gap:12px;max-width:640px}' +
      '.pv_card{padding:14px 16px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;' +
      'background:var(--dsw-alias-bg-l1,#fff)}' +
      '.pv_title{font-size:13px;font-weight:600;line-height:18px;margin-bottom:8px}' +
      '.pv_line{display:flex;align-items:center;gap:8px;font-size:12px;line-height:20px;padding:2px 0;' +
      'color:var(--dsw-alias-label-secondary)}' +
      '.pv_action{margin-left:auto;font:inherit;font-size:11px;color:var(--dsw-alias-label-primary);' +
      'background:var(--dsw-alias-fill-l2,rgba(0,0,0,.05));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
      'border-radius:6px;padding:2px 10px;cursor:pointer}' +
      '.pv_action:disabled{opacity:.5;cursor:default}' +
      // ---- Provider 标签：CC Switch 式卡片 ----
      '.pv_stack{display:flex;flex-direction:column;gap:10px;max-width:640px}' +
      '.pv_pc{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;' +
      'background:var(--dsw-alias-bg-l1,#fff)}' +
      '.pv_pcHead{display:flex;align-items:center;gap:8px;width:100%;padding:11px 14px;border:0;background:0 0;' +
      'cursor:pointer;font:inherit;color:var(--dsw-alias-label-primary);text-align:left}' +
      '.pv_pcHead:hover{background:var(--dsw-alias-fill-l1,rgba(0,0,0,.03))}' +
      '.pv_pcName{font-size:14px;font-weight:600;line-height:20px}' +
      '.pv_pcChips{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:12px;white-space:nowrap}' +
      '.pv_chipItem{display:inline-flex;align-items:baseline;gap:3px}' +
      '.pv_chipReset{color:var(--dsw-alias-label-tertiary);font-size:11px}' +
      '.pv_pcCaret{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;width:12px;text-align:center}' +
      '.pv_pcBody{padding:6px 14px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));' +
      'display:flex;flex-direction:column;gap:2px}' +
      '.pv_line .plan_tag{margin-left:0}' +
      '.pv_line .pv_push{margin-left:auto}' +
      '.pv_row>span:first-child{width:64px;flex:none}' +
      // 值框（API 密钥/端点）：Cherry 式输入框外观
      '.pv_field{display:inline-flex;align-items:center;min-width:200px;max-width:100%;padding:4px 10px;' +
      'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:8px;' +
      'background:var(--dsw-alias-fill-l1,rgba(0,0,0,.03));font-size:12px;line-height:18px;' +
      'color:var(--dsw-alias-label-secondary)}' +
      // 模型区外框
      '.pv_mBox{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:10px;' +
      'padding:4px 10px 8px;display:flex;flex-direction:column}' +
      '.pv_mRight{margin-left:auto;display:inline-flex;align-items:center;gap:8px}' +
      '.pv_iconBtn{border:0;background:0 0;cursor:pointer;font:inherit;font-size:13px;padding:2px 4px;' +
      'border-radius:6px;color:var(--dsw-alias-label-tertiary)}' +
      '.pv_iconBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-fill-l2,rgba(0,0,0,.05))}' +
      // ---- Provider 页内二级标签 ----
      '.pv_tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));' +
      'margin-bottom:12px}' +
      '.pv_tab{font:inherit;font-size:13px;padding:7px 12px;border:0;background:0 0;cursor:pointer;' +
      'color:var(--dsw-alias-label-secondary);border-bottom:2px solid transparent;margin-bottom:-1px}' +
      '.pv_tab:hover{color:var(--dsw-alias-label-primary)}' +
      '.pv_tabOn{color:var(--dsw-alias-label-primary);border-bottom-color:#3b5bdb;font-weight:600}' +
      // ---- Provider 卡片：CC Switch 式名称+链接两行布局 ----
      '.pv_pcLead{display:flex;flex-direction:column;gap:1px;min-width:0}' +
      '.pv_pcLeadRow{display:flex;align-items:center;gap:8px}' +
      '.pv_pcLink{font-size:11px;line-height:15px;color:#3b5bdb;text-decoration:none;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px}' +
      '.pv_pcLink:hover{text-decoration:underline}' +
      // ---- 模型行悬浮详情卡（Cherry Studio 式）----
      '.pv_mRow{position:relative;display:flex;align-items:center;gap:8px;padding:2px 0}' +
      '.pv_mId{flex:none;width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
      'font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);' +
      'font-family:ui-monospace,Menlo,Consolas,monospace}' +
      '.pv_mName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pv_mHeadRow{display:flex;align-items:center;gap:8px;padding:4px 0 3px;font-size:11px;' +
      'color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}' +
      '.pv_mCaps{flex:none;width:92px;display:inline-flex;justify-content:flex-end;align-items:center;gap:6px}' +
      '.pv_mCtx{flex:none;width:52px;text-align:right;font-size:11px;line-height:16px;' +
      'color:var(--dsw-alias-label-tertiary)}' +
      '.pv_capIcons{display:inline-flex;gap:6px;font-size:12px;line-height:16px}' +
      '.pv_capMini{font-size:10px;line-height:15px;padding:0 6px;border-radius:999px;white-space:nowrap}' +
      '.pv_mHead{display:flex;align-items:center;gap:6px;flex:none;font:inherit;font-size:12px;font-weight:600;' +
      'padding:4px 0;border:0;background:0 0;cursor:pointer;color:var(--dsw-alias-label-primary);text-align:left}' +
      '.pv_mHead:hover{color:var(--dsw-alias-label-secondary)}' +
      '.pv_mHeadRow2{display:flex;align-items:center;gap:8px;padding:2px 0 4px}' +
      '.pv_mFilter{flex:none;width:220px;box-sizing:border-box;padding:3px 24px 3px 10px;font:inherit;font-size:12px;' +
      'border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:8px;outline:0;' +
      'background:var(--dsw-alias-fill-l1,rgba(0,0,0,.03));color:var(--dsw-alias-label-primary)}' +
      '.pv_mFilter:focus{border-color:var(--dsw-alias-border-active,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}' +
      '.pv_fbox{position:relative;display:inline-flex;align-items:center;flex:none}' +
      '.pv_fclear{position:absolute;right:2px;top:50%;transform:translateY(-50%);border:0;background:0 0;' +
      'cursor:pointer;font:inherit;font-size:14px;line-height:1;padding:2px 6px;' +
      'color:var(--dsw-alias-label-tertiary);border-radius:6px}' +
      '.pv_fclear:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-fill-l2,rgba(0,0,0,.05))}' +
      '.pv_tip{display:none;position:absolute;left:0;bottom:calc(100% + 6px);z-index:300;width:270px;' +
      'padding:12px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));' +
      'background:var(--dsw-specific-menu,var(--dsw-alias-bg-l1,#fff));' +
      'box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));flex-direction:column;gap:6px}' +
      '.pv_mRow:hover .pv_tip{display:flex}' +
      '.pv_tipTitle{font-size:13px;font-weight:600;line-height:18px}' +
      '.pv_tipRow{display:flex;gap:10px;font-size:12px;line-height:18px}' +
      '.pv_tipLabel{flex:none;width:60px;color:var(--dsw-alias-label-tertiary)}' +
      '.pv_tipDim{font-size:11px;color:var(--dsw-alias-label-tertiary)}' +
      '.pv_tipCaps{display:flex;gap:6px;flex-wrap:wrap}' +
      '.pv_cap{font-size:11px;padding:1px 8px;border-radius:999px}' +
      '.pv_capVision{color:#2f9e44;background:rgba(47,158,68,.12)}' +
      '.pv_capVideo{color:#7c3aed;background:rgba(124,58,237,.12)}' +
      '.pv_capReason{color:#b8860b;background:rgba(217,162,0,.15)}'

    var tagId = 'dsh-provider/plan.css'
    function installCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') !== null) return
      var tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-provider'
      tag.dataset.pluginCss = tagId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    /** 模型选择投影的 cell；读不到时给一个永远 undefined 的假 cell，组件照样能渲染。 */
    /** 测试环境标识：标题加「· 测试」后缀 + favicon 右下角盖橙色「测」角标。 */
    function markTestEnv() {
      try {
        if (document.title.indexOf('测试') === -1) {
          document.title = (document.title === '' ? 'dsh' : document.title) + ' · 测试'
        }
        var iconLink = document.querySelector('link[rel~="icon"]')
        var img = new window.Image()
        img.onload = function () {
          var canvas = document.createElement('canvas')
          canvas.width = 64
          canvas.height = 64
          var g = canvas.getContext('2d')
          if (g !== null && g !== undefined) {
            g.drawImage(img, 0, 0, 64, 64)
            g.fillStyle = '#e8890c'
            g.beginPath()
            g.arc(46, 46, 20, 0, Math.PI * 2)
            g.fill()
            g.fillStyle = '#ffffff'
            g.font = 'bold 24px sans-serif'
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.fillText('测', 46, 48)
            setFavicon(canvas.toDataURL('image/png'))
            return
          }
          setFavicon(undefined)
        }
        img.onerror = function () { setFavicon(undefined) }
        img.src = iconLink === null ? '/favicon.ico' : iconLink.href
      } catch (cause) { /* 标不了就算了 */ }
    }

    /** 替换 favicon；dataUrl 为 undefined 时退到一个纯「测」字圆形 icon。 */
    function setFavicon(dataUrl) {
      try {
        var link = document.querySelector('link[rel~="icon"]')
        if (link === null || link === undefined) {
          link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
        }
        if (dataUrl !== undefined) {
          link.href = dataUrl
          return
        }
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
          '<circle cx="32" cy="32" r="30" fill="#e8890c"/>' +
          '<text x="32" y="43" font-size="30" font-weight="bold" fill="#fff" text-anchor="middle">测</text></svg>'
        link.href = 'data:image/svg+xml,' + encodeURIComponent(svg)
      } catch (cause) { /* 标不了就算了 */ }
    }

    var EMPTY_CELL = {
      getSnapshot: function () {
        return undefined
      },
      subscribe: function () {
        return function () {}
      },
    }

    function selectionCell(sessions, sessionId) {
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
    function unwrap(value) {
      if (value !== null && typeof value === 'object' && typeof value.provider === 'string') return value
      if (value !== null && typeof value === 'object' && value.next !== null && typeof value.next === 'object') {
        if (typeof value.next.provider === 'string') return value.next
      }
      return undefined
    }

    /** 读一次 snapshot store，失败当作没有。 */
    function snapshotOf(store) {
      if (store === undefined || store === null || typeof store.getSnapshot !== 'function') return undefined
      try {
        return store.getSnapshot()
      } catch (error) {
        return undefined
      }
    }

    /**
     * 轮询一个 snapshot store（官方目录服务给的 store）。
     * 不用 useSyncExternalStore：不同 dsh 版本上 store 的 subscribe 契约不保证一致，
     * 订阅失败会把整块 UI 拖崩；轮询只影响「当前」标记的实时性。
     */
    function usePolledSnapshot(store, intervalMs) {
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
    function normalizeGroups(rawGroups) {
      var groups = Array.isArray(rawGroups) ? rawGroups : []
      var normalized = []
      for (var i = 0; i < groups.length; i += 1) {
        var group = groups[i]
        if (group === null || typeof group !== 'object') continue
        var providerId = typeof group.provider === 'string' ? group.provider : group.id
        if (typeof providerId !== 'string') continue
        var models = []
        var raw = Array.isArray(group.models) ? group.models : []
        for (var j = 0; j < raw.length; j += 1) {
          var model = raw[j]
          if (typeof model === 'string') models.push({ id: model, name: model })
          else if (model !== null && typeof model === 'object' && typeof model.id === 'string') {
            var entry = { id: model.id, name: typeof model.name === 'string' ? model.name : model.id }
            var cw = model.contextWindow ?? model.context_window ?? model.maxContextWindow
            if (typeof cw === 'number' && Number.isFinite(cw) && cw > 0) entry.contextWindow = cw
            models.push(entry)
          }
        }
        normalized.push({
          id: providerId,
          name: typeof group.name === 'string' ? group.name : providerId,
          models: models,
        })
      }
      return normalized
    }

    /** 上下文窗口的人性化显示：1048576 → 1M，262144 → 256K。 */
    function formatContext(value) {
      var n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n) || n <= 0) return undefined
      if (n >= 1e6) {
        var m = n / 1e6
        return (Number.isInteger(m) ? String(m) : m.toFixed(1)) + 'M'
      }
      if (n >= 1e3) return Math.round(n / 1e3) + 'K'
      return String(n)
    }

    /** 从模型目录里取每个 provider 的首个模型，作为一键切换的落点。 */
    function firstModelByProvider(catalog) {
      var result = {}
      var groups = catalog === null || catalog === undefined ? [] : catalog.groups
      if (!Array.isArray(groups)) return result
      for (var i = 0; i < groups.length; i += 1) {
        var group = groups[i]
        if (group === null || typeof group !== 'object') continue
        // 分组的主键实测叫 provider（有的版本可能叫 id，两个都认）
        var providerId = typeof group.provider === 'string' ? group.provider : group.id
        var models = group.models
        if (typeof providerId !== 'string' || !Array.isArray(models) || models.length === 0) continue
        var first = models[0]
        var modelId = typeof first === 'string' ? first : first && first.id
        if (typeof modelId === 'string') result[providerId] = modelId
      }
      return result
    }

    /** 剩余百分比 → 颜色类。 */
    function toneClass(percent) {
      if (typeof percent !== 'number') return ''
      if (percent <= 10) return 'plan_badText'
      if (percent <= 30) return 'plan_warnText'
      return ''
    }

    function toneColor(percent) {
      if (typeof percent !== 'number') return '#22a06b'
      if (percent <= 10) return '#d9534f'
      if (percent <= 30) return '#d9a300'
      return '#22a06b'
    }

    /** 一个账户里最紧的窗口剩余百分比。 */
    function worstPercent(account) {
      var worst
      var windows = Array.isArray(account.windows) ? account.windows : []
      for (var i = 0; i < windows.length; i += 1) {
        var percent = windows[i].percentLeft
        if (typeof percent !== 'number') continue
        if (worst === undefined || percent < worst) worst = percent
      }
      return worst
    }

    function dotClass(account) {
      if (account === undefined || account === null) return 'plan_dot'
      if (account.error !== undefined) return 'plan_dot plan_dot_bad'
      if (account.authConfigured === false) return 'plan_dot plan_dot_warn'
      if (account.kind === 'unsupported' || account.kind === 'unknown-provider') return 'plan_dot plan_dot_warn'
      var percent = worstPercent(account)
      if (percent === undefined) return 'plan_dot plan_dot_ok'
      if (percent <= 10) return 'plan_dot plan_dot_bad'
      if (percent <= 30) return 'plan_dot plan_dot_warn'
      return 'plan_dot plan_dot_ok'
    }

    function shortName(account) {
      return account.displayName === undefined ? account.id : account.displayName
    }

    /** 徽标上的短字：优先余额，其次最紧窗口的剩余百分比。 */
    function summaryOf(account) {
      if (account === undefined || account === null) return '额度'
      if (account.authConfigured === false) return shortName(account) + ' 未配置 key'
      if (account.error !== undefined) return shortName(account) + ' 查询失败'
      if (account.kind === 'unsupported') return shortName(account) + ' 看控制台'
      if (account.kind === 'unknown-provider') return shortName(account) + ' 无适配器'
      var balances = Array.isArray(account.balances) ? account.balances : []
      if (balances.length > 0) return shortName(account) + ' ' + balances[0].value
      var percent = worstPercent(account)
      if (typeof percent === 'number') return shortName(account) + ' 余 ' + String(percent) + '%'
      var windows = Array.isArray(account.windows) ? account.windows : []
      if (windows.length > 0) return shortName(account) + ' ' + String(windows.length) + ' 个窗口'
      return shortName(account)
    }

    function formatReset(iso) {
      if (typeof iso !== 'string' || iso === '') return undefined
      var date = new Date(iso)
      if (Number.isNaN(date.getTime())) return undefined
      var delta = date.getTime() - Date.now()
      if (delta <= 0) return '即将重置'
      var minutes = Math.round(delta / 60000)
      if (minutes < 60) return String(minutes) + ' 分钟后重置'
      var hours = Math.floor(minutes / 60)
      if (hours < 48) return String(hours) + ' 小时 ' + String(minutes % 60) + ' 分后重置'
      return String(Math.round(hours / 24)) + ' 天后重置'
    }

    function numberText(value) {
      if (typeof value !== 'number') return undefined
      return Number.isInteger(value) ? String(value) : value.toFixed(2)
    }

    /** 一个额度窗口：进度条 + 剩余/总量 + 重置时间。 */
    /** 一个额度窗口：进度条 + 剩余/总量 + 重置时间。 */
    function WindowRow(props) {
      var item = props.item
      var detail = []
      if (item.remaining !== undefined || item.limit !== undefined) {
        detail.push((numberText(item.remaining) || '?') + ' / ' + (numberText(item.limit) || '?'))
      }
      if (item.used !== undefined) detail.push('已用 ' + (numberText(item.used) || '?'))
      var reset = formatReset(item.resetAt)
      if (reset !== undefined) detail.push(reset)
      var percent = item.percentLeft

      var line = react.createElement(
        'div',
        { className: 'plan_meta ' + toneClass(percent) },
        react.createElement('span', null, item.window),
        react.createElement('span', null, ' · ' + detail.join(' · ')),
      )
      if (typeof percent !== 'number') return react.createElement('div', { style: { marginTop: '4px' } }, line)

      var bar = react.createElement(
        'div',
        { className: 'plan_bar' },
        react.createElement('span', {
          className: 'plan_barFill',
          style: { width: String(percent) + '%', background: toneColor(percent) },
        }),
      )
      return react.createElement('div', { style: { marginTop: '4px' } }, line, bar)
    }

    /** 一个账户一行；能切的时候点整行就是切换。 */
    function AccountRow(props) {
      var account = props.account
      var current = props.current
      var switchable = props.switchable
      var onSelect = props.onSelect
      var firstModels = props.firstModels || {}

      var parts = [
        react.createElement(
          'div',
          { className: 'plan_head', key: 'head' },
          react.createElement('span', { className: dotClass(account), key: 'dot' }),
          react.createElement('span', { key: 'name' }, shortName(account)),
          account.membership === undefined
            ? null
            : react.createElement('span', { className: 'plan_tag', key: 'membership' }, account.membership),
          current ? react.createElement('span', { className: 'plan_tag', key: 'current' }, '当前') : null,
        ),
      ]

      var balances = Array.isArray(account.balances) ? account.balances : []
      for (var i = 0; i < balances.length; i += 1) {
        parts.push(
          react.createElement(
            'div',
            { className: 'plan_meta', key: 'balance-' + String(i) },
            balances[i].label + ' ' + balances[i].value,
          ),
        )
      }

      var windows = Array.isArray(account.windows) ? account.windows : []
      for (var j = 0; j < windows.length; j += 1) {
        parts.push(react.createElement(WindowRow, { item: windows[j], key: 'window-' + String(j) }))
      }

      if (account.error !== undefined) {
        parts.push(react.createElement('div', { className: 'plan_note plan_badText', key: 'error' }, account.error))
      }
      if (account.note !== undefined) {
        parts.push(react.createElement('div', { className: 'plan_note', key: 'note' }, account.note))
      }
      if (switchable && !current) {
        parts.push(
          react.createElement('div', { className: 'plan_meta', key: 'hint' }, '点击切到 ' + String(firstModels[account.id] || account.defaultModel)),
        )
      }

      return react.createElement(
        'button',
        {
          type: 'button',
          key: account.id,
          className: 'plan_row' + (current ? ' plan_rowCurrent' : ''),
          disabled: !switchable || current,
          title: !switchable ? '这个 provider 没有可用模型，无法切换' : '切到 ' + shortName(account),
          onClick: function () {
            onSelect(account)
          },
        },
        parts,
      )
    }

    /** 行渲染兜底：某一行出问题不该让整块 UI 消失。 */
    function SafeAccountRow(props) {
      try {
        return AccountRow(props)
      } catch (error) {
        return react.createElement(
          'div',
          { className: 'plan_note plan_badText' },
          String(props.account && props.account.id) + ' 渲染失败：' + String(error && error.message ? error.message : error),
        )
      }
    }
    /** 徽标 + 账户面板。 */
    function PlanBadge(props) {
      var sessionId = props.sessionId
      var sessions = props.sessions

      var openState = react.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var dataState = react.useState(null)
      var data = dataState[0]
      var setData = dataState[1]
      var errorState = react.useState(null)
      var error = errorState[0]
      var setError = errorState[1]
      var busyState = react.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var rootRef = react.useRef(null)

      // 订阅/读取包一层稳定闭包：useSyncExternalStore 要求引用稳定，且不会替我们绑 this
      var selectionCellRef = react.useMemo(
        function () {
          return selectionCell(sessions, sessionId)
        },
        [sessions, sessionId],
      )

      // 不用 useSyncExternalStore 订阅投影：投影 cell 的 subscribe 契约在不同 dsh 版本上
      // 不一定一致，订阅失败会把整块 UI 拖崩。改成挂载时读一次 + 每 5 秒刷新，
      // 只影响“当前”标记的实时性，不影响额度显示和切换。
      var selectionState = react.useState(undefined)
      var selection = selectionState[0]
      var setSelection = selectionState[1]
      react.useEffect(
        function () {
          function read() {
            try {
              setSelection(unwrap(selectionCellRef.getSnapshot()))
            } catch (error) {
              /* 投影读不到就当作没有当前选择 */
            }
          }
          read()
          var timer = setInterval(read, 5000)
          return function () {
            clearInterval(timer)
          }
        },
        [selectionCellRef],
      )

      var catalogState = react.useState({})
      var firstModels = catalogState[0]
      var setFirstModels = catalogState[1]

      var load = react.useCallback(function (force) {
        setBusy(true)
        fetch('/plan/status' + (force ? '?refresh=1' : ''), { headers: { accept: 'application/json' } })
          .then(function (response) {
            return response.json()
          })
          .then(function (payload) {
            setData(payload)
            setError(payload && payload.error ? String(payload.error) : null)
          })
          .catch(function (cause) {
            setError(cause && cause.message ? String(cause.message) : String(cause))
          })
          .then(function () {
            setBusy(false)
          })
      }, [])

      react.useEffect(
        function () {
          load(false)
          var timer = setInterval(function () {
            load(false)
          }, REFRESH_MS)
          return function () {
            clearInterval(timer)
          }
        },
        [load],
      )

      react.useEffect(
        function () {
          var cancelled = false
          fetch('/api/session/modelCatalog', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'dsh-provider-catalog-' + String(Date.now()),
              method: 'session/modelCatalog',
              payload: { args: {} },
            }),
          })
            .then(function (response) {
              return response.json()
            })
            .then(function (envelope) {
              var result = envelope && envelope.result
              if (cancelled || !result || result.ok !== true) return
              setFirstModels(firstModelByProvider(result.value))
            })
            .catch(function () {})
          return function () {
            cancelled = true
          }
        },
        [],
      )

      react.useEffect(
        function () {
          if (!open) return undefined
          function onPointerDown(event) {
            if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
          }
          function onKeyDown(event) {
            if (event.key === 'Escape') setOpen(false)
          }
          document.addEventListener('pointerdown', onPointerDown)
          document.addEventListener('keydown', onKeyDown)
          return function () {
            document.removeEventListener('pointerdown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
          }
        },
        [open],
      )

      var accounts = data !== null && Array.isArray(data.accounts) ? data.accounts : []
      // 当前 provider：优先官方目录服务的 current，退回会话投影
      var directorySnapshot = usePolledSnapshot(props.directory, 3000)
      var directoryCurrent = directorySnapshot !== undefined ? directorySnapshot.current : undefined
      var currentProvider = directoryCurrent !== undefined && directoryCurrent !== null
        ? directoryCurrent.provider
        : (selection === undefined || selection === null ? undefined : selection.provider)
      var current
      for (var i = 0; i < accounts.length; i += 1) {
        if (accounts[i].id === currentProvider) current = accounts[i]
      }

      function switchTo(account) {
        // 落点取模型目录里这个 provider 的首个模型；宿主给的 defaultModel 只作兜底
        var model = firstModels[account.id] || account.defaultModel
        if (typeof model !== 'string' || model === '') {
          setError('这个 provider 当前没有可用模型，无法切换')
          return
        }
        setBusy(true)
        // 走 GUI 自己的同源 RPC：Connection 的 client-request 信封 + /api/session/selectModel。
        // 不用 ctx.remote 是因为插件 apply 时它还没挂到客户端上下文上，拿不到实例。
        fetch('/api/session/selectModel', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'dsh-provider-' + String(Date.now()) + '-' + String(Math.random()).slice(2, 8),
            method: 'session/selectModel',
            payload: { args: { request: { sessionId: sessionId, provider: account.id, model: model } } },
          }),
        })
          .then(function (response) {
            return response.json()
          })
          .then(function (envelope) {
            var result = envelope && envelope.result
            if (!result || result.ok !== true) {
              setError(
                result && result.error
                  ? String(result.error.code) + ': ' + String(result.error.message)
                  : '切换失败',
              )
              return
            }
            setError(null)
            setOpen(false)
          })
          .catch(function (cause) {
            setError(cause && cause.message ? String(cause.message) : String(cause))
          })
          .then(function () {
            setBusy(false)
          })
      }

      var triggerText = summaryOf(current)
      if (current === undefined && accounts.length > 0) triggerText = String(accounts.length) + ' 个账户'

      var trigger = react.createElement(
        'button',
        {
          type: 'button',
          className: 'plan_trigger',
          'aria-expanded': open,
          title: error === null ? '额度与余额' : error,
          onClick: function () {
            setOpen(!open)
            if (!open) load(true)
          },
        },
        react.createElement('span', { className: dotClass(current) }),
        react.createElement('span', null, triggerText),
      )

      if (!open) return react.createElement('div', { className: 'plan_root', ref: rootRef }, trigger)

      var rows = accounts.map(function (account) {
        return react.createElement(SafeAccountRow, {
          account: account,
          key: account.id,
          current: currentProvider === account.id,
          switchable: typeof firstModels[account.id] === 'string',
          firstModels: firstModels,
          onSelect: switchTo,
        })
      })

      var footer = react.createElement(
        'div',
        { className: 'plan_footer' },
        react.createElement(
          'span',
          null,
          data === null || data.fetchedAt === undefined
            ? '未加载'
            : '更新于 ' + new Date(data.fetchedAt).toLocaleTimeString(),
        ),
        react.createElement(
          'button',
          {
            type: 'button',
            className: 'plan_refresh',
            onClick: function () {
              load(true)
            },
          },
          busy ? '刷新中…' : '刷新',
        ),
      )

      var menu = react.createElement(
        'div',
        { className: 'plan_menu' },
        rows,
        error === null ? null : react.createElement('div', { className: 'plan_note plan_badText' }, error),
        footer,
      )

      return react.createElement('div', { className: 'plan_root', ref: rootRef }, trigger, menu)
    }
    // ==================== 共享数据层 ====================

    /** 额度快照：60 秒内复用，force 绕过（和宿主端缓存同拍）。 */
    var planCache = { at: 0, value: null }
    function loadPlanStatus(force) {
      if (!force && planCache.value !== null && Date.now() - planCache.at < 60000) {
        return Promise.resolve(planCache.value)
      }
      return fetch('/plan/status' + (force === true ? '?refresh=1' : ''))
        .then(function (response) {
          return response.json()
        })
        .then(function (payload) {
          planCache = { at: Date.now(), value: payload }
          return payload
        })
    }

    /** 模型目录：session/modelCatalog 的同源 RPC（官方选择器走的是同一条）。 */
    function loadModelCatalog() {
      return fetch('/api/session/modelCatalog', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'dsh-provider-catalog-' + String(Date.now()),
          method: 'session/modelCatalog',
          payload: { args: {} },
        }),
      })
        .then(function (response) {
          return response.json()
        })
        .then(function (envelope) {
          var result = envelope && envelope.result
          if (!result || result.ok !== true) throw new Error('模型目录加载失败')
          var value = result.value === null || typeof result.value !== 'object' ? {} : result.value
          return normalizeGroups(value.groups)
        })
    }

    /** 切换模型：GUI 自己的同源 RPC，和官方选择器同一条路。 */
    function submitSelection(sessionId, provider, model, reasoningEffort) {
      var request = { sessionId: sessionId, provider: provider, model: model }
      if (typeof reasoningEffort === 'string') request.reasoningEffort = reasoningEffort
      return fetch('/api/session/selectModel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'dsh-provider-' + String(Date.now()) + '-' + String(Math.random()).slice(2, 8),
          method: 'session/selectModel',
          payload: { args: { request: request } },
        }),
      })
        .then(function (response) {
          return response.json()
        })
        .then(function (envelope) {
          var result = envelope && envelope.result
          if (!result || result.ok !== true) {
            throw new Error(
              result && result.error
                ? String(result.error.code) + ': ' + String(result.error.message)
                : '切换失败',
            )
          }
          return true
        })
    }

    /** provider id → 额度账户（两边用同一套 route id，直接对上）。 */
    function accountsById(payload) {
      var map = {}
      var accounts = payload !== null && payload !== undefined && Array.isArray(payload.accounts)
        ? payload.accounts
        : []
      for (var i = 0; i < accounts.length; i += 1) map[accounts[i].id] = accounts[i]
      return map
    }

    /** 一行里的余额短文案（给模型行/过滤 chip 复用）。 */
    function quotaTextOf(account) {
      if (account === undefined || account === null) return undefined
      if (account.authConfigured === false) return '未配置 key'
      if (account.error !== undefined) return '查询失败'
      if (account.kind === 'unsupported') return '看控制台'
      if (account.kind === 'unknown-provider') return '无适配器'
      var percent = worstPercent(account)
      if (typeof percent === 'number') return '余 ' + String(percent) + '%'
      var balances = Array.isArray(account.balances) ? account.balances : []
      if (balances.length > 0) return balances[0].value
      return undefined
    }

    /** 会不会没额度了：用于「选模型时一眼看出别选它」。 */
    function exhaustedOf(account) {
      if (account === undefined || account === null) return false
      var percent = worstPercent(account)
      return typeof percent === 'number' && percent <= 0
    }

    // ==================== 增强模型选择器 ====================

    /** 当前选中的模型名（先从投影找 provider/model，再从目录取 displayName）。 */
    function currentLabelOf(selection, groups) {
      if (selection === undefined || selection === null) return undefined
      for (var i = 0; i < groups.length; i += 1) {
        if (groups[i].id !== selection.provider) continue
        for (var j = 0; j < groups[i].models.length; j += 1) {
          if (groups[i].models[j].id === selection.model) return groups[i].models[j].name
        }
      }
      return selection.model
    }

    /**
     * composer 的模型座位（替代官方 ui-model-selection 的那个）。
     * 支持：按 provider 过滤、搜索模型名/provider 名、每行显示额度、点选即切。
     */
    function ModelSwitchSeat(props) {
      var sessionId = props.sessionId
      var sessions = props.sessions

      var openState = react.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var queryState = react.useState('')
      var query = queryState[0]
      var setQuery = queryState[1]
      var filterState = react.useState(null)
      var providerFilter = filterState[0]
      var setProviderFilter = filterState[1]
      var groupsState = react.useState([])
      var httpGroups = groupsState[0]
      var setGroups = groupsState[1]
      var accountsState = react.useState({})
      var accounts = accountsState[0]
      var setAccounts = accountsState[1]
      var errorState = react.useState(null)
      var error = errorState[0]
      var setError = errorState[1]
      var busyState = react.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var rootRef = react.useRef(null)
      var searchRef = react.useRef(null)

      // 官方目录服务（inject 面给过来的那个 store）——首选数据源
      var directorySnapshot = usePolledSnapshot(props.directory, 2000)
      recordDiagnostic('seat', {
        hasInjectFace: props.directory !== undefined,
        status: directorySnapshot === undefined ? null : directorySnapshot.status,
        current: directorySnapshot === undefined ? null : directorySnapshot.current,
        groupCount: directorySnapshot === undefined || !Array.isArray(directorySnapshot.groups)
          ? null
          : directorySnapshot.groups.length,
        error: directorySnapshot === undefined ? null : directorySnapshot.error,
      })
      var directoryGroups = directorySnapshot !== undefined && Array.isArray(directorySnapshot.groups)
        ? normalizeGroups(directorySnapshot.groups)
        : undefined
      var groups = directoryGroups !== undefined && directoryGroups.length > 0 ? directoryGroups : httpGroups
      var directoryCurrent = directorySnapshot !== undefined ? directorySnapshot.current : undefined

      // 兜底：没有官方服务时用会话投影读当前选择
      var selectionCellRef = react.useMemo(
        function () {
          return selectionCell(sessions, sessionId)
        },
        [sessions, sessionId],
      )
      var selectionState = react.useState(undefined)
      var projectionSelection = selectionState[0]
      var setSelection = selectionState[1]
      var selection = directoryCurrent !== undefined && directoryCurrent !== null ? directoryCurrent : projectionSelection

      var refresh = react.useCallback(
        function (force) {
          loadPlanStatus(force)
            .then(function (payload) {
              setAccounts(accountsById(payload))
            })
            .catch(function () {
              /* 额度拿不到不影响选模型 */
            })
        },
        [],
      )

      react.useEffect(
        function () {
          function read() {
            try {
              setSelection(unwrap(selectionCellRef.getSnapshot()))
            } catch (cause) {
              /* 投影读不到就当作没有当前选择 */
            }
          }
          read()
          var timer = setInterval(read, 5000)
          return function () {
            clearInterval(timer)
          }
        },
        [selectionCellRef],
      )

      react.useEffect(
        function () {
          var cancelled = false
          // 有官方目录服务时由它负责加载（load() 会把错误写进它自己的 store）；否则走同源 RPC
          if (typeof props.load === 'function') {
            props.load()
          } else {
            loadModelCatalog()
              .then(function (next) {
                if (!cancelled) setGroups(next)
              })
              .catch(function (cause) {
                if (!cancelled) setError(cause && cause.message ? String(cause.message) : String(cause))
              })
          }
          refresh(false)
          return function () {
            cancelled = true
          }
        },
        [refresh, props.load],
      )

      // 打开时重新拉一次额度、刷新目录并聚焦搜索框：用户点开就是为了看余额
      react.useEffect(
        function () {
          if (!open) return undefined
          refresh(false)
          if (typeof props.load === 'function') props.load()
          if (searchRef.current !== null && searchRef.current !== undefined) {
            try {
              searchRef.current.focus()
            } catch (cause) {
              /* 聚焦失败无所谓 */
            }
          }
          function onPointerDown(event) {
            if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
          }
          function onKeyDown(event) {
            if (event.key === 'Escape') setOpen(false)
          }
          document.addEventListener('pointerdown', onPointerDown)
          document.addEventListener('keydown', onKeyDown)
          return function () {
            document.removeEventListener('pointerdown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
          }
        },
        [open, refresh, props.load],
      )

      function choose(groupId, modelId) {
        if (busy) return
        setBusy(true)
        // 官方 select 会自己提交并刷新共享目录；拿不到就退回同源 RPC
        var request = typeof props.select === 'function'
          ? props.select({ provider: groupId, model: modelId })
          : submitSelection(sessionId, groupId, modelId, undefined)
        request
          .then(function (ok) {
            if (ok === false) throw new Error('宿主拒绝了这次切换')
            setError(null)
            setOpen(false)
            refresh(false)
          })
          .catch(function (cause) {
            setError(cause && cause.message ? String(cause.message) : String(cause))
          })
          .then(function () {
            setBusy(false)
          })
      }

      // 过滤：provider chip + 搜索词（匹配模型名、模型 id、provider 名/provider id）
      var needle = query.trim().toLowerCase()
      var visible = []
      for (var i = 0; i < groups.length; i += 1) {
        var group = groups[i]
        if (providerFilter !== null && group.id !== providerFilter) continue
        var account = accounts[group.id]
        var groupName = group.name.toLowerCase()
        var groupIdText = group.id.toLowerCase()
        for (var j = 0; j < group.models.length; j += 1) {
          var model = group.models[j]
          var haystack = (model.name + ' ' + model.id + ' ' + groupName + ' ' + groupIdText).toLowerCase()
          if (needle !== '' && haystack.indexOf(needle) === -1) continue
          visible.push({ group: group, model: model, account: account })
        }
      }

      var chips = [
        react.createElement(
          'button',
          {
            key: '__all',
            type: 'button',
            className: 'mp_chip',
            'data-on': providerFilter === null ? '1' : '0',
            onClick: function () {
              setProviderFilter(null)
            },
          },
          '全部 ' + String(groups.length),
        ),
      ]
      for (var k = 0; k < groups.length; k += 1) {
        ;(function (group) {
          var account = accounts[group.id]
          var quota = quotaTextOf(account)
          chips.push(
            react.createElement(
              'button',
              {
                key: group.id,
                type: 'button',
                className: 'mp_chip',
                'data-on': providerFilter === group.id ? '1' : '0',
                title: quota === undefined ? group.name : group.name + ' · ' + quota,
                onClick: function () {
                  setProviderFilter(providerFilter === group.id ? null : group.id)
                },
              },
              react.createElement('span', { className: dotClass(account) }),
              group.name + (quota === undefined ? '' : ' · ' + quota),
            ),
          )
        })(groups[k])
      }

      var rows = []
      for (var m = 0; m < visible.length; m += 1) {
        ;(function (entry) {
          var isCurrent = selection !== undefined && selection !== null
            && selection.provider === entry.group.id && selection.model === entry.model.id
          var quota = quotaTextOf(entry.account)
          var exhausted = exhaustedOf(entry.account)
          rows.push(
            react.createElement(
              'button',
              {
                key: entry.group.id + '/' + entry.model.id,
                type: 'button',
                className: 'plan_row' + (isCurrent ? ' plan_rowCurrent' : ''),
                disabled: busy || isCurrent,
                onClick: function () {
                  choose(entry.group.id, entry.model.id)
                },
              },
              react.createElement(
                'div',
                { className: 'plan_head' },
                react.createElement('span', { className: dotClass(entry.account) }),
                react.createElement('span', { className: 'mp_modelName' }, entry.model.name),
                isCurrent ? react.createElement('span', { className: 'plan_tag' }, '当前') : null,
              ),
              react.createElement(
                'div',
                { className: 'plan_meta ' + (exhausted ? 'plan_badText' : '') },
                entry.group.name + (quota === undefined ? '' : ' · ' + quota) + (exhausted ? ' · 额度已用尽' : ''),
              ),
            ),
          )
        })(visible[m])
      }
      if (rows.length === 0) {
        rows.push(
          react.createElement(
            'div',
            { className: 'mp_empty', key: '__empty' },
            needle === '' ? '没有可选模型' : '没有匹配 “' + query + '” 的模型',
          ),
        )
      }

      var label = currentLabelOf(selection, groups)
      var currentAccount = selection === undefined || selection === null ? undefined : accounts[selection.provider]
      var triggerText = label === undefined ? '选择模型' : label
      var triggerQuota = quotaTextOf(currentAccount)

      var trigger = react.createElement(
        'button',
        {
          type: 'button',
          className: 'plan_trigger',
          'aria-expanded': open ? 'true' : 'false',
          onClick: function () {
            setOpen(!open)
          },
        },
        react.createElement('span', { className: dotClass(currentAccount) }),
        react.createElement('span', null, triggerText),
        triggerQuota === undefined ? null : react.createElement('span', null, ' · ' + triggerQuota),
      )

      if (!open) return react.createElement('div', { className: 'plan_root', ref: rootRef }, trigger)

      var menu = react.createElement(
        'div',
        { className: 'plan_menu' },
        react.createElement('input', {
          ref: searchRef,
          className: 'mp_search',
          type: 'text',
          placeholder: '搜索模型或 provider（如 kimi）',
          value: query,
          onChange: function (event) {
            setQuery(event.target.value)
          },
        }),
        react.createElement('div', { className: 'mp_chips' }, chips),
        error === null ? null : react.createElement('div', { className: 'plan_note plan_badText' }, error),
        rows,
      )

      return react.createElement('div', { className: 'plan_root', ref: rootRef }, trigger, menu)
    }

    // ==================== 设置页 Provider 标签 ====================

    /** 窗口短名（卡片头部摘要）：5 小时窗口→5小时，每周窗口→每周，订阅周期→订阅。 */
    function shortWindowLabel(name) {
      var text = String(name ?? '')
      if (text.indexOf('5 小时') !== -1 || text.indexOf('5小时') !== -1) return '5小时'
      if (text.indexOf('每周') !== -1) return '每周'
      if (text.indexOf('订阅') !== -1) return '订阅'
      return text === '' ? '窗口' : text.slice(0, 4)
    }

    /** 重置倒计时紧凑格式：59m / 2h22m / 4d20h（对齐 CC Switch 的展示习惯）。 */
    function compactReset(iso) {
      if (typeof iso !== 'string' || iso === '') return ''
      var time = new Date(iso).getTime()
      if (Number.isNaN(time)) return ''
      var delta = time - Date.now()
      if (delta <= 0) return '即将重置'
      var minutes = Math.round(delta / 60000)
      if (minutes < 60) return String(minutes) + 'm'
      var hours = Math.floor(minutes / 60)
      if (hours < 48) return String(hours) + 'h' + String(minutes % 60) + 'm'
      var days = Math.floor(hours / 24)
      return String(days) + 'd' + String(hours % 24) + 'h'
    }

    /** 卡片头部摘要：直给最关键信息——coding plan 显示各窗口余量，API 显示余额。 */
    function headlineChips(account) {
      if (account === undefined || account === null) return [{ text: '无数据', percent: undefined }]
      if (account.authConfigured === false) return [{ text: '未配置 key', percent: 0 }]
      if (account.error !== undefined) return [{ text: '查询失败', percent: 0 }]
      if (account.kind === 'unsupported') return []
      if (account.kind === 'unknown-provider') return [{ text: '无适配器', percent: undefined }]
      var windows = Array.isArray(account.windows) ? account.windows : []
      var chips = []
      for (var i = 0; i < windows.length; i += 1) {
        if (typeof windows[i].percentLeft !== 'number') continue
        chips.push({
          text: shortWindowLabel(windows[i].window) + ' ' + String(windows[i].percentLeft) + '%',
          percent: windows[i].percentLeft,
          reset: windows[i].resetAt,
        })
      }
      if (chips.length > 0) return chips
      var balances = Array.isArray(account.balances) ? account.balances : []
      for (var j = 0; j < balances.length; j += 1) {
        chips.push({ text: String(balances[j].value), percent: undefined })
      }
      if (chips.length > 0) return chips
      return [{ text: summaryOf(account), percent: undefined }]
    }

    /** 链接显示文本：去掉协议和末尾斜杠。 */
    function linkTextOf(url) {
      return String(url).replace(/^https?:\/\//, '').replace(/\/$/, '')
    }

    /**
     * 会员等级显示映射：Kimi API 返回 LEVEL_* 枚举，官网套餐名是音乐术语四档
     * （Andante 日常使用 / Moderato 效率升级 / Allegretto 专业优选 / Allegro 全能尊享）。
     * 枚举→档位的对应按价位顺序推断，对不上时回退显示原始枚举。
     */
    function membershipLabel(level) {
      var map = {
        LEVEL_BASIC: 'Andante',
        LEVEL_MODERATE: 'Moderato',
        LEVEL_STANDARD: 'Moderato',
        LEVEL_ADVANCED: 'Allegretto',
        LEVEL_PRO: 'Allegretto',
        LEVEL_PREMIUM: 'Allegro',
        LEVEL_MAX: 'Allegro',
      }
      var key = String(level).toUpperCase()
      return map[key] !== undefined ? map[key] : String(level)
    }

    /** 模型行：名称 + 能力徽章（视觉/推理/视频）+ 上下文标签，悬浮出 Cherry 式详情卡。 */
    function modelRow(model, account, detailsById) {
      var detail = detailsById === undefined || detailsById === null ? undefined : detailsById[model.id]
      var cw = detail !== undefined && detail.contextWindow !== undefined ? detail.contextWindow : model.contextWindow
      var ctx = formatContext(cw)
      var caps = []
      if (detail !== undefined) {
        if (detail.vision === true) caps.push(react.createElement('span', { key: 'v', className: 'pv_capMini pv_capVision' }, '视觉'))
        if (detail.reasoning === true) caps.push(react.createElement('span', { key: 'r', className: 'pv_capMini pv_capReason' }, '推理'))
        if (detail.video === true) caps.push(react.createElement('span', { key: 't', className: 'pv_capMini pv_capVideo' }, '视频'))
      }
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
    function modelTip(model, account, detail) {
      var rows = [react.createElement('div', { className: 'pv_tipTitle', key: 't' }, model.name)]
      rows.push(tipLine('服务商', shortName(account), 'p'))
      rows.push(tipLine('模型 ID', model.id, 'id'))
      if (detail !== undefined) {
        var caps = []
        if (detail.vision === true) caps.push(tipCap('视觉', 'pv_capVision'))
        if (detail.video === true) caps.push(tipCap('视频', 'pv_capVideo'))
        if (detail.reasoning === true) caps.push(tipCap('推理', 'pv_capReason'))
        if (caps.length > 0) rows.push(react.createElement('div', { className: 'pv_tipCaps', key: 'c' }, caps))
        if (detail.contextWindow !== undefined) rows.push(tipLine('上下文窗口', detail.contextWindow.toLocaleString('en-US'), 'cw'))
        if (detail.maxTokens !== undefined) rows.push(tipLine('最大输出', detail.maxTokens.toLocaleString('en-US'), 'mt'))
        rows.push(tipLine('思维链', detail.reasoning === true
          ? (Array.isArray(detail.thinkingLevels) && detail.thinkingLevels.length > 0 ? detail.thinkingLevels.join('、') : '自动')
          : '关闭', 'tk'))
      } else {
        rows.push(react.createElement('div', { className: 'pv_tipDim', key: 'dim' }, '该模型没有本地元数据'))
      }
      return react.createElement('div', { className: 'pv_tip' }, rows)
    }

    function tipLine(label, value, key) {
      return react.createElement(
        'div',
        { className: 'pv_tipRow', key: String(key) },
        react.createElement('span', { className: 'pv_tipLabel' }, label),
        react.createElement('span', null, String(value)),
      )
    }

    function tipCap(text, cls) {
      return react.createElement('span', { className: 'pv_cap ' + cls }, text)
    }

    /** 模型过滤的模糊匹配：子串 → 缩写子序列（ds→deepseek）→ 编辑距离容错（deapseek→deepseek）。 */
    function fuzzyMatch(query, text) {
      var q = String(query).toLowerCase().trim()
      if (q === '') return true
      var words = q.split(/\s+/)
      for (var w = 0; w < words.length; w += 1) {
        if (!fuzzyWord(words[w], String(text).toLowerCase())) return false
      }
      return true
    }

    function fuzzyWord(word, haystack) {
      if (word === '') return true
      if (haystack.indexOf(word) !== -1) return true
      // 缩写：子序列匹配（短查询才启用，避免噪音；ds/dsk/k35/v4pro 这类）
      if (word.length <= 5 && isSubsequence(word, haystack)) return true
      // 容错：对分词结果算 Damerau-Levenshtein 距离（deapseek→deepseek 是相邻交换，距离 1）
      // 注意：不切分「.」（k2.8 是版本号整体），且 3 个字符以下不做容错（k3≠k2，避免误命中）
      var tokens = haystack.split(/[\s\-_/:]+/)
      for (var i = 0; i < tokens.length; i += 1) {
        if (tokens[i] === '') continue
        var distance = word.length >= 3 ? damerauLevenshtein(word, tokens[i]) : 99
        if (distance <= 1) return true
        if (word.length >= 6 && distance <= 2) return true
      }
      // 被拆散的整串再试一次（deep+seek 拼回 deepseek）
      var joined = tokens.join('')
      var joinedDistance = word.length >= 3 ? damerauLevenshtein(word, joined) : 99
      if (joinedDistance <= 1) return true
      if (word.length >= 6 && joinedDistance <= 2) return true
      return false
    }

    function isSubsequence(needle, haystack) {
      var i = 0
      for (var j = 0; j < haystack.length && i < needle.length; j += 1) {
        if (haystack.charAt(j) === needle.charAt(i)) i += 1
      }
      return i === needle.length
    }

    /** Damerau-Levenshtein 编辑距离（含相邻交换），O(n·m)——词都很短，无所谓。 */
    function damerauLevenshtein(a, b) {
      var la = a.length
      var lb = b.length
      if (Math.abs(la - lb) > 2) return 99
      var d = []
      for (var i = 0; i <= la; i += 1) {
        d.push(new Array(lb + 1).fill(0))
        d[i][0] = i
      }
      for (var j = 0; j <= lb; j += 1) d[0][j] = j
      for (var i = 1; i <= la; i += 1) {
        for (var j = 1; j <= lb; j += 1) {
          var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1
          var best = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
          if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
            best = Math.min(best, d[i - 2][j - 2] + 1)
          }
          d[i][j] = best
        }
      }
      return d[la][lb]
    }

    /** 单个摘要 chip：余量数字按余量配色，后挂紧凑重置倒计时。 */
    function headlineChip(chip, key) {
      var parts = [
        react.createElement('span', { key: 't', style: { color: toneColor(chip.percent) } }, chip.text),
      ]
      if (chip.reset !== undefined && chip.reset !== '') {
        parts.push(react.createElement('span', { key: 'r', className: 'pv_chipReset' }, compactReset(chip.reset)))
      }
      return react.createElement('span', { key: String(key), className: 'pv_chipItem' }, parts)
    }

    /**
     * Provider 标签：CC Switch 式卡片。
     * 每个 provider 一张分割明显的卡片，头部一行直给最关键信息（coding plan 的
     * 5小时/订阅余量、API 的余额），点卡片展开看窗口进度与明细；有报警/错误的卡片
     * 默认展开。pi-ai 桥接沉底且默认折叠（次要信息）。
     */
    function ProviderSettingsSection() {
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
      var openState = react.useState({})
      var openMap = openState[0]
      var setOpenMap = openState[1]

      var refresh = react.useCallback(function (force) {
        fetch('/provider/status')
          .then(function (response) {
            return response.json()
          })
          .then(function (payload) {
            setStatus(payload)
          })
          .catch(function () {
            setStatus({ bridge: { active: false, error: '宿主端状态不可用' } })
          })
        loadPlanStatus(force)
          .then(function (payload) {
            setPlan(payload)
          })
          .catch(function (cause) {
            setNote(cause && cause.message ? String(cause.message) : String(cause))
          })
      }, [])

      react.useEffect(
        function () {
          refresh(false)
        },
        [refresh],
      )

      // 展开区要显示的模型列表：模型目录走官方同一条 RPC
      react.useEffect(
        function () {
          var cancelled = false
          loadModelCatalog()
            .then(function (groups) {
              if (!cancelled) setCatalogGroups(groups)
            })
            .catch(function () { /* 模型列表拿不到就留空，卡片头部信息不受影响 */ })
          return function () {
            cancelled = true
          }
        },
        [],
      )

      // 模型详情（悬浮卡元数据）：来自生效 pi-ai 包的数据文件
      react.useEffect(
        function () {
          var cancelled = false
          fetch('/provider/models')
            .then(function (response) {
              return response.json()
            })
            .then(function (payload) {
              if (cancelled || payload === null || !Array.isArray(payload.models)) return
              var map = {}
              for (var i = 0; i < payload.models.length; i += 1) {
                map[payload.models[i].id] = payload.models[i]
              }
              setDetailsById(map)
            })
            .catch(function () { /* 详情拿不到就只显示目录基础信息 */ })
          return function () {
            cancelled = true
          }
        },
        [],
      )

      // 刷新单个 provider 的余量（卡片上的 ↻ 按钮）：宿主实查并回传新账户，本地替换
      function refreshAccount(account) {
        fetch('/provider/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ providerId: account.id }),
        })
          .then(function (response) {
            return response.json()
          })
          .then(function (res) {
            if (res === null || res === undefined || res.account === undefined) return
            var fresh = res.account
            setPlan(function (prev) {
              if (prev === null || prev === undefined || !Array.isArray(prev.accounts)) return prev
              var nextAccounts = []
              for (var i = 0; i < prev.accounts.length; i += 1) {
                nextAccounts.push(prev.accounts[i].id === fresh.id ? fresh : prev.accounts[i])
              }
              return { ...prev, accounts: nextAccounts, fetchedAt: new Date().toISOString() }
            })
          })
          .catch(function () { /* 刷新失败保留旧值 */ })
      }

      function checkUpdate() {
        setBusy(true)
        setNote('正在检查上游 ...')
        fetch('/provider/update', { method: 'POST' })
          .then(function (response) {
            return response.json()
          })
          .then(function (result) {
            if (result.error !== undefined) {
              setNote('更新失败：' + String(result.error))
            } else if (result.applied === true) {
              setNote('已下载 ' + String(result.latest) + '，重启 dsh 后生效')
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
      function isOpen(key, dflt) {
        return openMap[key] === undefined ? dflt : openMap[key]
      }
      function toggle(key, dflt) {
        setOpenMap(function (prev) {
          var next = {}
          for (var k in prev) next[k] = prev[k]
          next[key] = isOpen(key, dflt) !== true
          return next
        })
      }
      /** 模型列表过滤词（按模型 ID 或名称匹配）。 */
      function setFilter(id, value) {
        setFilters(function (prev) {
          var next = {}
          for (var k in prev) next[k] = prev[k]
          next[id] = value
          return next
        })
      }

      var bridge = status === null || status.bridge === undefined ? undefined : status.bridge
      // 桥接明细：放在「pi-ai 桥接」二级标签页里展示
      var bridgeLines = []
      if (bridge !== undefined && bridge.active === true) {
        bridgeLines.push(
          react.createElement('div', { className: 'pv_line', key: 'pi' }, '当前 pi-ai 版本', react.createElement('span', { className: 'plan_tag pv_push' }, String(bridge.piAiVersion))),
        )
      }
      if (bridge !== undefined && bridge.active !== true) {
        bridgeLines.push(react.createElement('div', { className: 'pv_line plan_badText', key: 'err' }, String(bridge.error)))
      }
      if (status !== null && status.piAiVersion !== undefined && bridge !== undefined && status.piAiVersion !== bridge.piAiVersion) {
        bridgeLines.push(
          react.createElement('div', { className: 'pv_line plan_warnText', key: 'new' }, '已下载 ' + String(status.piAiVersion) + '，重启 dsh 后生效'),
        )
      }
      if (status !== null && status.needsRestart === true) {
        bridgeLines.push(react.createElement('div', { className: 'pv_line plan_warnText', key: 'restart' }, '有新版本待生效：重启 dsh'))
      }
      // 目录补丁：上游数据滞后、我们按官方文档修正的条目，透明展示
      if (status !== null && Array.isArray(status.catalogPatches) && status.catalogPatches.length > 0) {
        for (var pi = 0; pi < status.catalogPatches.length; pi += 1) {
          var patch = status.catalogPatches[pi]
          var fields = Object.keys(patch.set || {}).map(function (k) {
            return k + '=' + String(patch.set[k])
          }).join('，')
          bridgeLines.push(
            react.createElement('div', { className: 'pv_line', key: 'patch-' + pi }, '目录补丁', react.createElement('span', { className: 'plan_tag pv_push', title: patch.reason || '' }, patch.model + '：' + fields)),
          )
        }
      }
      bridgeLines.push(
        react.createElement(
          'div',
          { className: 'pv_line', key: 'action' },
          '上游 ' + String(status !== null && status.latestVersion !== undefined ? status.latestVersion : '未检查'),
          react.createElement(
            'button',
            { type: 'button', className: 'pv_action pv_push', disabled: busy, onClick: checkUpdate },
            busy ? '检查中 ...' : '检查更新',
          ),
        ),
      )
      var accounts = plan !== null && Array.isArray(plan.accounts) ? plan.accounts : []
      var modelsByProvider = {}
      for (var gi = 0; gi < catalogGroups.length; gi += 1) {
        modelsByProvider[catalogGroups[gi].id] = catalogGroups[gi].models
      }
      var cards = []
      for (var i = 0; i < accounts.length; i += 1) {
        ;(function (account) {
          var chips = headlineChips(account)
          var dflt = account.error !== undefined || typeof account.credentialWarning === 'string'
          var expanded = isOpen(account.id, dflt)

          var chipEls = []
          for (var c = 0; c < chips.length; c += 1) chipEls.push(headlineChip(chips[c], c))

          var bodyRows = []
          if (expanded) {
            // API 密钥行：掩码提示（宿主派生前3+后4，值不出宿主）
            bodyRows.push(
              react.createElement(
                'div',
                { className: 'pv_line pv_row', key: 'key' },
                react.createElement('span', null, 'API 密钥'),
                react.createElement(
                  'span',
                  { className: 'pv_field' },
                  account.keyHint !== undefined ? account.keyHint : (account.authConfigured === false ? '未配置' : '已配置'),
                ),
              ),
            )
            if (account.baseUrl !== undefined) {
              bodyRows.push(
                react.createElement(
                  'div',
                  { className: 'pv_line pv_row', key: 'url' },
                  react.createElement('span', null, '端点'),
                  react.createElement('span', { className: 'pv_field' }, String(account.baseUrl)),
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
              // 模型头 + 过滤条同一行（过滤条仅在列表展开时出现，固定宽度不拉伸）
              var headRowChildren = [
                react.createElement(
                  'button',
                  { type: 'button', className: 'pv_mHead', key: 'm-head', onClick: function () { toggle(account.id + ':models', false) } },
                  react.createElement('span', null, '模型（' + (needle === '' ? String(models.length) : String(filtered.length) + '/' + String(models.length)) + '）'),
                  react.createElement('span', { className: 'pv_pcCaret' }, modelsOpen ? '▾' : '▸'),
                ),
              ]
              if (modelsOpen) {
                headRowChildren.push(
                  react.createElement(
                    'span',
                    { className: 'pv_fbox', key: 'm-filter' },
                    react.createElement('input', {
                      className: 'pv_mFilter',
                      type: 'text',
                      placeholder: '过滤',
                      value: filterText,
                      onChange: function (event) {
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
              mBoxRows.push(react.createElement('div', { className: 'pv_mHeadRow2', key: 'm-headrow' }, headRowChildren))
              if (modelsOpen) {
                // 列标题：与模型行同一套列宽类，保证严格对齐
                mBoxRows.push(
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
                  mBoxRows.push(react.createElement('div', { className: 'pv_line', key: 'm-empty' }, '没有匹配「' + filterText + '」的模型'))
                } else {
                  for (var m = 0; m < filtered.length; m += 1) {
                    mBoxRows.push(modelRow(filtered[m], account, detailsById))
                  }
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
              { className: 'pv_pc', key: account.id },
              react.createElement(
                'div',
                { className: 'pv_pcHead', onClick: function () { toggle(account.id, dflt) } },
                react.createElement(
                  'span',
                  { className: 'pv_pcLead' },
                  react.createElement(
                    'span',
                    { className: 'pv_pcLeadRow' },
                    react.createElement('span', { className: dotClass(account) }),
                    react.createElement('span', { className: 'pv_pcName' }, shortName(account)),
                    account.membership === undefined ? null : react.createElement('span', { className: 'plan_tag' }, membershipLabel(account.membership)),
                  ),
                  linkUrl === undefined
                    ? null
                    : react.createElement('a', {
                        className: 'pv_pcLink',
                        href: linkUrl,
                        target: '_blank',
                        rel: 'noreferrer',
                        onClick: function (event) {
                          if (event && typeof event.stopPropagation === 'function') event.stopPropagation()
                        },
                      }, linkTextOf(linkUrl)),
                ),
                react.createElement(
                  'span',
                  { className: 'pv_pcChips' },
                  chipEls,
                  react.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'pv_iconBtn',
                      title: '刷新余量' + (account.fetchedAt !== undefined ? '（上次 ' + String(account.fetchedAt).slice(11, 19) + '）' : ''),
                      onClick: function (ev) {
                        ev.stopPropagation()
                        refreshAccount(account)
                      },
                    },
                    '↻',
                  ),
                  react.createElement('span', { className: 'pv_pcCaret' }, expanded ? '▾' : '▸'),
                ),
              ),
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
        'Provider',
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
          : cards,
      )
    }

    /** 诊断用：把关键接线状态挂到 window 上，排查「某个座位没生效」时一眼看到原因。 */
    function recordDiagnostic(key, value) {
      try {
        var bucket = window.__dshProvider
        if (bucket === undefined) bucket = window.__dshProvider = {}
        bucket[key] = value
      } catch (cause) {
        /* 没有 window 就算了 */
      }
    }

    function apply(ctx) {
      installCss()
      recordDiagnostic('applied', new Date().toISOString())

      // 测试环境标识：宿主在 DSH_PROVIDER_TEST=1 启动时 /provider/status 会回 testMode:true，
      // 这里给标题加「· 测试」后缀、favicon 盖橙色「测」角标，一眼区分测试实例（正式实例无标）。
      fetch('/provider/status')
        .then(function (response) { return response.json() })
        .then(function (status) {
          if (status && status.testMode === true) markTestEnv()
        })
        .catch(function () { /* 拿不到状态就算了，不影响功能 */ })

      // 官方模型目录服务（ui-model-selection 提供的客户端 cordis 服务）。
      // 走服务而不是自己读投影/发 RPC：目录、当前选择、切换提交、失效刷新都在它手里。
      // 登记与使用解耦：服务迟到也不影响座位注册——inject 工厂是渲染时才调用的，
      // 那时再读 modelDirectories；读不到就返回空面，组件各自退回同源 HTTP/RPC 路径。
      var modelDirectories
      ctx.inject(['modelDirectories'], function (scope) {
        modelDirectories = scope.modelDirectories
        recordDiagnostic('modelDirectories', modelDirectories === undefined ? 'undefined' : 'ok')
      })

      /**
       * 座位/徽标的 inject 面：把官方目录服务包装成组件能用的只读数据 + 两个动作。
       * @param sessionId - 座位所在的会话。
       */
      function directoryFace(sessionId) {
        if (modelDirectories === undefined || typeof modelDirectories.directoryFor !== 'function') {
          recordDiagnostic('face', { reason: 'no-service', sessionId: String(sessionId) })
          return {}
        }
        try {
          var directory = modelDirectories.directoryFor(sessionId)
          recordDiagnostic('face', { reason: 'ok', sessionId: String(sessionId) })
          return {
            directory: directory.store,
            load: function () {
              directory.load().catch(function () {
                /* 错误会落到它自己的 store 上，由组件呈现 */
              })
            },
            select: function (selection) {
              return directory.select(selection).then(function () {
                return true
              }, function () {
                return false
              })
            },
          }
        } catch (cause) {
          recordDiagnostic('face', {
            reason: 'threw',
            sessionId: String(sessionId),
            message: cause && cause.message ? String(cause.message) : String(cause),
          })
          return {}
        }
      }

      ctx.slots.inject('conversation.input.right', function () {
        return ctx.slots.register(
          {
            name: 'conversation.input.right',
            id: 'plan-quota',
            order: 40,
            inject: directoryFace,
          },
          PlanBadge,
        )
      })

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
              return 'Provider'
            },
          },
          ProviderSettingsSection,
        )
      })

      // /model 命令：commandUi 对同名是「重复即抛」，没有 priority 遮蔽，所以只有官方
      // ui-model-selection 行被禁用时这里才注册得进去；官方还在时静默让位（模型座位
      // 靠 priority 遮蔽已经接管，不受影响）。
      ctx.inject(['commandUi'], function (scope) {
        var commandUi = scope.commandUi
        if (commandUi === undefined || typeof commandUi.register !== 'function') return
        scope.effect(
          function () {
            try {
              return commandUi.register({
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
                      var groups = both[0]
                      var accounts = accountsById(both[1])
                      var rows = []
                      for (var i = 0; i < groups.length; i += 1) {
                        var group = groups[i]
                        var quota = quotaTextOf(accounts[group.id])
                        for (var j = 0; j < group.models.length; j += 1) {
                          rows.push({
                            id: group.id + '/' + group.models[j].id,
                            label: group.models[j].name,
                            detail: group.name + (quota === undefined ? '' : ' · ' + quota),
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
          'dsh-provider: /model contribution',
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    exports.PlanBadge = PlanBadge
    return module.exports
  },
})
