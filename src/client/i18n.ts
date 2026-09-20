/**
 * i18n：本地字典兜底 + 可变翻译函数 + 插值辅助。
 *
 * `t` 是可变导出（live binding）：apply 里经 {@link setT} 换成官方 locale 的 bind
 * 结果，其余模块 `import { t }` 读到的一直是当前那份。
 *
 * 因此**组件里不要把 `t(...)` 的结果存成模块级常量**——那等于把语言钉在模块求值那一刻，
 * 切语言不会跟着变。要现取：在渲染路径上调用 `t()` / `tf()`。
 */

/** 字典分组前缀（`nav` / `tabProviders` / `addProvider` 三个是与 apply 同期的老 key，保持短名）。 */
export var LOCAL_DICT: Record<'zh' | 'en', Record<string, string>> = {
  zh: {
    nav: '模型服务',
    tabProviders: '服务商',
    addProvider: '＋ 添加供应商',

    // ---- pi-ai 桥接明细（设置页第二个二级标签）----
    'bridge.tab': 'pi-ai 桥接',
    'bridge.loading': '正在读取 pi-ai 版本…',
    'bridge.version': '当前 pi-ai 版本',
    'bridge.srcOfficial': '官方',
    'bridge.srcVendored': 'vendor',
    'bridge.hintOfficial': 'dsh 自带的那份 pi-ai，版本随 dsh 发布走（不一定比上游旧）',
    'bridge.hintVendored': '插件包里自带的那份 pi-ai（vendor/pi-ai/<版本>/）；默认停用下载，不落地',
    'bridge.srcParen': '{version}（{source}）',
    'bridge.reason': '看原因',
    'bridge.probeUnverified': '当前这份 pi-ai 没做过兼容性体检',
    'bridge.probeUnverifiedTip': '解析不出桥接副本的 import 需求（上游改了打包格式），按目录存在放行。建议关注 pi-ai 发版说明',
    'bridge.skip': '跳过 {version}：兼容性检查没通过',
    'bridge.pending': '已下载 {version}，验证通过（完整性 + 兼容性），重启 dsh 后生效',
    'bridge.rejected': '{version} 验证没通过，已跳过（不会切过去）',
    'bridge.upstreamUnchecked': '上游 未检查',
    'bridge.upstreamVersion': '上游 {version}',
    'bridge.upstreamCheckedAt': '（检查于 {when}）',
    'bridge.checking': '检查中 ...',
    'bridge.check': '检查更新',
    'bridge.downloadOff': 'pi-ai 只使用 DSH 自带那一份，插件的下载/更新入口已关闭',
    'bridge.hostOnly': 'pi-ai：只用 DSH 自带那份（已关闭下载）',
    // 合并版：下载是 opt-in（DSH_PROVIDER_UPDATE=on）；停用时上游行与按钮整行不渲染，只留版本一行
    'bridge.upstreamPaused': '上游 自动检查已停用（vendor/ 不落地第二份 pi-ai）',

    // ---- 模型能力 / 详情卡 ----
    'cap.vision': '视觉',
    'cap.reasoning': '推理',
    'cap.video': '视频',
    'cap.unknown': '能力未知',
    'cap.cw': '上下文窗口',
    'cap.maxTokens': '最大输出',
    'cap.chain': '思维链',
    'cap.unknownShort': '未知',
    'cap.auto': '自动',
    // 合并版：能力来自路由声明的标记（模型行小徽标 + 详情卡说明行）
    'cap.declared': '声明',
    'cap.declaredTip': 'pi-ai 目录里没有这个模型，能力按你在路由里声明的 input 显示',
    'cap.sourceDeclared': '能力来自这条路由的声明（pi-ai 目录没收录这个模型 ID）',
    'cap.off': '关闭',
    'cap.noMeta': '该模型没有本地元数据',

    // ---- Provider 卡片 / 添加面板 ----
    'prov.presetMissingKey': '缺密钥',
    'prov.presetConfigured': '已配置',
    'prov.provider': '供应商',
    'prov.routeId': '路由 ID',
    'prov.apiKey': 'API 密钥',
    'prov.apiBase': 'API 地址',
    'prov.protocol': '协议',
    'prov.modelId': '模型 ID',
    'prov.name': '名称',
    'prov.caps': '能力',
    'prov.ctx': '上下文',
    'prov.selectPlaceholder': '选择供应商…',
    'prov.filter': '过滤供应商',
    'prov.noMatch': '没有匹配的供应商',
    'prov.routeIdHintCustom': '给这个网关起个名字（kebab-case）',
    'prov.routeIdHintFixed': '由所选供应商决定',
    'prov.keyLink': '获取密钥 ↗',
    'prov.credStoredAs': '密钥存为 {ref}',
    'prov.testOk': '✓ 连通，发现 {count} 个模型',
    'prov.testOkNames': '✓ 连通，发现 {count} 个模型：{names}',
    'prov.testOkMore': '{names} …',
    'prov.addManualHint': '路由 ID / API 地址 / API 密钥都要填',
    'prov.testing': '正在用这把密钥实连供应商探测模型…',
    'prov.added': '已添加 {id}',
    'prov.updated': '已更新 {id}（原有 models / compat 等手写配置保留）',
    'prov.addFailed': '添加失败：{reason}（配置可能已写入、仅密钥未存，检查后可重试）',
    'prov.test': '测试',
    'prov.testingShort': '测试中…',
    'prov.addToList': '添加到列表',
    'prov.adding': '添加中…',
    'prov.needTestFirst': '先通过测试才能添加',
    'prov.cancel': '取消',
    // ---- 卡片级 provider 编辑（就地编辑）----
    'edit.displayName': '显示名',
    'edit.api': '协议',
    'edit.apiDefault': '（默认）',
    'edit.baseUrl': '端点',
    'edit.baseUrlPlaceholder': '留空回到官方默认端点',
    'edit.emptyHint': '清空某项 = 移除该配置键（不是写入空值）；留空端点即回到官方默认。',
    'edit.save': '保存修改',
    'edit.saving': '保存中…',
    'edit.saved': '已更新 {id}（只写入改过的字段，手写的 models / compat 原样保留）',
    'edit.noChange': '没有改动，无需保存',
    'edit.badApi': '协议只能是 openai-completions 或 anthropic-messages',
    'edit.badBaseUrl': '端点必须以 http:// 或 https:// 开头',
    'edit.badKeyEnv': '凭据名只能包含大写字母、数字与下划线',
    'prov.save': '保存',
    'prov.saving': '保存中…',
    'prov.saveKeyTip': '存进 {ref} 并立刻实测一次余量',
    'prov.modelsLoading': '模型目录加载中…',
    'prov.usageLoading': '正在刷新用量…',
    'prov.noModels': '目录里没有这个 provider 的模型',
    'prov.models': '模型（{count}）',
    'prov.clear': '清除',
    'prov.collapse': '收起',
    'prov.expand': '展开',
    'prov.lastRefresh': '上次刷新 {time}',
    'prov.refreshing': '刷新中…',
    'prov.refreshQuota': '刷新余量',
    'prov.refreshQuotaAt': '刷新余量（上次 {time}）',
    'prov.openSite': '打开官网 {url}',
    'prov.removeTip': '删除这个 provider',
    'prov.none': '暂无 provider 额度数据',

    // ---- 删除确认区 ----
    'del.title': '删除 provider「{id}」？',
    'del.bodyWithRef': '将删除整条路由配置与其凭据 {ref}。手写的 models / compat / retryPolicy 会一起消失，且不可恢复。',
    'del.body': '将删除整条路由配置与它的凭据。手写的 models / compat / retryPolicy 会一起消失，且不可恢复。',
    'del.copied': '✓ 配置已复制到剪贴板，可直接贴回 settings.yaml',
    'del.clipboardBlocked': '这个环境不允许写剪贴板，请手动抄写：{text}',
    'del.copyFailed': '复制失败：{reason}',
    'del.confirm': '删除此 provider',
    'del.export': '导出配置',
    // 合并版：删除确认弹层里的导出动作（R 的导出 + L 的弹层拼合）
    'del.exportBtn': '导出配置（YAML）',
    'del.exported': '配置已导出到剪贴板（YAML，不含密钥）',
    'del.exportFailed': '导出失败：{reason}',
    'del.exportNoClipboard': '这个环境不允许写剪贴板，无法导出',

    // ---- 提示条 / toast ----
    'toast.refreshSummaryPct': '（余 {percent}%）',
    'toast.refreshSummaryBalance': '（{value}）',
    'toast.refreshed': '{name} 余量已刷新',
    'toast.refreshFailed': '{name} 刷新失败：{reason}',
    'toast.noCredentialRef': '{name} 这条路由没有凭据名，无法存密钥',
    'toast.emptyKey': '{name} 先填密钥',
    'toast.keySaved': '{name} 密钥已保存，{summary}',
    'toast.keySavedNoQuota': '密钥已保存，但余量没查通：{reason}',
    'toast.keySaveFailed': '密钥保存失败：{reason}',
    'toast.checkingUpstream': '正在检查上游 ...',
    'toast.updateFailed': '更新失败：{reason}',
    'toast.removeFailed': '删除失败：{reason}',
    'toast.updated': '已下载 {version}，验证通过（完整性 + 兼容性），重启 dsh 后生效',
    'toast.skipped': '{version} 验证没通过，已跳过（不会切过去）',
    'toast.upToDate': '已是最新（{version}）',

    // ---- 导出 YAML / 兜底错误 ----
    'yaml.header': '# dsh-llm-provider 删除前导出的 route 配置（贴回 settings.yaml 的 llm-pi-ai.providers 下）',
    'yaml.credNote': '  # 凭据值不导出（浏览器端只拿得到掩码）——删除后请重新填回这个凭据名',
    'err.unknown': '未知错误',

    // ---- data / command ----
    'data.hostUnavailable': '宿主端状态不可用',
    'data.callFailed': '调用失败',
    'data.catalogFailed': '模型目录加载失败',
    'data.switchFailed': '切换失败',
    'cmd.label': '切换模型',
    'cmd.description': '按 provider 过滤 / 搜索模型 / 显示余额',
    'cmd.badRow': '无法解析这个模型行',
    'cmd.noSession': '当前没有会话，无法切换模型',

    // ---- 余量短文案 / 窗口 / 倒计时 ----
    'quota.generic': '额度',
    'quota.remaining': '余 {percent}%',
    'quota.windows': '{count} 个窗口',
    'quota.notConfigured': '未配置 key',
    'quota.queryFailed': '查询失败',
    'quota.queryFailedWith': '查询失败：{reason}',
    'quota.seeConsole': '看控制台',
    'quota.noAdapter': '无适配器',
    'quota.noData': '无数据',
    'quota.headlineRemaining': '{label}余量 {percent}%',
    'win.fallback': '窗口',
    'win.resettingSoon': '即将重置',
    'win.justNow': '刚刚',

    // ---- 模型座位 / 设置页列头 ----
    'm.loading': '加载中…',
    'm.select': '选择模型',
    'm.model': '模型',
    'm.cantPickEffort': '当前模型不在模型目录里，只能显示会话已定的档位',
    'm.effort': '推理等级',
    'm.pickModelFirst': '选择模型后可用',
    'm.all': '全部 {count}',
    'm.search': '搜索模型或 provider',
    'm.none': '没有可选模型',
    'm.noMatch': '没有匹配「{query}」的模型',
    'm.rejected': '宿主拒绝了这次切换',

    // ---- 测试环境标识（标题后缀 + favicon 角标，角标只放得下一两个字）----
    'test.titleSuffix': ' · 测试',
    'test.faviconBadge': '测',
  } as Record<string, string>,

  en: {
    nav: 'Provider',
    tabProviders: 'Provider',
    addProvider: '＋ Add Provider',

    // ---- pi-ai bridge detail rows ----
    'bridge.tab': 'pi-ai bridge',
    'bridge.loading': 'Reading pi-ai version…',
    'bridge.version': 'Current pi-ai version',
    'bridge.srcOfficial': 'official',
    'bridge.srcVendored': 'vendor',
    'bridge.hintOfficial': 'The pi-ai copy bundled with dsh; its version follows dsh releases (not necessarily older than upstream)',
    'bridge.hintVendored': "The pi-ai copy shipped inside the plugin package (vendor/pi-ai/<version>/); absent while auto-download is off",
    'bridge.srcParen': '{version} ({source})',
    'bridge.reason': 'Why',
    'bridge.probeUnverified': 'This pi-ai copy never passed the compatibility probe',
    'bridge.probeUnverifiedTip': "Could not resolve the bridge copy's import requirements (upstream changed its bundle format), so it was accepted based on the directory existing. Watch the pi-ai release notes",
    'bridge.skip': 'Skipped {version}: compatibility check failed',
    'bridge.pending': 'Downloaded {version}, verified (integrity + compatibility); takes effect after a dsh restart',
    'bridge.rejected': '{version} failed verification and was skipped (it will not be switched to)',
    'bridge.upstreamUnchecked': 'Upstream not checked',
    'bridge.upstreamVersion': 'Upstream {version}',
    'bridge.upstreamCheckedAt': '(checked {when})',
    'bridge.checking': 'Checking ...',
    'bridge.check': 'Check for updates',
    'bridge.downloadOff': 'pi-ai uses only the copy bundled with DSH; the plugin download/update entry is disabled',
    'bridge.hostOnly': 'pi-ai: DSH-bundled copy only (downloads disabled)',
    // merged: downloads are opt-in (DSH_PROVIDER_UPDATE=on); with auto-download off the whole upstream row is not rendered
    'bridge.upstreamPaused': 'Upstream auto-check disabled (no vendored copies)',

    // ---- model capabilities / detail card ----
    'cap.vision': 'Vision',
    'cap.reasoning': 'Reasoning',
    'cap.video': 'Video',
    'cap.unknown': 'Capabilities unknown',
    'cap.cw': 'Context window',
    'cap.maxTokens': 'Max output',
    'cap.chain': 'Chain of thought',
    'cap.unknownShort': 'Unknown',
    'cap.auto': 'Auto',
    // merged: capability-from-route-declaration markers (mini badge + detail row)
    'cap.declared': 'Declared',
    'cap.declaredTip': 'Not in the pi-ai catalog; capabilities shown from your route input declaration',
    'cap.sourceDeclared': 'Capabilities from this route declaration (id not in the pi-ai catalog)',
    'cap.off': 'Off',
    'cap.noMeta': 'No local metadata for this model',

    // ---- provider cards / add panel ----
    'prov.presetMissingKey': 'No key',
    'prov.presetConfigured': 'Configured',
    'prov.provider': 'Provider',
    'prov.routeId': 'Route ID',
    'prov.apiKey': 'API key',
    'prov.apiBase': 'API base URL',
    'prov.protocol': 'Protocol',
    'prov.modelId': 'Model ID',
    'prov.name': 'Name',
    'prov.caps': 'Capabilities',
    'prov.ctx': 'Context',
    'prov.selectPlaceholder': 'Select a provider…',
    'prov.filter': 'Filter providers',
    'prov.noMatch': 'No matching provider',
    'prov.routeIdHintCustom': 'Name this gateway (kebab-case)',
    'prov.routeIdHintFixed': 'Determined by the selected provider',
    'prov.keyLink': 'Get a key ↗',
    'prov.credStoredAs': 'Key stored as {ref}',
    'prov.testOk': '✓ Connected, found {count} models',
    'prov.testOkNames': '✓ Connected, found {count} models: {names}',
    'prov.testOkMore': '{names} …',
    'prov.addManualHint': 'Route ID, API base URL and API key are all required',
    'prov.testing': 'Connecting to the provider with this key to probe its models…',
    'prov.added': 'Added {id}',
    'prov.updated': 'Updated {id} (existing hand-written models / compat and other config kept)',
    'prov.addFailed': 'Add failed: {reason} (the config may already be written while only the key is missing; check and retry)',
    'prov.test': 'Test',
    'prov.testingShort': 'Testing…',
    'prov.addToList': 'Add to list',
    'prov.adding': 'Adding…',
    'prov.needTestFirst': 'Pass the test first to add',
    'prov.cancel': 'Cancel',
    // ---- per-card provider editing (inline) ----
    'edit.displayName': 'Display name',
    'edit.api': 'Protocol',
    'edit.apiDefault': '(default)',
    'edit.baseUrl': 'Endpoint',
    'edit.baseUrlPlaceholder': 'Leave empty to use the official default endpoint',
    'edit.emptyHint': 'Clearing a field removes that config key (it does not write an empty value); an empty endpoint falls back to the official default.',
    'edit.save': 'Save changes',
    'edit.saving': 'Saving…',
    'edit.saved': 'Updated {id} (only changed fields are written; hand-written models / compat are preserved)',
    'edit.noChange': 'Nothing changed — no need to save',
    'edit.badApi': 'Protocol must be openai-completions or anthropic-messages',
    'edit.badBaseUrl': 'Endpoint must start with http:// or https://',
    'edit.badKeyEnv': 'Credential name may only contain uppercase letters, digits and underscores',
    'prov.save': 'Save',
    'prov.saving': 'Saving…',
    'prov.saveKeyTip': 'Store into {ref} and probe the quota right away',
    'prov.modelsLoading': 'Loading model catalog…',
    'prov.usageLoading': 'Refreshing usage…',
    'prov.noModels': 'The catalog has no models for this provider',
    'prov.models': 'Models ({count})',
    'prov.clear': 'Clear',
    'prov.collapse': 'Collapse',
    'prov.expand': 'Expand',
    'prov.lastRefresh': 'Last refreshed {time}',
    'prov.refreshing': 'Refreshing…',
    'prov.refreshQuota': 'Refresh quota',
    'prov.refreshQuotaAt': 'Refresh quota (last {time})',
    'prov.openSite': 'Open website {url}',
    'prov.removeTip': 'Delete this provider',
    'prov.none': 'No provider quota data yet',

    // ---- delete confirmation ----
    'del.title': 'Delete provider "{id}"?',
    'del.bodyWithRef': 'This deletes the whole route config and its credential {ref}. Hand-written models / compat / retryPolicy disappear with it and cannot be recovered.',
    'del.body': 'This deletes the whole route config and its credential. Hand-written models / compat / retryPolicy disappear with it and cannot be recovered.',
    'del.copied': '✓ Config copied to the clipboard; paste it straight back into settings.yaml',
    'del.clipboardBlocked': 'This environment does not allow clipboard writes; copy it by hand: {text}',
    'del.copyFailed': 'Copy failed: {reason}',
    'del.confirm': 'Delete this provider',
    'del.export': 'Export config',
    // merged: export action inside the delete-confirmation modal (R export + L modal)
    'del.exportBtn': 'Export config (YAML)',
    'del.exported': 'Configuration exported to clipboard (YAML, no secrets)',
    'del.exportFailed': 'Export failed: {reason}',
    'del.exportNoClipboard': 'This environment does not allow clipboard writes; cannot export',

    // ---- toasts / notes ----
    'toast.refreshSummaryPct': '({percent}% left)',
    'toast.refreshSummaryBalance': '({value})',
    'toast.refreshed': '{name} quota refreshed',
    'toast.refreshFailed': '{name} refresh failed: {reason}',
    'toast.noCredentialRef': '{name} has no credential name on this route, so the key cannot be stored',
    'toast.emptyKey': '{name}: enter a key first',
    'toast.keySaved': '{name} key saved, {summary}',
    'toast.keySavedNoQuota': 'Key saved, but the quota lookup failed: {reason}',
    'toast.keySaveFailed': 'Saving the key failed: {reason}',
    'toast.checkingUpstream': 'Checking upstream ...',
    'toast.updateFailed': 'Update failed: {reason}',
    'toast.removeFailed': 'Delete failed: {reason}',
    'toast.updated': 'Downloaded {version}, verified (integrity + compatibility); takes effect after a dsh restart',
    'toast.skipped': '{version} failed verification and was skipped (it will not be switched to)',
    'toast.upToDate': 'Already up to date ({version})',

    // ---- exported YAML / fallback errors ----
    'yaml.header': '# dsh-llm-provider route config exported before deletion (paste back under llm-pi-ai.providers in settings.yaml)',
    'yaml.credNote': '  # Credential values are not exported (the browser only ever sees a masked hint) — re-enter this credential name after deleting',
    'err.unknown': 'Unknown error',

    // ---- data / command ----
    'data.hostUnavailable': 'Host-side status unavailable',
    'data.callFailed': 'Call failed',
    'data.catalogFailed': 'Failed to load the model catalog',
    'data.switchFailed': 'Switch failed',
    'cmd.label': 'Switch model',
    'cmd.description': 'Filter by provider / search models / show balance',
    'cmd.badRow': 'Cannot parse this model row',
    'cmd.noSession': 'No active session, cannot switch models',

    // ---- quota short text / windows / countdown ----
    'quota.generic': 'Quota',
    'quota.remaining': '{percent}% left',
    'quota.windows': '{count} windows',
    'quota.notConfigured': 'key not configured',
    'quota.queryFailed': 'lookup failed',
    'quota.queryFailedWith': 'Lookup failed: {reason}',
    'quota.seeConsole': 'check console',
    'quota.noAdapter': 'no adapter',
    'quota.noData': 'No data',
    'quota.headlineRemaining': '{label} {percent}% left',
    'win.fallback': 'Window',
    'win.resettingSoon': 'Resetting soon',
    'win.justNow': 'just now',

    // ---- model seat / settings column headers ----
    'm.loading': 'Loading…',
    'm.select': 'Select model',
    'm.model': 'Model',
    'm.cantPickEffort': 'The current model is not in the catalog, so only the effort already fixed by the session can be shown',
    'm.effort': 'Reasoning effort',
    'm.pickModelFirst': 'Available after picking a model',
    'm.all': 'All {count}',
    'm.search': 'Search models or providers',
    'm.none': 'No models available',
    'm.noMatch': 'No models matching "{query}"',
    'm.rejected': 'Host rejected this switch',

    // ---- test-environment marks (title suffix + favicon badge, badge fits one or two glyphs) ----
    'test.titleSuffix': ' · Test',
    'test.faviconBadge': 'T',
  } as Record<string, string>,
}

