/**
 * composer 的模型座位（仿官方 ModelSelect 两级层级）：
 *   触发器胶囊（模型名 + 思考强度 + Chevron）→ 根菜单两行（模型 / 推理等级，值右对齐 + ›）
 *   → 模型面板（我们的增强：搜索 + provider 过滤 + 能力徽章，样式走官方 token）
 *   → 推理等级面板（Default + 档位，选中打勾）。
 */
import react from 'react'
import { accountsById, findModel, loadModelCatalog, loadModelDetailMap, loadPlanStatus, lookupDetail, normalizeGroups, onPlanChange, selectionCell, submitSelection, unwrap, usePolledSnapshot } from './data.js'
import { recordDiagnostic } from './diag.js'
import { defaultEffortOf, dotClass, effortLabel, formatContext, fuzzyMatch, quotaShortOf, quotaTipOf, reasoningTextOf, toneColor, worstPercent } from './format.js'
import { caretSvg, checkSvg, chevronRightSvg } from './icons.js'
import { t, tf } from './i18n.js'
import type { CatalogGroup, CatalogModel, EffortChoice, FieldEvent, ModelSelection, ModelSwitchSeatProps } from './types.js'

/**
 * 老的 provider id → 现在的路由 id。官方 llm-deepseek 时代的会话里记的是 `deepseek-official`，
 * 那条路由由本插件接管的 pi-ai `deepseek` 顶上（两边服务的是同一批模型）。
 */
export var LEGACY_PROVIDER_ALIASES: Record<string, string> = { 'deepseek-official': 'deepseek' }

/**
 * 把选择里已经不存在的老 provider id 折到现存路由上。
 *
 * 只在「目标 provider 和同一个 model id 都在目录里」时才折——对不上就原样返回，宁可显示
 * 那个死 id，也不能把会话悄悄指到别的模型上。档位只在新模型支持时才带过去（两套适配器的
 * 档位表不一定一致）。
 *
 * @param selection - 会话/目录给出的当前选择。
 * @param groups - 模型目录。
 * @returns 折过之后的选择；不需要折时原样返回。
 */
export function aliasSelection(selection: ModelSelection | undefined, groups: CatalogGroup[] | undefined): ModelSelection | undefined {
  if (selection === undefined || selection === null) return selection
  var mapped = LEGACY_PROVIDER_ALIASES[selection.provider]
  if (mapped === undefined || groups === undefined) return selection
  var target = findModel(groups, mapped, selection.model)
  if (target === undefined) return selection
  var effort = selection.reasoningEffort
  var efforts = target.reasoning === undefined ? undefined : target.reasoning.efforts
  var keepEffort = typeof effort === 'string' && (efforts === undefined || efforts.indexOf(effort) !== -1)
  return keepEffort
    ? { provider: mapped, model: selection.model, reasoningEffort: effort }
    : { provider: mapped, model: selection.model }
}