function localT(key: string): string {
  var lang: 'zh' | 'en' = 'en'
  try {
    if (String(document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0) lang = 'zh'
  } catch (cause) { /* 默认 en */ }
  var dict = LOCAL_DICT[lang] !== undefined ? LOCAL_DICT[lang] : LOCAL_DICT.en
  return dict[key] !== undefined ? dict[key] : (LOCAL_DICT.en[key] !== undefined ? LOCAL_DICT.en[key] : key)
}

/** i18n translate：优先官方 locale（注册+bind）；任何一步失败都回退本地字典。工厂级，组件/label 闭包共享。 */
export var t = localT

/** 换掉翻译实现（apply 里用官方 locale bind 的结果替换）。 */
export function setT(next: (key: string) => string): void {
  t = next
}

/** 模板里的占位符：`{name}`，name 是 `[A-Za-z0-9_]`。 */
var PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g

/**
 * 带插值的翻译：`tf('bridge.skip', { version: '0.86.0' })`。
 *
 * 三个刻意的取舍：
 *  - **模板与插值分开**：`'跳过 ' + v + '：…'` 这种拼句不能整句进字典，否则中英文语序不同就没法翻；
 *    key 里存 `{version}`，语序由各自的译文决定。
 *  - **替换走函数**（不是字符串）：参数值里出现 `$&` 时字符串替换会把它当替换模式展开，
 *    用户填的密钥/路径里带 `$&` 就会静默改字；模板自己的正则元字符同理。
 *  - 参数值**不**再过一遍 `t()`：值多是域名、URL、版本号、id 这类不该翻的东西，
 *    调用方自己决定要不要先翻（例：`tf('quota.windows', { count: 3 })` 传裸数字）。
 * @param key - 字典 key。
 * @param params - 占位符取值；缺参时该占位符原样留着（一眼看出漏传），`undefined`/`null` 当空串。
 */
export function tf(key: string, params?: Record<string, unknown> | null): string {
  var values = params === undefined || params === null ? {} : params
  return t(key).replace(PLACEHOLDER, function (whole: string, name: string) {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return whole
    var value = values[name]
    if (value === undefined || value === null) return ''
    return String(value)
  })
}

export { localT }