export function ModelSwitchSeat(props: ModelSwitchSeatProps) {
  var sessionId = props.sessionId
  var sessions = props.sessions

  var openState = react.useState(false)
  var open = openState[0]
  var setOpen = openState[1]
  var paneState = react.useState('root')
  var pane = paneState[0]
  var setPane = paneState[1]
  var queryState = react.useState('')
  var query = queryState[0]
  var setQuery = queryState[1]
  var filterState = react.useState(null)
  var providerFilter = filterState[0]
  var setProviderFilter = filterState[1]
  var groupsState = react.useState([])
  var httpGroups = groupsState[0]
  var setGroups = groupsState[1]
  // 同一次目录 RPC 里的宿主默认选择：会话还没选过模型时的落点（官方口径）
  var httpDefaultState = react.useState(undefined)
  var httpDefault = httpDefaultState[0]
  var setHttpDefault = httpDefaultState[1]
  var errorState = react.useState(null)
  var error = errorState[0]
  var setError = errorState[1]
  var busyState = react.useState(false)
  var busy = busyState[0]
  var setBusy = busyState[1]
  var accountsState = react.useState({})
  var accounts = accountsState[0]
  var setAccounts = accountsState[1]
  var detailsState = react.useState({})
  var detailsById = detailsState[0]
  var setDetailsById = detailsState[1]
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
  var directoryCurrent = directorySnapshot !== undefined ? (directorySnapshot.current as ModelSelection | undefined) : undefined
  var directoryError = directorySnapshot !== undefined ? directorySnapshot.error : undefined

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
  // 乐观选择：提交成功后立即生效，不等投影/目录回传（plan-test 无目录服务时投影可能滞后或不回传）
  var lastSelState = react.useState(null)
  var lastSel = lastSelState[0]
  var setLastSel = lastSelState[1]
  // 当前选择：有目录服务时以它为准（官方那边 store.current 就是
  // `projected.next ?? catalog.default`，已经算好默认落点）；
  // 没有目录服务（plan-test）时按官方同一口径拼：本地乐观值 → 会话投影 → 宿主默认
  var rawSelection: ModelSelection | undefined = directoryCurrent !== undefined && directoryCurrent !== null
    ? directoryCurrent
    : (lastSel ?? projectionSelection ?? httpDefault)
  // 老会话里记的可能是已经被接管掉的那条路由（deepseek-official），折到现路由上显示与取数
  var selection = aliasSelection(rawSelection, groups)

  // 折过之后还要把会话记录也改过来：宿主在 prompt() 里校验 `routeServed(provider)`，
  // 记着死 id 的会话连消息都发不出去（no adapter serves provider …）。只在映射目标确实
  // 存在时做一次，失败也不打扰用户（下次读投影还会再试）。
  var migratedRef = react.useRef('')
  react.useEffect(
    function () {
      if (rawSelection === undefined || rawSelection === null) return
      if (selection === undefined || selection === null) return
      if (rawSelection.provider === selection.provider && rawSelection.model === selection.model) return
      var key = rawSelection.provider + '|' + rawSelection.model + '>' + selection.provider + '|' + selection.model
      if (migratedRef.current === key) return
      migratedRef.current = key
      var request: ModelSelection = selection.reasoningEffort === undefined
        ? { provider: selection.provider, model: selection.model }
        : { provider: selection.provider, model: selection.model, reasoningEffort: selection.reasoningEffort }
      var call = typeof props.select === 'function'
        ? props.select(request)
        : submitSelection(sessionId, request.provider, request.model, request.reasoningEffort)
      call
        .then(function (ok) {
          if (ok !== false) setLastSel(request)
        })
        .catch(function () {
          migratedRef.current = '' /* 这次没成，下次读投影时再试 */
        })
    },
    [rawSelection === undefined || rawSelection === null ? '' : rawSelection.provider + '/' + rawSelection.model,
      selection === undefined || selection === null ? '' : selection.provider + '/' + selection.model],
  )

  react.useEffect(
    function () {
      function read() {
        var next: ModelSelection | undefined
        try {
          next = unwrap(selectionCellRef.getSnapshot())
        } catch (cause) {
          next = undefined /* 投影读不到就当作没有当前选择 */
        }
        setSelection(next)
        // 投影追上本地乐观值（同一个 provider/model）就交棒：官方那边没有本地乐观值，
        // 一切以投影为准；不交棒的话 lastSel 会一直压着投影，宿主改了什么也显示不出来
        setLastSel(function (prev: ModelSelection | null | undefined) {
          if (prev === null || prev === undefined || next === undefined) return prev
          return prev.provider === next.provider && prev.model === next.model ? null : prev
        })
      }
      read()
      var timer = setInterval(read, 5000)
      return function () {
        clearInterval(timer)
      }
    },
    [selectionCellRef],
  )

  // 共享额度快照一变就跟着换（设置页单卡刷新、删掉某家 provider）——不用等自己那 60 秒轮询，
  // 否则同一份余量在设置页和触发器上会各自显示不同的值。
  react.useEffect(
    function () {
      return onPlanChange(function (payload) {
        setAccounts(accountsById(payload))
      })
    },
    [],
  )

  /**
   * 拉一次目录。官方目录服务缺席（补位形态，profile 禁用了官方 ui-model-selection）时，
   * 这是我们唯一的数据源，宿主那边是每次 RPC 实时构建的（`listProviders()` 按已配置路由报）。
   * @param alive - 可选；返回 false 表示组件已卸载，丢弃结果。
   */
  function pullCatalog(alive?: () => boolean): void {
    void loadModelCatalog()
      .then(function (next) {
        if (alive !== undefined && !alive()) return
        setGroups(next.groups)
        setHttpDefault(next.default)
      })
      .catch(function (cause) {
        if (alive !== undefined && !alive()) return
        setError(cause && cause.message ? String(cause.message) : String(cause))
      })
  }

  react.useEffect(
    function () {
      var cancelled = false
      if (typeof props.load === 'function') props.load()
      else pullCatalog(function () { return !cancelled })
      // 能力徽章/上下文标注的数据源：生效 pi-ai 包的模型详情
      loadModelDetailMap()
        .then(function (map) {
          if (!cancelled) setDetailsById(map)
        })
        .catch(function () { /* 详情拿不到就只显示名称 */ })
      return function () {
        cancelled = true
      }
    },
    [props.load],
  )

  // 触发器上的供应商余量：不等菜单打开就先拉一次额度（客户端 60 秒缓存兜住，
  // 和宿主端缓存同拍），之后每分钟补一次——长时间开着页面，余量也自己往前走。
  react.useEffect(
    function () {
      var cancelled = false
      function pull() {
        loadPlanStatus(false)
          .then(function (payload) {
            if (!cancelled) setAccounts(accountsById(payload))
          })
          .catch(function () { /* 额度拿不到就不显示余量，不影响选模型 */ })
      }
      pull()
      var timer = setInterval(pull, 60000)
      return function () {
        cancelled = true
        clearInterval(timer)
      }
    },
    [],
  )

  // 打开时刷新目录；点外部 / Escape 关闭（Escape 先退回根面板）。
  // 不再自动聚焦搜索框（用户批注：打开面板时搜索框不应描黑）
  react.useEffect(
    function () {
      if (!open) return undefined
      // 目录每次都重拉：官方服务在时它自己订阅了 settings/document-updated，
      // 会跟着设置变更失效；官方服务缺席时只有下面这一拉——不拉的话，在设置页删掉
      // provider 后再打开菜单，列表里还挂着已经删掉的供应商（宿主那边其实已经不报了）。
      if (typeof props.load === 'function') props.load()
      else pullCatalog()
      function onPointerDown(event: PointerEvent) {
        if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
      }
      function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
          if (pane !== 'root') setPane('root')
          else setOpen(false)
        }
      }
      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
      // provider chips 的余量指示器：打开菜单时顺手拉一次额度
      loadPlanStatus(false)
        .then(function (payload) {
          setAccounts(accountsById(payload))
        })
        .catch(function () { /* 额度拿不到就不显示指示器 */ })
      return function () {
        document.removeEventListener('pointerdown', onPointerDown)
        document.removeEventListener('keydown', onKeyDown)
      }
    },
    [open, pane, props.load],
  )

  function show() {
    setPane('root')
    setProviderFilter(null)
    setQuery('')
    setOpen(true)
  }

  /** 当前选择对应的 model 与思考强度信息。 */
  var currentModel: CatalogModel | undefined = undefined
  if (selection !== undefined && selection !== null) {
    currentModel = findModel(groups, selection.provider, selection.model)
  }
  var reasoning = currentModel !== undefined ? currentModel.reasoning : undefined
  // 会话已经定下的档位单独拿出来：目录里没有这个模型时（拿不到 reasoning）
  // 也要按它显示，否则整个思考强度会被吞掉，只剩下模型名
  var chosenEffort = selection !== undefined && selection !== null
    && typeof selection.reasoningEffort === 'string'
    ? selection.reasoningEffort
    : undefined
  var effectiveEffort = chosenEffort !== undefined
    ? chosenEffort
    : (reasoning !== undefined ? defaultEffortOf(currentModel) : undefined)
  var effortText = reasoningTextOf(chosenEffort, reasoning, defaultEffortOf(currentModel))

  function submit(selectionRequest: ModelSelection): Promise<boolean> {
    if (busy) return Promise.resolve(false)
    setBusy(true)
    var request = typeof props.select === 'function'
      ? props.select(selectionRequest)
      : submitSelection(sessionId, selectionRequest.provider, selectionRequest.model, selectionRequest.reasoningEffort)
    return request
      .then(function (ok) {
        if (ok === false) throw new Error(t('m.rejected'))
        setError(null)
        setLastSel(selectionRequest)
        setOpen(false)
        setPane('root')
        return true
      })
      .catch(function (cause) {
        setError(cause && cause.message ? String(cause.message) : String(cause))
        return false
      })
      .then(function (ok) {
        setBusy(false)
        return ok
      })
  }

  function chooseModel(groupId: string, modelId: string) {
    if (selection !== undefined && selection !== null
      && selection.provider === groupId && selection.model === modelId) {
      // 点的还是当前模型：直接收起（官方行为：选中项再点一次 = 确认并关闭）
      setOpen(false)
      setPane('root')
      return
    }
    // 只提交 provider/model，档位交给宿主（官方同款：宿主 resolveCallConfig 决定，
    // 再把最终选择回写投影）。自己塞一个档位等于伪造一次「用户选了这档」。
    // 选完即关（官方行为）：想接着调档位就重新打开菜单，官方也是这么走的。
    void submit({ provider: groupId, model: modelId })
  }

  function chooseEffort(effort: string | undefined) {
    if (selection === undefined || selection === null) return
    if (effort === effectiveEffort) {
      setOpen(false)
      return
    }
    var req: ModelSelection = { provider: selection.provider, model: selection.model }
    if (effort !== undefined) req.reasoningEffort = effort
    void submit(req)
  }

  var waiting = (selection === undefined || selection === null) && directorySnapshot !== undefined && directorySnapshot.status === 'loading'
  // 模型一律显示 供应商id/模型id：和展开后的 provider chips、分组标题、模型行同一套 id
  var modelLabel = waiting
    ? t('m.loading')
    : (selection === undefined || selection === null
        ? t('m.select')
        : String(selection.provider) + '/' + String(selection.model))
  var triggerText = effortText === undefined ? modelLabel : modelLabel + ' · ' + effortText

  // 供应商那段的余量指示：跟模型面板里的 provider chip 同一套取数与配色——
  // 最紧窗口百分比（没窗口就钱包余额），点按 10%/30% 分红黄绿；悬浮显示各窗口明细。
  // 当前 provider 的账户还没拿到（或这个 provider 查不了）时不显示，不影响别的内容。
  var currentAccount = selection === undefined || selection === null ? undefined : accounts[selection.provider]
  var currentQuotaText = quotaShortOf(currentAccount)
  var triggerQuota = currentAccount === undefined
    ? null
    : react.createElement(
        'span',
        { className: 'ms_tQuota', title: quotaTipOf(currentAccount), key: 'q' },
        react.createElement('span', { className: dotClass(currentAccount) }),
        currentQuotaText === undefined
          ? null
          : react.createElement(
              'span',
              { className: 'ms_tQuotaText', style: { color: toneColor(worstPercent(currentAccount)) } },
              currentQuotaText,
            ),
      )
  // 有当前选择时按「供应商 余量 / 模型」分段（余量紧跟在供应商后面），没有选择
  // （加载中 / 选择模型）时还是一段文案。分段也是为了窄屏能按段降级：
  // 空间不够先丢余量数字、再丢 provider，模型名与档位保住（见 styles.ts 的断点）。
  var triggerLabel = selection === undefined || selection === null
    ? [react.createElement('span', { className: 'ms_tLabel', key: 'all' }, modelLabel)]
    : [
        react.createElement('span', { className: 'ms_tProvider', key: 'p' }, String(selection.provider)),
        triggerQuota,
        react.createElement('span', { className: 'ms_tSlash', key: 's' }, '/ '),
        react.createElement('span', { className: 'ms_tModel', key: 'm' }, String(selection.model)),
      ]

  var trigger = react.createElement(
    'button',
    {
      type: 'button',
      className: 'ms_trigger',
      'aria-expanded': open ? 'true' : 'false',
      title: triggerText,
      onClick: function () {
        if (open) setOpen(false)
        else show()
      },
    },
    triggerLabel,
    effortText === undefined ? null : react.createElement('span', { className: 'ms_tEffort' }, effortText),
    react.createElement('span', { className: 'ms_chev' + (open ? ' ms_chevOpen' : '') }, caretSvg(open)),
  )

  if (!open) return react.createElement('div', { className: 'plan_root', ref: rootRef }, trigger)

  // ---- 根面板：模型 / 推理等级 两行（值右对齐 + ›）----
  var rootPane = react.createElement(
    'button',
    { type: 'button', className: 'ms_cell', onClick: function () { setPane('model') } },
    react.createElement('span', { className: 'ms_cellLabel' }, t('m.model')),
    react.createElement('span', { className: 'ms_cellValue' }, modelLabel),
    react.createElement('span', { className: 'ms_cellChev' }, chevronRightSvg()),
  )
  // 档位面板要靠目录里的档位表才能列出可选项：目录没有这个模型时只读显示会话已定的档位
  var canPickEffort = reasoning !== undefined && effortText !== undefined
  var effortCell = react.createElement(
    'button',
    {
      type: 'button',
      className: 'ms_cell',
      disabled: !canPickEffort,
      style: canPickEffort ? undefined : { cursor: 'default', opacity: 0.55 },
      title: reasoning === undefined && effortText !== undefined
        ? t('m.cantPickEffort')
        : undefined,
      onClick: canPickEffort ? function () { setPane('effort') } : undefined,
    },
    react.createElement('span', { className: 'ms_cellLabel' }, t('m.effort')),
    react.createElement('span', { className: 'ms_cellValue' }, effortText === undefined ? t('m.pickModelFirst') : effortText),
    react.createElement('span', { className: 'ms_cellChev' }, chevronRightSvg()),
  )

  // ---- 模型面板：搜索 + provider 过滤 + 分组列表（能力徽章/上下文，选中打勾）----
  var needle = query.trim().toLowerCase()
  var modelPane = null
  if (pane === 'model') {
    var chips = [
      react.createElement(
        'button',
        {
          key: '__all',
          type: 'button',
          className: 'mp_chip',
          'data-on': providerFilter === null ? '1' : '0',
          onClick: function () { setProviderFilter(null) },
        },
        tf('m.all', { count: groups.length }),
      ),
    ]
    for (var ck = 0; ck < groups.length; ck += 1) {
      ;(function (g) {
        var acc = accounts[g.id]
        var quotaText = quotaShortOf(acc)
        chips.push(
          react.createElement(
            'button',
            {
              key: g.id,
              type: 'button',
              className: 'mp_chip',
              'data-on': providerFilter === g.id ? '1' : '0',
              title: quotaTipOf(acc) ?? g.id,
              onClick: function () { setProviderFilter(providerFilter === g.id ? null : g.id) },
            },
            react.createElement('span', { className: dotClass(acc) }),
            g.id,
            quotaText === undefined
              ? null
              : react.createElement('span', { style: { color: toneColor(worstPercent(acc)) } }, ' ' + quotaText),
          ),
        )
      })(groups[ck])
    }
    var groupSections = []
    for (var gs = 0; gs < groups.length; gs += 1) {
      ;(function (g) {
        if (providerFilter !== null && g.id !== providerFilter) return
        var sectionRows = []
        for (var gm = 0; gm < g.models.length; gm += 1) {
          ;(function (model) {
            if (needle !== '' && fuzzyMatch(query, model.id + ' ' + model.name + ' ' + g.name + ' ' + g.id) !== true) return
            var isCurrent = selection !== undefined && selection !== null
              && selection.provider === g.id && selection.model === model.id
            // 详情按 provider+id 查（同名模型不串家），查不到再退回裸 id —— modlens 这类
            // 合成 provider 的模型 id 跟上游同名，只有带上 provider 才分得开
            var detail = lookupDetail(detailsById, g.id, model.id)
            var caps = []
            if (detail !== undefined) {
              if (detail.vision === true) caps.push(react.createElement('span', { key: 'v', className: 'pv_capMini pv_capVision' }, t('cap.vision')))
              if (detail.reasoning === true) caps.push(react.createElement('span', { key: 'r', className: 'pv_capMini pv_capReason' }, t('cap.reasoning')))
            }
            var ctx = formatContext(detail !== undefined && detail.contextWindow !== undefined ? detail.contextWindow : model.contextWindow)
            sectionRows.push(
              react.createElement(
                'button',
                {
                  key: g.id + '/' + model.id,
                  type: 'button',
                  className: 'ms_option',
                  disabled: busy || isCurrent,
                  title: g.id + '/' + model.id,
                  onClick: function () { chooseModel(g.id, model.id) },
                },
                react.createElement('span', { className: 'ms_name' }, model.id),
                react.createElement('span', { className: 'ms_capsCol' }, caps),
                react.createElement('span', { className: 'ms_ctxCol' }, ctx === undefined ? '' : ctx),
                react.createElement('span', { className: 'ms_check' }, isCurrent ? checkSvg() : null),
              ),
            )
          })(g.models[gm])
        }
        if (sectionRows.length === 0) return
        groupSections.push(
          react.createElement(
            'div',
            { className: 'ms_group', key: g.id },
            react.createElement('div', { className: 'ms_groupTitle' }, g.id),
            sectionRows,
          ),
        )
      })(groups[gs])
    }
    modelPane = react.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', minHeight: 0 } },
      react.createElement('input', {
        ref: searchRef,
        className: 'mp_search',
        type: 'text',
        placeholder: t('m.search'),
        value: query,
        onChange: function (event: FieldEvent) { setQuery(event.target.value) },
      }),
      groups.length > 1 ? react.createElement('div', { className: 'mp_chips' }, chips) : null,
      directoryError !== undefined && directoryError !== null && typeof directoryError === 'string'
        ? react.createElement('div', { className: 'ms_status' }, String(directoryError))
        : null,
      react.createElement(
        'div',
        { className: 'ms_scroll' },
        groupSections,
        groupSections.length === 0
          ? react.createElement('div', { className: 'ms_status' }, needle === '' ? t('m.none') : tf('m.noMatch', { query: query }))
          : null,
      ),
    )
  }

  // ---- 推理等级面板：Default + 档位，选中打勾 ----
  var effortPane = null
  if (pane === 'effort' && reasoning !== undefined) {
    var choices: EffortChoice[] = []
    if (defaultEffortOf(currentModel) === undefined) {
      choices.push({ effort: undefined, label: 'Default' })
    }
    var effList = reasoning.efforts
    for (var ec = 0; ec < effList.length; ec += 1) {
      choices.push({ effort: effList[ec], label: effortLabel(effList[ec]) ?? effList[ec] })
    }
    var effortRows = choices.map(function (level) {
      var isCur = effectiveEffort === level.effort
      return react.createElement(
        'button',
        {
          key: level.label,
          type: 'button',
          className: 'ms_option',
          disabled: busy || isCur,
          onClick: function () { chooseEffort(level.effort) },
        },
        react.createElement('span', { className: 'ms_name' }, level.label),
        react.createElement('span', { className: 'ms_check' }, isCur ? checkSvg() : null),
      )
    })
    effortPane = react.createElement('div', { className: 'ms_scroll' }, effortRows)
  }

  var menuBody = pane === 'model' ? modelPane : pane === 'effort' ? effortPane : react.createElement('div', { style: { display: 'flex', flexDirection: 'column' } }, rootPane, effortCell)

  // 面板高度自适应（用户批注）：provider 多（chips 换行）时卡片才放大到 560px，
  // provider 少（chips 一行装得下）恢复原 360px 尺寸
  var tallPane = pane === 'model' && groups.length > 4

  var menu = react.createElement(
    'div',
    { className: 'ms_menu' + (tallPane ? ' ms_menuTall' : '') },
    menuBody,
    error === null ? null : react.createElement('div', { className: 'plan_note plan_badText' }, error),
  )

  return react.createElement('div', { className: 'plan_root', ref: rootRef }, trigger, menu)
}
