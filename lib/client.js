window.__ModuleLoader__.load({
	id: "@ztyss/dsh-llm-provider",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		//#region src/client/i18n.ts
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
		var LOCAL_DICT = {
			zh: {
				nav: "模型服务",
				tabProviders: "服务商",
				addProvider: "＋ 添加供应商",
				"bridge.tab": "pi-ai 桥接",
				"bridge.loading": "正在读取 pi-ai 版本…",
				"bridge.version": "当前 pi-ai 版本",
				"bridge.srcOfficial": "官方",
				"bridge.srcVendored": "vendor",
				"bridge.hintOfficial": "dsh 自带的那份 pi-ai，版本随 dsh 发布走（不一定比上游旧）",
				"bridge.hintVendored": "插件包里自带的那份 pi-ai（vendor/pi-ai/<版本>/）；默认停用下载，不落地",
				"bridge.srcParen": "{version}（{source}）",
				"bridge.reason": "看原因",
				"bridge.probeUnverified": "当前这份 pi-ai 没做过兼容性体检",
				"bridge.probeUnverifiedTip": "解析不出桥接副本的 import 需求（上游改了打包格式），按目录存在放行。建议关注 pi-ai 发版说明",
				"bridge.skip": "跳过 {version}：兼容性检查没通过",
				"bridge.srcLatest": "上游最新",
				"bridge.hintSafe": "拨「启用最新版 pi-ai」开关后从 npm 下载的最新版，放在 ~/.dsh/llm-provider-bridge/pi-ai/<版本>/（插件重装不丢）",
				"bridge.toggle": "启用最新版 pi-ai",
				"bridge.toggleTip": "拨到 ON：下载上游最新的 pi-ai 并替代 DSH 自带版本（重启后生效）；拨到 OFF：回退 DSH 自带版本，已下载的文件保留",
				"bridge.stateOffKept": "已下载 {version}（未启用）",
				"bridge.stateOffPending": "已下载 {version}（重启后回退官方）",
				"bridge.stateDownloading": "正在下载上游pi-ai...",
				"bridge.stateMissing": "未下载（拨 OFF 再拨 ON 重试）",
				"bridge.statePending": "已下载 {version}（重启生效）",
				"bridge.stateUpdated": "已更新 {version}（重启生效）",
				"bridge.stateRejected": "已下载 {version}（无法启用）",
				"cap.vision": "视觉",
				"cap.reasoning": "推理",
				"cap.video": "视频",
				"cap.unknown": "能力未知",
				"cap.cw": "上下文窗口",
				"cap.maxTokens": "最大输出",
				"cap.chain": "思维链",
				"cap.unknownShort": "未知",
				"cap.auto": "自动",
				"cap.declared": "声明",
				"cap.declaredTip": "pi-ai 目录里没有这个模型，能力按你在路由里声明的 input 显示",
				"cap.sourceDeclared": "能力来自这条路由的声明（pi-ai 目录没收录这个模型 ID）",
				"cap.off": "关闭",
				"cap.noMeta": "该模型没有本地元数据",
				"prov.presetMissingKey": "缺密钥",
				"prov.presetConfigured": "已配置",
				"prov.provider": "供应商",
				"prov.routeId": "路由 ID",
				"prov.apiKey": "API 密钥",
				"prov.apiBase": "API 地址",
				"prov.protocol": "协议",
				"prov.modelId": "模型 ID",
				"prov.name": "名称",
				"prov.caps": "能力",
				"prov.ctx": "上下文",
				"prov.selectPlaceholder": "选择供应商…",
				"prov.filter": "过滤供应商",
				"prov.noMatch": "没有匹配的供应商",
				"prov.routeIdHintCustom": "给这个网关起个名字（建议：custom-gateway）",
				"prov.routeIdHintFixed": "由所选供应商决定",
				"prov.routeIdRequired": "请先填写路由 ID（输入框里的灰色建议值可直接沿用）",
				"prov.keyLink": "获取密钥 ↗",
				"prov.credStoredAs": "密钥存为 {ref}",
				"prov.testOk": "✓ 连通，发现 {count} 个模型",
				"prov.testOkNames": "✓ 连通，发现 {count} 个模型：{names}",
				"prov.testOkMore": "{names} …",
				"prov.addManualHint": "路由 ID / API 地址 / API 密钥都要填",
				"prov.testing": "正在实连端点验证模型（1 token 最小请求）…",
				"prov.pingOk": "连通正常 · {id}",
				"prov.listYes": "清单校验：端点共 {total} 个模型，包含 {id}",
				"prov.listNo": "清单校验：端点共 {total} 个模型，没有 {id}",
				"prov.added": "已添加 {id}",
				"prov.updated": "已更新 {id}（原有 models / compat 等手写配置保留）",
				"prov.addFailed": "添加失败：{reason}（配置可能已写入、仅密钥未存，检查后可重试）",
				"prov.discover": "发现模型",
				"prov.discovering": "发现模型中…",
				"prov.addToList": "添加到列表",
				"prov.adding": "添加中…",
				"prov.needTestFirst": "先「发现模型」再添加",
				"prov.pickSomeModels": "至少勾选一个模型",
				"prov.cancel": "取消",
				"edit.displayName": "显示名",
				"edit.api": "协议",
				"edit.apiDefault": "（默认）",
				"edit.baseUrl": "端点",
				"edit.baseUrlPlaceholder": "留空回到官方默认端点",
				"edit.dirtyHint": "显示名留空 = 自动沿用路由 ID；其余各项必须有值。",
				"edit.emptyBlocked": "每一项都要有值：清空后无法保存。",
				"edit.save": "保存修改",
				"edit.saving": "保存中…",
				"edit.saved": "已更新 {id}（只写入改过的字段，手写的 models / compat 原样保留）",
				"edit.noChange": "没有改动，无需保存",
				"edit.badApi": "协议只能是 openai-completions 或 anthropic-messages",
				"edit.badBaseUrl": "端点必须以 http:// 或 https:// 开头",
				"edit.badKeyEnv": "凭据名只能包含大写字母、数字与下划线",
				"prov.save": "保存",
				"prov.queryConfig": "查询配置",
				"prov.queryConfigTip": "根据 API 地址选择额度查询方式（含 step_plan 的走 Step Plan 点数）",
				"prov.queryCookieLabel": "Cookie",
				"prov.queryCookiePlaceholder": "粘贴控制台请求的整串 Cookie 头",
				"prov.queryCookieTip": "Step Plan 查询方式：粘贴控制台请求的整串 Cookie 头（F12 → Network → 任意请求的 Cookie 请求头），保存后写入 CONSOLE_COOKIE 凭据",
				"prov.noQueryConfigNeeded": "无需额外配置查询方式！",
				"prov.queryCookieSaved": "✓ 查询配置已保存（Step Plan 点数已可查）",
				"prov.queryCookieEmpty": "请先粘贴 Cookie 再保存",
				"prov.queryCookieFailed": "✗ 查询配置保存失败：{reason}",
				"prov.saving": "保存中…",
				"prov.saveKeyTip": "存进 {ref} 并立刻实测一次余量",
				"prov.modelsLoading": "模型目录加载中…",
				"prov.usageLoading": "正在刷新用量…",
				"prov.noModels": "目录里没有这个 provider 的模型",
				"prov.models": "模型（{count}）",
				"prov.clear": "清除",
				"prov.collapse": "收起",
				"prov.expand": "展开",
				"prov.lastRefresh": "上次刷新 {time}",
				"prov.refreshing": "刷新中…",
				"prov.refreshQuota": "刷新余量",
				"prov.refreshQuotaAt": "刷新余量（上次 {time}）",
				"prov.openSite": "打开官网 {url}",
				"prov.removeTip": "删除这个 provider",
				"prov.none": "暂无 provider 额度数据",
				"del.title": "删除 provider「{id}」？",
				"del.bodyWithRef": "将删除整条路由配置与其凭据 {ref}。手写的 models / compat / retryPolicy 会一起消失，且不可恢复。",
				"del.body": "将删除整条路由配置与它的凭据。手写的 models / compat / retryPolicy 会一起消失，且不可恢复。",
				"del.copied": "✓ 配置已复制到剪贴板，可直接贴回 settings.yaml",
				"del.clipboardBlocked": "这个环境不允许写剪贴板，请手动抄写：{text}",
				"del.copyFailed": "复制失败：{reason}",
				"del.confirm": "删除此 provider",
				"del.export": "导出配置",
				"del.exportBtn": "导出配置（YAML）",
				"del.exported": "配置已导出到剪贴板（YAML，不含密钥）",
				"del.exportFailed": "导出失败：{reason}",
				"del.exportNoClipboard": "这个环境不允许写剪贴板，无法导出",
				"toast.refreshSummaryPct": "（余 {percent}%）",
				"toast.refreshSummaryBalance": "（{value}）",
				"toast.refreshed": "{name} 余量已刷新",
				"toast.refreshFailed": "{name} 刷新失败：{reason}",
				"toast.noCredentialRef": "{name} 这条路由没有凭据名，无法存密钥",
				"toast.emptyKey": "{name} 先填密钥",
				"toast.keySaved": "{name} 密钥已保存，{summary}",
				"toast.keySavedNoQuota": "密钥已保存，但余量没查通：{reason}",
				"toast.keySaveFailed": "密钥保存失败：{reason}",
				"toast.checkingUpstream": "正在检查上游 ...",
				"toast.updateFailed": "更新失败：{reason}",
				"toast.removeFailed": "删除失败：{reason}",
				"toast.updated": "已下载 {version}，验证通过（完整性 + 兼容性），重启 dsh 后生效",
				"toast.skipped": "{version} 验证没通过，已跳过（不会切过去）",
				"toast.upToDate": "已是最新（{version}）",
				"yaml.header": "# dsh-llm-provider 删除前导出的 route 配置（贴回 settings.yaml 的 llm-pi-ai.providers 下）",
				"yaml.credNote": "  # 凭据值不导出（浏览器端只拿得到掩码）——删除后请重新填回这个凭据名",
				"err.unknown": "未知错误",
				"data.hostUnavailable": "宿主端状态不可用",
				"data.callFailed": "调用失败",
				"data.catalogFailed": "模型目录加载失败",
				"data.switchFailed": "切换失败",
				"cmd.label": "切换模型",
				"cmd.description": "按 provider 过滤 / 搜索模型 / 显示余额",
				"cmd.badRow": "无法解析这个模型行",
				"cmd.noSession": "当前没有会话，无法切换模型",
				"quota.generic": "额度",
				"quota.remaining": "余 {percent}%",
				"quota.windows": "{count} 个窗口",
				"quota.notConfigured": "未配置 key",
				"quota.queryFailed": "查询失败",
				"quota.queryFailedWith": "查询失败：{reason}",
				"quota.seeConsole": "看控制台",
				"quota.noAdapter": "无适配器",
				"quota.noData": "无数据",
				"quota.headlineRemaining": "{label}余量 {percent}%",
				"win.remain": "Remain",
				"win.resettingSoon": "即将重置",
				"win.justNow": "刚刚",
				"m.loading": "加载中…",
				"m.select": "选择模型",
				"m.model": "模型",
				"m.cantPickEffort": "当前模型不在模型目录里，只能显示会话已定的档位",
				"m.effort": "推理等级",
				"m.pickModelFirst": "选择模型后可用",
				"m.all": "全部 {count}",
				"m.search": "搜索模型或 provider",
				"m.none": "没有可选模型",
				"m.noMatch": "没有匹配「{query}」的模型",
				"m.rejected": "宿主拒绝了这次切换",
				"test.titleSuffix": " · 测试",
				"test.faviconBadge": "测"
			},
			en: {
				nav: "Provider",
				tabProviders: "Provider",
				addProvider: "＋ Add Provider",
				"bridge.tab": "pi-ai bridge",
				"bridge.loading": "Reading pi-ai version…",
				"bridge.version": "Current pi-ai version",
				"bridge.srcOfficial": "official",
				"bridge.srcVendored": "vendor",
				"bridge.hintOfficial": "The pi-ai copy bundled with dsh; its version follows dsh releases (not necessarily older than upstream)",
				"bridge.hintVendored": "The pi-ai copy shipped inside the plugin package (vendor/pi-ai/<version>/); absent while auto-download is off",
				"bridge.srcParen": "{version} ({source})",
				"bridge.reason": "Why",
				"bridge.probeUnverified": "This pi-ai copy never passed the compatibility probe",
				"bridge.probeUnverifiedTip": "Could not resolve the bridge copy's import requirements (upstream changed its bundle format), so it was accepted based on the directory existing. Watch the pi-ai release notes",
				"bridge.skip": "Skipped {version}: compatibility check failed",
				"bridge.srcLatest": "latest upstream",
				"bridge.hintSafe": "Latest version downloaded from npm after flipping the \"Enable latest pi-ai\" switch; lives in ~/.dsh/llm-provider-bridge/pi-ai/<version>/ (survives plugin reinstalls)",
				"bridge.toggle": "Enable latest pi-ai",
				"bridge.toggleTip": "ON: download the latest upstream pi-ai and use it instead of the DSH-bundled copy (after a restart); OFF: fall back to the DSH-bundled copy, downloaded files are kept",
				"bridge.stateOffKept": "{version} downloaded (not in use)",
				"bridge.stateOffPending": "{version} downloaded (restart to fall back to official)",
				"bridge.stateDownloading": "Downloading upstream pi-ai...",
				"bridge.stateMissing": "Not downloaded (flip OFF then ON to retry)",
				"bridge.statePending": "{version} downloaded (restart to apply)",
				"bridge.stateUpdated": "{version} updated (restart to apply)",
				"bridge.stateRejected": "{version} downloaded (cannot be enabled)",
				"cap.vision": "Vision",
				"cap.reasoning": "Reasoning",
				"cap.video": "Video",
				"cap.unknown": "Capabilities unknown",
				"cap.cw": "Context window",
				"cap.maxTokens": "Max output",
				"cap.chain": "Chain of thought",
				"cap.unknownShort": "Unknown",
				"cap.auto": "Auto",
				"cap.declared": "Declared",
				"cap.declaredTip": "Not in the pi-ai catalog; capabilities shown from your route input declaration",
				"cap.sourceDeclared": "Capabilities from this route declaration (id not in the pi-ai catalog)",
				"cap.off": "Off",
				"cap.noMeta": "No local metadata for this model",
				"prov.presetMissingKey": "No key",
				"prov.presetConfigured": "Configured",
				"prov.provider": "Provider",
				"prov.routeId": "Route ID",
				"prov.apiKey": "API key",
				"prov.apiBase": "API base URL",
				"prov.protocol": "Protocol",
				"prov.modelId": "Model ID",
				"prov.name": "Name",
				"prov.caps": "Capabilities",
				"prov.ctx": "Context",
				"prov.selectPlaceholder": "Select a provider…",
				"prov.filter": "Filter providers",
				"prov.noMatch": "No matching provider",
				"prov.routeIdHintCustom": "Name this gateway (suggestion: custom-gateway)",
				"prov.routeIdHintFixed": "Determined by the selected provider",
				"prov.routeIdRequired": "Fill in the route ID first (you can keep the gray suggested value)",
				"prov.keyLink": "Get a key ↗",
				"prov.credStoredAs": "Key stored as {ref}",
				"prov.testOk": "✓ Connected, found {count} models",
				"prov.testOkNames": "✓ Connected, found {count} models: {names}",
				"prov.testOkMore": "{names} …",
				"prov.addManualHint": "Route ID, API base URL and API key are all required",
				"prov.testing": "Pinging the model with a 1-token request…",
				"prov.pingOk": "Reachable · {id}",
				"prov.listYes": "List check: the endpoint serves {total} models, including {id}",
				"prov.listNo": "List check: the endpoint serves {total} models, but not {id}",
				"prov.added": "Added {id}",
				"prov.updated": "Updated {id} (existing hand-written models / compat and other config kept)",
				"prov.addFailed": "Add failed: {reason} (the config may already be written while only the key is missing; check and retry)",
				"prov.discover": "Discover models",
				"prov.discovering": "Discovering…",
				"prov.addToList": "Add to list",
				"prov.adding": "Adding…",
				"prov.needTestFirst": "Discover models first, then add",
				"prov.pickSomeModels": "Select at least one model",
				"prov.cancel": "Cancel",
				"edit.displayName": "Display name",
				"edit.api": "Protocol",
				"edit.apiDefault": "(default)",
				"edit.baseUrl": "Endpoint",
				"edit.baseUrlPlaceholder": "Leave empty to use the official default endpoint",
				"edit.dirtyHint": "Leave the display name empty to inherit the route ID; the other fields must keep a value.",
				"edit.emptyBlocked": "Every field must keep a value; cleared fields cannot be saved.",
				"edit.save": "Save changes",
				"edit.saving": "Saving…",
				"edit.saved": "Updated {id} (only changed fields are written; hand-written models / compat are preserved)",
				"edit.noChange": "Nothing changed — no need to save",
				"edit.badApi": "Protocol must be openai-completions or anthropic-messages",
				"edit.badBaseUrl": "Endpoint must start with http:// or https://",
				"edit.badKeyEnv": "Credential name may only contain uppercase letters, digits and underscores",
				"prov.save": "Save",
				"prov.queryConfig": "Query Config",
				"prov.queryConfigTip": "Picks the quota query by API base URL (step_plan uses Step Plan points)",
				"prov.queryCookieLabel": "Cookie",
				"prov.queryCookiePlaceholder": "Paste the full Cookie header of a console request",
				"prov.queryCookieTip": "Step Plan query: paste the full Cookie header of a console request (F12 → Network → Cookie request header); saving writes the CONSOLE_COOKIE credential",
				"prov.noQueryConfigNeeded": "No extra query configuration needed!",
				"prov.queryCookieSaved": "✓ Query config saved (Step Plan points ready)",
				"prov.queryCookieEmpty": "Paste the cookie first",
				"prov.queryCookieFailed": "✗ Failed to save query config: {reason}",
				"prov.saving": "Saving…",
				"prov.saveKeyTip": "Store into {ref} and probe the quota right away",
				"prov.modelsLoading": "Loading model catalog…",
				"prov.usageLoading": "Refreshing usage…",
				"prov.noModels": "The catalog has no models for this provider",
				"prov.models": "Models ({count})",
				"prov.clear": "Clear",
				"prov.collapse": "Collapse",
				"prov.expand": "Expand",
				"prov.lastRefresh": "Last refreshed {time}",
				"prov.refreshing": "Refreshing…",
				"prov.refreshQuota": "Refresh quota",
				"prov.refreshQuotaAt": "Refresh quota (last {time})",
				"prov.openSite": "Open website {url}",
				"prov.removeTip": "Delete this provider",
				"prov.none": "No provider quota data yet",
				"del.title": "Delete provider \"{id}\"?",
				"del.bodyWithRef": "This deletes the whole route config and its credential {ref}. Hand-written models / compat / retryPolicy disappear with it and cannot be recovered.",
				"del.body": "This deletes the whole route config and its credential. Hand-written models / compat / retryPolicy disappear with it and cannot be recovered.",
				"del.copied": "✓ Config copied to the clipboard; paste it straight back into settings.yaml",
				"del.clipboardBlocked": "This environment does not allow clipboard writes; copy it by hand: {text}",
				"del.copyFailed": "Copy failed: {reason}",
				"del.confirm": "Delete this provider",
				"del.export": "Export config",
				"del.exportBtn": "Export config (YAML)",
				"del.exported": "Configuration exported to clipboard (YAML, no secrets)",
				"del.exportFailed": "Export failed: {reason}",
				"del.exportNoClipboard": "This environment does not allow clipboard writes; cannot export",
				"toast.refreshSummaryPct": "({percent}% left)",
				"toast.refreshSummaryBalance": "({value})",
				"toast.refreshed": "{name} quota refreshed",
				"toast.refreshFailed": "{name} refresh failed: {reason}",
				"toast.noCredentialRef": "{name} has no credential name on this route, so the key cannot be stored",
				"toast.emptyKey": "{name}: enter a key first",
				"toast.keySaved": "{name} key saved, {summary}",
				"toast.keySavedNoQuota": "Key saved, but the quota lookup failed: {reason}",
				"toast.keySaveFailed": "Saving the key failed: {reason}",
				"toast.checkingUpstream": "Checking upstream ...",
				"toast.updateFailed": "Update failed: {reason}",
				"toast.removeFailed": "Delete failed: {reason}",
				"toast.updated": "Downloaded {version}, verified (integrity + compatibility); takes effect after a dsh restart",
				"toast.skipped": "{version} failed verification and was skipped (it will not be switched to)",
				"toast.upToDate": "Already up to date ({version})",
				"yaml.header": "# dsh-llm-provider route config exported before deletion (paste back under llm-pi-ai.providers in settings.yaml)",
				"yaml.credNote": "  # Credential values are not exported (the browser only ever sees a masked hint) — re-enter this credential name after deleting",
				"err.unknown": "Unknown error",
				"data.hostUnavailable": "Host-side status unavailable",
				"data.callFailed": "Call failed",
				"data.catalogFailed": "Failed to load the model catalog",
				"data.switchFailed": "Switch failed",
				"cmd.label": "Switch model",
				"cmd.description": "Filter by provider / search models / show balance",
				"cmd.badRow": "Cannot parse this model row",
				"cmd.noSession": "No active session, cannot switch models",
				"quota.generic": "Quota",
				"quota.remaining": "{percent}% left",
				"quota.windows": "{count} windows",
				"quota.notConfigured": "key not configured",
				"quota.queryFailed": "lookup failed",
				"quota.queryFailedWith": "Lookup failed: {reason}",
				"quota.seeConsole": "check console",
				"quota.noAdapter": "no adapter",
				"quota.noData": "No data",
				"quota.headlineRemaining": "{label} {percent}% left",
				"win.remain": "Remain",
				"win.resettingSoon": "Resetting soon",
				"win.justNow": "just now",
				"m.loading": "Loading…",
				"m.select": "Select model",
				"m.model": "Model",
				"m.cantPickEffort": "The current model is not in the catalog, so only the effort already fixed by the session can be shown",
				"m.effort": "Reasoning effort",
				"m.pickModelFirst": "Available after picking a model",
				"m.all": "All {count}",
				"m.search": "Search models or providers",
				"m.none": "No models available",
				"m.noMatch": "No models matching \"{query}\"",
				"m.rejected": "Host rejected this switch",
				"test.titleSuffix": " · Test",
				"test.faviconBadge": "T"
			}
		};
		function localT(key) {
			var lang = "en";
			try {
				if (String(document.documentElement.lang || "").toLowerCase().indexOf("zh") === 0) lang = "zh";
			} catch (cause) {}
			var dict = LOCAL_DICT[lang] !== void 0 ? LOCAL_DICT[lang] : LOCAL_DICT.en;
			return dict[key] !== void 0 ? dict[key] : LOCAL_DICT.en[key] !== void 0 ? LOCAL_DICT.en[key] : key;
		}
		/** i18n translate：优先官方 locale（注册+bind）；任何一步失败都回退本地字典。工厂级，组件/label 闭包共享。 */
		var t = localT;
		/** 换掉翻译实现（apply 里用官方 locale bind 的结果替换）。 */
		function setT(next) {
			t = next;
		}
		/** 模板里的占位符：`{name}`，name 是 `[A-Za-z0-9_]`。 */
		var PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;
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
		function tf(key, params) {
			var values = params === void 0 || params === null ? {} : params;
			return t(key).replace(PLACEHOLDER, function(whole, name) {
				if (!Object.prototype.hasOwnProperty.call(values, name)) return whole;
				var value = values[name];
				if (value === void 0 || value === null) return "";
				return String(value);
			});
		}
		//#endregion
		//#region src/client/data.ts
		/**
		* 浏览器端数据层：同源 HTTP/RPC、额度快照缓存、目录/投影的读与归一化。
		* 组件不直接 fetch——全走这里。
		*/
		/** 同源 GET → JSON：宿主自建读路由（/plan/status、/provider/status|presets|models）的唯一入口。 */
		function getJson(url) {
			return fetch(url).then(function(response) {
				return response.json();
			});
		}
		/** 同源 POST JSON → JSON：宿主自建写路由（refresh / remove / test / update）的唯一入口。 */
		function postJson(url, body) {
			return fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body === void 0 ? {} : body)
			}).then(function(response) {
				return response.json();
			});
		}
		/** 额度快照：60 秒内复用，force 绕过（和宿主端缓存同拍）。 */
		var planCache = {
			at: 0,
			value: null
		};
		var planListeners = [];
		/**
		* 订阅共享额度快照。每次快照被写入（重拉、单卡刷新、删除某家）都会收到新值。
		* @param listener - 收到新快照的回调。
		* @returns 退订函数（组件卸载时调）。
		*/
		function onPlanChange(listener) {
			planListeners.push(listener);
			return function() {
				planListeners = planListeners.filter(function(entry) {
					return entry !== listener;
				});
			};
		}
		/**
		* 写入共享快照并广播。所有写入都走这里，快照只有一个源头——设置页卡片、座位指示器与
		* `/model` 命令读的都是它，不会各自停在旧值上。
		* @param value - 新的快照值。
		* @returns 同一个值，便于调用方直接拿来 setState。
		*/
		function writePlanCache(value) {
			planCache = {
				at: Date.now(),
				value
			};
			var listeners = planListeners.slice();
			for (var i = 0; i < listeners.length; i += 1) try {
				listeners[i](value);
			} catch (cause) {}
			return value;
		}
		function loadPlanStatus(force) {
			if (!force && planCache.value !== null && Date.now() - planCache.at < 6e4) return Promise.resolve(planCache.value);
			return getJson("/plan/status" + (force === true ? "?refresh=1" : "")).then(function(payload) {
				return writePlanCache(payload);
			});
		}
		/** 宿主桥接状态（pi-ai 版本、路由表、测试环境标记）。 */
		function loadProviderStatus() {
			return getJson("/provider/status");
		}
		/**
		* 桥接状态拿不到时的占位：设置页据此渲染错误行，界面不至于空着。
		*
		* 现取而不是做成模块常量：这是**给用户看的一句文案**，做成常量就把语言钉在模块求值那一刻，
		* 切语言之后它还是老语言（`t` 是 live binding，但常量不再求值）。
		*/
		function statusUnavailable() {
			return { bridge: {
				active: false,
				error: t("data.hostUnavailable")
			} };
		}
		/**
		* 详情索引的键：`provider/id`。
		*
		* 不能用模型 id 单键：pi-ai 目录里跨 provider 重名是常态（实测 claude-opus-5 同时属于
		* anthropic / cloudflare-ai-gateway / openrouter 等 7 家），单键索引会被后读到的那份盖掉，
		* 于是另一家的行挂上这家的能力。provider id 是 kebab-case 短标识，不会含 `/`。
		*/
		function detailKeyOf(provider, id) {
			return String(provider) + "/" + String(id);
		}
		/**
		* 模型详情（生效 pi-ai 包的全量元数据 + 路由声明补齐），建两套索引：
		*   - `provider/id`：首选——同一个 id 在不同 provider 下能力可能不同（issue #5 的索引口径）；
		*   - 裸 `id`：兜底——老版本宿主不下发 provider 字段时还能查到，先到先得。
		*/
		function loadModelDetailMap() {
			return getJson("/provider/models").then(function(payload) {
				var map = {};
				if (payload === null || payload === void 0 || !Array.isArray(payload.models)) return map;
				for (var i = 0; i < payload.models.length; i += 1) {
					var detail = payload.models[i];
					if (detail === null || typeof detail !== "object") continue;
					if (typeof detail.provider === "string" && detail.provider !== "") map[detailKeyOf(detail.provider, detail.id)] = detail;
					var bare = String(detail.id);
					if (map[bare] === void 0) map[bare] = detail;
				}
				return map;
			});
		}
		/** 查一条模型详情：先按 provider+id，查不到再退回裸 id。 */
		function lookupDetail(map, providerId, modelId) {
			if (map === void 0 || map === null) return void 0;
			var qualified = map[detailKeyOf(providerId, modelId)];
			if (qualified !== void 0) return qualified;
			return map[modelId];
		}
		/**
		* 跨 provider 查同 id 的模型详情（发现清单展示用）：优先 pi-ai 目录（source==='pi-ai'，
		* 官方参数），没有再退回任何来源的第一条。查不到返回 undefined——调用方显示「—」。
		*/
		function lookupDetailAnySource(map, modelId) {
			if (map === void 0 || map === null || modelId === "") return void 0;
			var fallback = void 0;
			for (var key in map) {
				var detail = map[key];
				if (detail === void 0 || detail === null || detail.id !== modelId) continue;
				if (detail.source === "pi-ai") return detail;
				if (fallback === void 0) fallback = detail;
			}
			return fallback;
		}
		/** 生效目录里属于某个 provider 的全部模型（逐模型编辑器的候选来源）。 */
		function detailsOfProvider(map, providerId) {
			if (map === void 0 || map === null) return [];
			var own = [];
			var prefix = providerId + "/";
			for (var key in map) {
				if (key.indexOf("/") === -1 || key.slice(0, prefix.length) !== prefix) continue;
				var detail = map[key];
				if (typeof detail.id !== "string") continue;
				own.push(detail);
			}
			return own;
		}
		/** 不可变地合并一组 key（几个 setState 都这么写，集中一处）。 */
		function withKeys(prev, patch) {
			var next = {};
			for (var k in prev) next[k] = prev[k];
			for (var k2 in patch) next[k2] = patch[k2];
			return next;
		}
		/** 不可变地改 map 里的一个 key。 */
		function withKey(prev, key, value) {
			var patch = {};
			patch[key] = value;
			return withKeys(prev, patch);
		}
		/** 快照里剔掉一家（删除 provider 后用：不打上游、不让卡片复活）。 */
		function withoutAccount(payload, id) {
			if (payload === null || payload === void 0 || typeof payload !== "object") return payload;
			var record = payload;
			if (!Array.isArray(record.accounts)) return payload;
			return {
				...record,
				accounts: record.accounts.filter(function(account) {
					return account.id !== id;
				})
			};
		}
		/**
		* 把宿主实查回来的一个账户并进共享快照并广播（单卡刷新用）。
		* 列表里已经有这一家就盖掉，没有就补上——补上这条是必要的：刷新可能发生在
		* 首次拉取失败、或这一家刚被加进来（还没进快照）的时候。
		* @param fresh - `/provider/refresh` 回传的 account。
		*/
		function mergePlanAccount(fresh) {
			var current = planCache.value;
			var base = current === null || current === void 0 || typeof current !== "object" ? {} : current;
			var accounts = Array.isArray(base.accounts) ? base.accounts : [];
			var known = false;
			for (var i = 0; i < accounts.length; i += 1) {
				var entry = accounts[i];
				if (entry !== null && typeof entry === "object" && entry.id === fresh.id) known = true;
			}
			return writePlanCache({
				...base,
				accounts: known ? accounts.map(function(account) {
					return account.id === fresh.id ? fresh : account;
				}) : accounts.concat([fresh]),
				fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
			});
		}
		/** 从客户端缓存里剔除一家并广播（删除 provider 后用：不打上游、不让卡片复活）。 */
		function dropPlanAccount(id) {
			writePlanCache(withoutAccount(planCache.value, id));
		}
		/**
		* 官方远程 RPC 同源调用（/api/<ns>/<method>，client-request 信封，cookie 自动认证）。
		* @param failMessage 信封里没有 error 对象时的兜底文案（默认走 data.callFailed）。
		*/
		function apiCall(method, args, failMessage) {
			return postJson("/api/" + method, {
				type: "client-request",
				rpcId: "dsh-llm-provider-" + String(Date.now()) + "-" + String(Math.random()).slice(2, 8),
				method,
				payload: { args }
			}).then(function(envelope) {
				var result = envelope && envelope.result;
				if (result && result.ok === true) return result.value;
				throw new Error(result && result.error ? String(result.error.code) + ": " + String(result.error.message) : failMessage === void 0 ? t("data.callFailed") : failMessage);
			});
		}
		/**
		* 模型目录：session/modelCatalog 的同源 RPC（官方选择器走的是同一条）。
		* @returns `{ groups, default }`；default 是宿主默认选择，官方用它兜底
		*   （`current = projected.next ?? catalog.default`）——会话还没选过模型时显示的就是它。
		*/
		function loadModelCatalog() {
			return apiCall("session/modelCatalog", {}, t("data.catalogFailed")).then(function(value) {
				var catalog = value === null || typeof value !== "object" ? {} : value;
				return {
					groups: normalizeGroups(catalog.groups),
					default: normalizeSelection(catalog.default)
				};
			});
		}
		/** 一个 provider/model/reasoningEffort 选择；形状不对就当作没有。 */
		function normalizeSelection(value) {
			if (value === null || typeof value !== "object") return void 0;
			var record = value;
			if (typeof record.provider !== "string" || typeof record.model !== "string") return void 0;
			return typeof record.reasoningEffort === "string" ? {
				provider: record.provider,
				model: record.model,
				reasoningEffort: record.reasoningEffort
			} : {
				provider: record.provider,
				model: record.model
			};
		}
		/** 切换模型：GUI 自己的同源 RPC，和官方选择器同一条路。 */
		function submitSelection(sessionId, provider, model, reasoningEffort) {
			var request = {
				sessionId,
				provider,
				model
			};
			if (typeof reasoningEffort === "string") request.reasoningEffort = reasoningEffort;
			return apiCall("session/selectModel", { request }, t("data.switchFailed")).then(function() {
				return true;
			});
		}
		/** provider id → 额度账户（两边用同一套 route id，直接对上）。 */
		function accountsById(payload) {
			var map = {};
			var source = payload === null || payload === void 0 ? void 0 : payload;
			var accounts = source !== void 0 && Array.isArray(source.accounts) ? source.accounts : [];
			for (var i = 0; i < accounts.length; i += 1) map[accounts[i].id] = accounts[i];
			return map;
		}
		var EMPTY_CELL = {
			getSnapshot: function() {},
			subscribe: function() {
				return function() {};
			}
		};
		/** 模型选择投影的 cell；读不到时给一个永远 undefined 的假 cell，组件照样能渲染。 */
		function selectionCell(sessions, sessionId) {
			if (sessions === void 0 || typeof sessions.binding !== "function") return EMPTY_CELL;
			var binding;
			try {
				binding = sessions.binding(sessionId);
			} catch (error) {
				return EMPTY_CELL;
			}
			var face = binding && binding.session && binding.session.projections;
			if (face === void 0 || typeof face.faceOf !== "function") return EMPTY_CELL;
			try {
				var cell = face.faceOf("modelSelection");
				if (cell !== void 0 && typeof cell.getSnapshot === "function" && typeof cell.subscribe === "function") return cell;
			} catch (error) {
				return EMPTY_CELL;
			}
			return EMPTY_CELL;
		}
		/** 投影值 → 当前 provider/model；投影可能是原值或 {next} 形状。 */
		function unwrap(value) {
			var record = value;
			if (value !== null && typeof value === "object" && typeof record.provider === "string") return record;
			if (value !== null && typeof value === "object" && record.next !== null && typeof record.next === "object") {
				var next = record.next;
				if (typeof next.provider === "string") return next;
			}
		}
		/** 读一次 snapshot store，失败当作没有。 */
		function snapshotOf(store) {
			if (store === void 0 || store === null || typeof store.getSnapshot !== "function") return void 0;
			try {
				return store.getSnapshot();
			} catch (error) {
				return;
			}
		}
		/**
		* 轮询一个 snapshot store（官方目录服务给的 store）。
		* 不用 useSyncExternalStore：不同 dsh 版本上 store 的 subscribe 契约不保证一致，
		* 订阅失败会把整块 UI 拖崩；轮询只影响「当前」标记的实时性。
		*/
		function usePolledSnapshot(store, intervalMs) {
			var state = react.default.useState(function() {
				return snapshotOf(store);
			});
			react.default.useEffect(function() {
				if (store === void 0 || store === null) return void 0;
				function read() {
					state[1](snapshotOf(store));
				}
				read();
				var timer = setInterval(read, intervalMs);
				return function() {
					clearInterval(timer);
				};
			}, [store]);
			return state[0];
		}
		/** 官方目录分组 → 我们内部统一的 [{ id, name, models: [{id, name, contextWindow?}] }]。 */
		function normalizeGroups(rawGroups) {
			var groups = Array.isArray(rawGroups) ? rawGroups : [];
			var normalized = [];
			for (var i = 0; i < groups.length; i += 1) {
				var group = groups[i];
				if (group === null || typeof group !== "object") continue;
				var groupRecord = group;
				var providerId = typeof groupRecord.provider === "string" ? groupRecord.provider : groupRecord.id;
				if (typeof providerId !== "string") continue;
				var models = [];
				var raw = Array.isArray(groupRecord.models) ? groupRecord.models : [];
				for (var j = 0; j < raw.length; j += 1) {
					var model = raw[j];
					if (typeof model === "string") models.push({
						id: model,
						name: model
					});
					else if (model !== null && typeof model === "object") {
						var modelRecord = model;
						if (typeof modelRecord.id !== "string") continue;
						var entry = {
							id: modelRecord.id,
							name: typeof modelRecord.name === "string" ? modelRecord.name : modelRecord.id
						};
						var cw = modelRecord.contextWindow ?? modelRecord.context_window ?? modelRecord.maxContextWindow;
						if (typeof cw === "number" && Number.isFinite(cw) && cw > 0) entry.contextWindow = cw;
						if (modelRecord.reasoning !== null && typeof modelRecord.reasoning === "object") {
							var reasoningRecord = modelRecord.reasoning;
							var efforts = Array.isArray(reasoningRecord.efforts) ? reasoningRecord.efforts : [];
							var effortIds = [];
							for (var r = 0; r < efforts.length; r += 1) {
								var effort = efforts[r];
								var effortId = typeof effort === "string" ? effort : effort && effort.id;
								if (typeof effortId === "string" && effortId !== "") effortIds.push(effortId);
							}
							if (effortIds.length > 0) entry.reasoning = {
								efforts: effortIds,
								default: typeof reasoningRecord.defaultEffort === "string" ? reasoningRecord.defaultEffort : void 0
							};
						}
						models.push(entry);
					}
				}
				normalized.push({
					id: providerId,
					name: typeof groupRecord.name === "string" ? groupRecord.name : providerId,
					models
				});
			}
			return normalized;
		}
		/** 目录里按 provider id 找分组（预设清单这类 id 列表也复用）。 */
		function findById(list, id) {
			for (var i = 0; i < list.length; i += 1) if (list[i].id === id) return list[i];
		}
		/** 目录里按 provider id + 模型 id 找模型（当前选择回显、点选提交都用它）。 */
		function findModel(groups, providerId, modelId) {
			var group = findById(groups, providerId);
			if (group === void 0) return void 0;
			for (var j = 0; j < group.models.length; j += 1) if (group.models[j].id === modelId) return group.models[j];
		}
		//#endregion
		//#region src/client/format.ts
		/** 上下文窗口 / 最大输出的人性化显示。取整口径（用户报「65536 显示成 66K」）：
		*  1000000 → 1M（十进制整除）、1048576 → 1M（MiB 整除）、65536 → 64K、131072 → 128K
		*  （1024 整除按二进制）、384000 → 384K（十进制整除）、其余按 1000 进四舍五入。 */
		function formatContext(value) {
			var n = typeof value === "number" ? value : Number(value);
			if (!Number.isFinite(n) || n <= 0) return void 0;
			if (n >= 1048576 && n % 1048576 === 0) return n / 1048576 + "M";
			if (n >= 1e6 && n % 1e6 === 0) return n / 1e6 + "M";
			if (n >= 1e3 && n % 1e3 === 0) return n / 1e3 + "K";
			if (n >= 1024 && n % 1024 === 0) return n / 1024 + "K";
			if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
			if (n >= 1e3) return Math.round(n / 1e3) + "K";
			return String(n);
		}
		/** 思考强度档位显示名：不翻译，原始档位首字母大写（low→Low、xhigh→Xhigh）。 */
		function effortLabel(effort) {
			if (typeof effort !== "string" || effort === "") return void 0;
			return effort.charAt(0).toUpperCase() + effort.slice(1);
		}
		/**
		* 模型没显式选强度时的落点：只认目录里声明的默认档（官方同款：
		* `current.reasoningEffort ?? reasoning.defaultEffort`），不拿档位表首档顶替——
		* 那等于替用户选了一个他没选过的档位。目录没声明默认档时该显示「Default」，
		* 让服务商自己决定。文案照官方：ui-model-selection 的 `effort.providerDefault`
		* 在 zh/en 字典里都是字面 "Default"。
		*/
		function defaultEffortOf(model) {
			if (model === null || typeof model !== "object") return void 0;
			var reasoning = model.reasoning;
			if (reasoning === void 0) return void 0;
			var value = reasoning.default;
			return typeof value === "string" ? value : void 0;
		}
		/**
		* 推理等级文案。会话已经定了档位就显示它，哪怕目录里没有这个模型：
		* 目录只收录 listProviders 报上来的路由，会话里存着的 provider 可能不在其中
		* （原生路由没进目录、模型下线的历史会话），这时档位表拿不到，但会话的选择是真的。
		* @param chosenEffort - 会话当前选择里的档位（selection.reasoningEffort）。
		* @param modelReasoning - 目录里这个模型的档位表；没有则 undefined。
		* @param providerDefault - 目录给的默认档位（会话没显式选时的落点）。
		* @returns 档位显示名；既没定档位又没有档位表时返回 undefined（整段不显示）。
		*/
		function reasoningTextOf(chosenEffort, modelReasoning, providerDefault) {
			var chosen = effortLabel(chosenEffort);
			if (modelReasoning === void 0 || modelReasoning === null) return chosen;
			if (chosen !== void 0) return chosen;
			var fallback = effortLabel(providerDefault);
			return fallback === void 0 ? "Default" : fallback;
		}
		/** 相对时间（上次刷新指示器）：<10s 显示刚刚，<1min 显示 <1min，之后按分钟精度 m / h+m / d。 */
		function relativeTime(iso) {
			if (typeof iso !== "string" || iso === "") return "";
			var time = new Date(iso).getTime();
			if (Number.isNaN(time)) return "";
			var seconds = Math.max(0, Math.round((Date.now() - time) / 1e3));
			if (seconds < 10) return t("win.justNow");
			if (seconds < 60) return "<1min";
			var minutes = Math.floor(seconds / 60);
			if (minutes < 60) return String(minutes) + "m";
			var hours = Math.floor(minutes / 60);
			var min = minutes % 60;
			if (hours < 24) return min > 0 ? String(hours) + "h" + String(min) + "m" : String(hours) + "h";
			return String(Math.floor(hours / 24)) + "d";
		}
		function toneColor(percent) {
			if (typeof percent !== "number") return "#22a06b";
			if (percent <= 10) return "#d9534f";
			if (percent <= 30) return "#d9a300";
			return "#22a06b";
		}
		/** 一个账户里最紧的窗口剩余百分比。 */
		function worstPercent(account) {
			var worst;
			var windows = Array.isArray(account.windows) ? account.windows : [];
			for (var i = 0; i < windows.length; i += 1) {
				var percent = windows[i].percentLeft;
				if (typeof percent !== "number") continue;
				if (worst === void 0 || percent < worst) worst = percent;
			}
			return worst;
		}
		function dotClass(account) {
			if (account === void 0 || account === null) return "plan_dot";
			if (account.error !== void 0) return "plan_dot plan_dot_bad";
			if (account.authConfigured === false) return "plan_dot plan_dot_warn";
			if (account.kind === "unsupported" || account.kind === "unknown-provider") return "plan_dot plan_dot_warn";
			var percent = worstPercent(account);
			if (percent === void 0) return "plan_dot plan_dot_ok";
			if (percent <= 10) return "plan_dot plan_dot_bad";
			if (percent <= 30) return "plan_dot plan_dot_warn";
			return "plan_dot plan_dot_ok";
		}
		function shortName(account) {
			return account.displayName === void 0 ? account.id : account.displayName;
		}
		/** 徽标上的短字：优先余额，其次最紧窗口的剩余百分比。 */
		function summaryOf(account) {
			if (account === void 0 || account === null) return t("quota.generic");
			if (account.authConfigured === false) return shortName(account) + " " + t("quota.notConfigured");
			if (account.error !== void 0) return shortName(account) + " " + t("quota.queryFailed");
			if (account.kind === "unsupported") return shortName(account) + " " + t("quota.seeConsole");
			if (account.kind === "unknown-provider") return shortName(account) + " " + t("quota.noAdapter");
			var balances = Array.isArray(account.balances) ? account.balances : [];
			if (balances.length > 0) return shortName(account) + " " + balances[0].value;
			var percent = worstPercent(account);
			if (typeof percent === "number") return shortName(account) + " " + tf("quota.remaining", { percent });
			var windows = Array.isArray(account.windows) ? account.windows : [];
			if (windows.length > 0) return shortName(account) + " " + tf("quota.windows", { count: windows.length });
			return shortName(account);
		}
		/**
		* 余量短文案（模型面板的 provider chip 与模型座位触发器共用）：最紧窗口的剩余百分比，
		* 没有窗口就看钱包余额。查不了 / 没配 key 时不给数字——那种情况由指示点颜色表达。
		*/
		function quotaShortOf(account) {
			if (account === void 0 || account === null) return void 0;
			var percent = worstPercent(account);
			if (percent !== void 0) return String(percent) + "%";
			var balances = Array.isArray(account.balances) ? account.balances : [];
			return balances.length > 0 ? balances[0].value : void 0;
		}
		/** 一行里的余额短文案（给模型行/过滤 chip 复用）。 */
		function quotaTextOf(account) {
			if (account === void 0 || account === null) return void 0;
			if (account.authConfigured === false) return t("quota.notConfigured");
			if (account.error !== void 0) return t("quota.queryFailed");
			if (account.kind === "unsupported") return t("quota.seeConsole");
			if (account.kind === "unknown-provider") return t("quota.noAdapter");
			var percent = worstPercent(account);
			if (typeof percent === "number") return tf("quota.remaining", { percent });
			var balances = Array.isArray(account.balances) ? account.balances : [];
			if (balances.length > 0) return balances[0].value;
		}
		/**
		* 窗口短名（卡片头部摘要与悬停详情共用）：5 小时窗口→5h，每周/订阅周期→7d，每月→30d，
		* 认不出的窗口名→Remain。
		*
		* 判序与兜底两条都不能倒：
		*   - 「月」必须排在「每」之前——裸 `每` 会把「每月窗口」也吞进 7d（issue #2 的现象）；
		*   - StepFun 的套餐点数窗口名带 bucket 类型后缀（`Step Plan 套餐点数（bucket monthly）`），
		*     后缀里的 month 命中 30d 是**对的**——那个套餐本身就是月度 plan（用户 09-23 批注：
		*     就是要显示 30d，之前显示成 Step 是错的）。所以这里刻意没有 Step Plan 特例。
		*   - 兜底统一给 Remain：曾经是 `text.slice(0, 4)` 截原名四个字，只会产出
		*     'Step'/'Openc'/'GLM ' 这种既非档位也非来源的乱码（用户 09-23 批注改 Remain）。
		*/
		function shortWindowLabel(name) {
			var text = String(name ?? "");
			var lower = text.toLowerCase();
			if (text.indexOf("5 小时") !== -1 || text.indexOf("5小时") !== -1 || lower.indexOf("5 hour") !== -1) return "5h";
			if (text.indexOf("月") !== -1 || lower.indexOf("month") !== -1) return "30d";
			if (text.indexOf("每") !== -1 || text.indexOf("订阅") !== -1 || text.indexOf("周") !== -1 || lower.indexOf("week") !== -1 || lower.indexOf("subscription") !== -1) return "7d";
			return t("win.remain");
		}
		/** 重置倒计时压缩格式（最多两个单位，零尾不显示）：34m / 5h / 5h33m / 3d5h / 4d。 */
		function resetCountdownText(iso) {
			if (typeof iso !== "string" || iso === "") return "";
			var time = new Date(iso).getTime();
			if (Number.isNaN(time)) return "";
			var delta = time - Date.now();
			if (delta <= 0) return t("win.resettingSoon");
			var minutes = Math.round(delta / 6e4);
			if (minutes < 1) return t("win.resettingSoon");
			if (minutes < 60) return String(minutes) + "m";
			var hours = Math.floor(minutes / 60);
			var min = minutes % 60;
			if (hours < 24) return min > 0 ? String(hours) + "h" + String(min) + "m" : String(hours) + "h";
			var days = Math.floor(hours / 24);
			var restH = hours % 24;
			return restH > 0 ? String(days) + "d" + String(restH) + "h" : String(days) + "d";
		}
		/** provider chip 悬停详情：各窗口余量 + 重置倒计时，或余额明细。 */
		function quotaTipOf(account) {
			if (account === void 0 || account === null) return void 0;
			if (account.error !== void 0) return tf("quota.queryFailedWith", { reason: account.error });
			var parts = [];
			var windows = Array.isArray(account.windows) ? account.windows : [];
			for (var i = 0; i < windows.length; i += 1) {
				if (typeof windows[i].percentLeft !== "number") continue;
				var label = shortWindowLabel(windows[i].window);
				var text = tf("quota.headlineRemaining", {
					label: label === t("win.remain") ? String(windows[i].window ?? "") : label,
					percent: windows[i].percentLeft
				});
				if (windows[i].resetAt !== void 0 && windows[i].resetAt !== "") text += " ◷ " + resetCountdownText(windows[i].resetAt);
				parts.push(text);
			}
			var balances = Array.isArray(account.balances) ? account.balances : [];
			for (var j = 0; j < balances.length; j += 1) parts.push(balances[j].label + " " + balances[j].value);
			return parts.length > 0 ? parts.join(" ｜ ") : void 0;
		}
		/** 卡片头部摘要：直给最关键信息——coding plan 显示各窗口余量，API 显示余额。
		*
		*  按窗口档位分组（5h → 7d → 30d → 认不出的档按出现顺序），**组与组之间**都插分割线：
		*  旧实现只分「5 小时」与「其余」两桶、只插一条线，于是 7d 与 30d 挤在一起像同一组的两个值
		*  （issue #8）。空组不画线——只有两档时仍然只有一条线，视觉不变。
		*
		*  档位顺序固定，上游返回顺序变化或同一档出现多次时分割线位置不会跳。 */
		const HEADLINE_BUCKETS = [
			"5h",
			"7d",
			"30d"
		];
		function headlineChips(account) {
			if (account === void 0 || account === null) return [{
				text: t("quota.noData"),
				percent: void 0
			}];
			if (account.authConfigured === false) return [{
				text: t("quota.notConfigured"),
				percent: 0
			}];
			if (account.error !== void 0) return [{
				text: t("quota.queryFailed"),
				percent: 0
			}];
			if (account.kind === "unsupported") return [];
			if (account.kind === "unknown-provider") return [{
				text: t("quota.noAdapter"),
				percent: void 0
			}];
			var windows = Array.isArray(account.windows) ? account.windows : [];
			var groups = [];
			var known = HEADLINE_BUCKETS.slice();
			function groupOf(label) {
				for (var g = 0; g < groups.length; g += 1) if (groups[g].label === label) return groups[g].chips;
				var fresh = [];
				groups.push({
					label,
					chips: fresh
				});
				return fresh;
			}
			for (var i = 0; i < windows.length; i += 1) {
				if (typeof windows[i].percentLeft !== "number") continue;
				var label = shortWindowLabel(windows[i].window);
				groupOf(label).push({
					label,
					text: String(windows[i].percentLeft) + "%",
					percent: windows[i].percentLeft,
					reset: windows[i].resetAt
				});
			}
			var ordered = [];
			var index = 0;
			for (var k = 0; k < known.length; k += 1) for (index = 0; index < groups.length; index += 1) if (groups[index].label === known[k]) {
				ordered.push(groups[index]);
				break;
			}
			for (index = 0; index < groups.length; index += 1) if (known.indexOf(groups[index].label) === -1) ordered.push(groups[index]);
			var chips = [];
			for (var o = 0; o < ordered.length; o += 1) {
				if (ordered[o].chips.length === 0) continue;
				if (chips.length > 0) chips.push({ sep: true });
				for (var c = 0; c < ordered[o].chips.length; c += 1) chips.push(ordered[o].chips[c]);
			}
			if (chips.length > 0) return chips;
			var balances = Array.isArray(account.balances) ? account.balances : [];
			if (balances.length > 0) chips.push({
				text: String(balances[0].value),
				percent: void 0
			});
			if (chips.length > 0) return chips;
			return [{
				text: summaryOf(account),
				percent: void 0
			}];
		}
		/** 链接显示文本：去掉协议和末尾斜杠。 */
		function linkTextOf(url) {
			return String(url).replace(/^https?:\/\//, "").replace(/\/$/, "");
		}
		/** 模型过滤的模糊匹配：子串 → 缩写子序列（ds→deepseek）→ 编辑距离容错（deapseek→deepseek）。 */
		function fuzzyMatch(query, text) {
			var q = String(query).toLowerCase().trim();
			if (q === "") return true;
			var words = q.split(/\s+/);
			for (var w = 0; w < words.length; w += 1) if (!fuzzyWord(words[w], String(text).toLowerCase())) return false;
			return true;
		}
		function fuzzyWord(word, haystack) {
			if (word === "") return true;
			if (haystack.indexOf(word) !== -1) return true;
			if (word.length <= 5 && isSubsequence(word, haystack)) return true;
			var tokens = haystack.split(/[\s\-_/:]+/);
			for (var i = 0; i < tokens.length; i += 1) {
				if (tokens[i] === "") continue;
				var distance = word.length >= 3 ? damerauLevenshtein(word, tokens[i]) : 99;
				if (distance <= 1) return true;
				if (word.length >= 6 && distance <= 2) return true;
			}
			var joined = tokens.join("");
			var joinedDistance = word.length >= 3 ? damerauLevenshtein(word, joined) : 99;
			if (joinedDistance <= 1) return true;
			if (word.length >= 6 && joinedDistance <= 2) return true;
			return false;
		}
		function isSubsequence(needle, haystack) {
			var i = 0;
			for (var j = 0; j < haystack.length && i < needle.length; j += 1) if (haystack.charAt(j) === needle.charAt(i)) i += 1;
			return i === needle.length;
		}
		/** Damerau-Levenshtein 编辑距离（含相邻交换），O(n·m)——词都很短，无所谓。 */
		function damerauLevenshtein(a, b) {
			var la = a.length;
			var lb = b.length;
			if (Math.abs(la - lb) > 2) return 99;
			var d = [];
			for (var i = 0; i <= la; i += 1) {
				d.push(new Array(lb + 1).fill(0));
				d[i][0] = i;
			}
			for (var j = 0; j <= lb; j += 1) d[0][j] = j;
			for (var i = 1; i <= la; i += 1) for (var j = 1; j <= lb; j += 1) {
				var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
				var best = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
				if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) best = Math.min(best, d[i - 2][j - 2] + 1);
				d[i][j] = best;
			}
			return d[la][lb];
		}
		//#endregion
		//#region src/client/command.ts
		/**
		* /model 命令：按 provider 过滤 / 搜索模型 / 显示余额。
		* commandUi 对同名是「重复即抛」，没有 priority 遮蔽——官方 ui-model-selection 行还在时
		* 注册会抛，调用方静默让位；官方行被禁用后这里接管。
		*/
		function registerModelCommand(scope) {
			var commandUi = scope.commandUi;
			if (commandUi === void 0 || typeof commandUi.register !== "function") return;
			scope.effect(function() {
				try {
					return commandUi.register({
						name: "model",
						label: function() {
							return t("cmd.label");
						},
						description: function() {
							return t("cmd.description");
						},
						/**
						* 官方 ui-commands 的契约里这一项是**必填**：CommandUiRuntime.candidates() 对注册表里
						* 每一条贡献都直接调 `contribution.available(session)`，不做防御；漏了它那一抛会打挂
						* **整批** `/` 候选（菜单一组不剩 → 自动关闭），用户看到的就是 composer 左下那枚「＋」
						* 点了没反应、打 `/` 也不弹（issue #7）。
						*
						* 口径照官方 ui-model-selection 的同名实现：被寻址成子代理的会话不能用模型选择
						* （那是 agent 自己的事），普通会话放行。sessions 面缺席或没有这个方法时一律放行——
						* 契约只要求返回布尔，**实现永远不能抛**（宿主对每条贡献都是裸调，一抛整批 `/`
						* 候选陪葬）：任何异常都吞掉并放行，宁可多显示一条菜单。
						*/
						available: function(session) {
							try {
								var sessions = scope.sessions;
								if (sessions === void 0 || sessions === null || typeof sessions.subagentAddress !== "function") return true;
								var sessionId = session !== null && session !== void 0 ? session.sessionId : void 0;
								if (typeof sessionId !== "string" || sessionId === "") return true;
								return sessions.subagentAddress(sessionId) === void 0;
							} catch {
								return true;
							}
						},
						ui: {
							kind: "popupSelect",
							options: function() {
								return Promise.all([loadModelCatalog(), loadPlanStatus(false)]).then(function(both) {
									var groups = both[0].groups;
									var accounts = accountsById(both[1]);
									var rows = [];
									for (var i = 0; i < groups.length; i += 1) {
										var group = groups[i];
										var quota = quotaTextOf(accounts[group.id]);
										for (var j = 0; j < group.models.length; j += 1) rows.push({
											id: group.id + "/" + group.models[j].id,
											label: group.models[j].id,
											detail: group.id + (quota === void 0 ? "" : " · " + quota)
										});
									}
									return rows;
								});
							},
							onSelect: function(option, session) {
								var parts = String(option.id).split("/");
								var provider = parts.shift();
								var model = parts.join("/");
								if (provider === void 0 || provider === "" || model === "") throw new Error(t("cmd.badRow"));
								var sessionId = session !== null && session !== void 0 ? session.sessionId : void 0;
								if (typeof sessionId !== "string") throw new Error(t("cmd.noSession"));
								return submitSelection(sessionId, provider, model, void 0);
							}
						}
					});
				} catch (cause) {
					return function() {};
				}
			}, "dsh-llm-provider: /model contribution");
		}
		//#endregion
		//#region src/client/diag.ts
		function recordDiagnostic(key, value) {
			try {
				var holder = window;
				var bucket = holder.__dshLlmProvider;
				if (bucket === void 0) bucket = holder.__dshLlmProvider = {};
				bucket[key] = value;
			} catch (cause) {}
		}
		//#endregion
		//#region src/client/icons.ts
		/**
		* 官方图标库的 SVG 拷贝（对勾 / 右指 / 下指 Chevron）。
		* 不引官方图标包，逐字节拷需要的几个。
		*/
		/** 官方同款对勾（IconCheckOutline16 的 SVG 拷贝）。 */
		function checkSvg() {
			return react.default.createElement("svg", {
				width: 16,
				height: 16,
				viewBox: "0 0 16 16",
				fill: "none",
				style: { display: "block" }
			}, react.default.createElement("path", {
				fill: "currentColor",
				d: "M15.0498 3.92579L8.49512 12.3818C8.25774 12.6881 8.04517 12.9645 7.84668 13.1689C7.63957 13.3823 7.38732 13.5841 7.04492 13.6719C6.86373 13.7183 6.6757 13.7346 6.48926 13.7197C6.13666 13.6915 5.8528 13.5355 5.6123 13.3604C5.38201 13.1926 5.12573 12.9567 4.83984 12.6953L1.03125 9.21289L1.96875 8.1875L5.77734 11.6699C6.08684 11.9529 6.27773 12.1249 6.43066 12.2363C6.50183 12.2882 6.54699 12.3135 6.57324 12.3252C6.58525 12.3305 6.59269 12.3322 6.5957 12.333C6.59802 12.3336 6.59961 12.334 6.59961 12.334C6.63317 12.3367 6.66758 12.3335 6.7002 12.3252C6.7002 12.3252 6.70211 12.3251 6.7041 12.3242C6.70698 12.3229 6.71348 12.319 6.72461 12.3115C6.74849 12.2956 6.78843 12.2642 6.84961 12.2012C6.98138 12.0654 7.13957 11.8628 7.39648 11.5313L13.9502 3.07422L15.0498 3.92579Z"
			}));
		}
		/** 官方同款右指 Chevron（IconChevronRightOutline14 的 SVG 拷贝）。 */
		function chevronRightSvg() {
			return react.default.createElement("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 14 14",
				fill: "none",
				style: { display: "block" }
			}, react.default.createElement("path", {
				fill: "currentColor",
				d: "M5.5 2.15137L5.92383 2.57617L8.65137 5.30273C8.90706 5.55843 9.13382 5.78438 9.29785 5.98828C9.46883 6.20088 9.61756 6.44405 9.66602 6.75C9.69222 6.91565 9.69222 7.08435 9.66602 7.25C9.61756 7.55595 9.46883 7.79912 9.29785 8.01172C9.13382 8.21561 8.90706 8.44157 8.65137 8.69727L5.92383 11.4238L5.5 11.8486L4.65137 11L5.07617 10.5762L7.80273 7.84863C8.07732 7.57405 8.24849 7.40124 8.3623 7.25977C8.46904 7.12709 8.47813 7.07728 8.48047 7.0625C8.48703 7.02105 8.48703 6.97895 8.48047 6.9375C8.47813 6.92272 8.46904 6.87291 8.3623 6.74023C8.24848 6.59876 8.07732 6.42595 7.80273 6.15137L5.07617 3.42383L4.65137 3L5.5 2.15137Z"
			}));
		}
		/** 官方同款 Chevron（IconChevronDownOutline14 的 SVG 逐字节拷贝），open 时旋转 180°。 */
		function caretSvg(open) {
			return react.default.createElement("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 14 14",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				className: "pv_pcCaret" + (open ? " pv_pcCaretOpen" : ""),
				style: { display: "block" }
			}, react.default.createElement("path", {
				fill: "currentColor",
				d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.077326.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z"
			}));
		}
		//#endregion
		//#region src/client/model-seat.ts
		/**
		* composer 的模型座位（仿官方 ModelSelect 两级层级）：
		*   触发器胶囊（模型名 + 思考强度 + Chevron）→ 根菜单两行（模型 / 推理等级，值右对齐 + ›）
		*   → 模型面板（我们的增强：搜索 + provider 过滤 + 能力徽章，样式走官方 token）
		*   → 推理等级面板（Default + 档位，选中打勾）。
		*/
		/**
		* 老的 provider id → 现在的路由 id。官方 llm-deepseek 时代的会话里记的是 `deepseek-official`，
		* 那条路由由本插件接管的 pi-ai `deepseek` 顶上（两边服务的是同一批模型）。
		*/
		var LEGACY_PROVIDER_ALIASES = { "deepseek-official": "deepseek" };
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
		function aliasSelection(selection, groups) {
			if (selection === void 0 || selection === null) return selection;
			var mapped = LEGACY_PROVIDER_ALIASES[selection.provider];
			if (mapped === void 0 || groups === void 0) return selection;
			var target = findModel(groups, mapped, selection.model);
			if (target === void 0) return selection;
			var effort = selection.reasoningEffort;
			var efforts = target.reasoning === void 0 ? void 0 : target.reasoning.efforts;
			return typeof effort === "string" && (efforts === void 0 || efforts.indexOf(effort) !== -1) ? {
				provider: mapped,
				model: selection.model,
				reasoningEffort: effort
			} : {
				provider: mapped,
				model: selection.model
			};
		}
		/**
		* 目录条目没有 reasoning 档位表时，从本插件详情（declared/adapter）合成一个：
		* 详情标了 reasoning:true 但没写 thinkingLevels → 默认阶梯 low/medium/high
		* （OpenAI 兼容网关的通用档位）；声明里手写了 reasoningEfforts 的 → 详情已带
		* thinkingLevels，原样用。两者都不满足（详情不存在/没标推理）返回原模型。
		* 导出供离线测试钉住两个分支（用户 P0：目录外模型档位选择被锁死）。
		*/
		function withEffortLadder(model, detail) {
			if (model === void 0 || model.reasoning !== void 0) return model;
			if (detail === void 0 || detail.reasoning !== true) return model;
			var ladder = Array.isArray(detail.thinkingLevels) && detail.thinkingLevels.length > 0 ? detail.thinkingLevels.slice() : [
				"low",
				"medium",
				"high"
			];
			return {
				...model,
				reasoning: {
					efforts: ladder,
					default: void 0
				}
			};
		}
		function ModelSwitchSeat(props) {
			var sessionId = props.sessionId;
			var sessions = props.sessions;
			var openState = react.default.useState(false);
			var open = openState[0];
			var setOpen = openState[1];
			var paneState = react.default.useState("root");
			var pane = paneState[0];
			var setPane = paneState[1];
			var queryState = react.default.useState("");
			var query = queryState[0];
			var setQuery = queryState[1];
			var filterState = react.default.useState(null);
			var providerFilter = filterState[0];
			var setProviderFilter = filterState[1];
			var groupsState = react.default.useState([]);
			var httpGroups = groupsState[0];
			var setGroups = groupsState[1];
			var httpDefaultState = react.default.useState(void 0);
			var httpDefault = httpDefaultState[0];
			var setHttpDefault = httpDefaultState[1];
			var errorState = react.default.useState(null);
			var error = errorState[0];
			var setError = errorState[1];
			var busyState = react.default.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var accountsState = react.default.useState({});
			var accounts = accountsState[0];
			var setAccounts = accountsState[1];
			var detailsState = react.default.useState({});
			var detailsById = detailsState[0];
			var setDetailsById = detailsState[1];
			var rootRef = react.default.useRef(null);
			var searchRef = react.default.useRef(null);
			var directorySnapshot = usePolledSnapshot(props.directory, 2e3);
			recordDiagnostic("seat", {
				hasInjectFace: props.directory !== void 0,
				status: directorySnapshot === void 0 ? null : directorySnapshot.status,
				current: directorySnapshot === void 0 ? null : directorySnapshot.current,
				groupCount: directorySnapshot === void 0 || !Array.isArray(directorySnapshot.groups) ? null : directorySnapshot.groups.length,
				error: directorySnapshot === void 0 ? null : directorySnapshot.error
			});
			var directoryGroups = directorySnapshot !== void 0 && Array.isArray(directorySnapshot.groups) ? normalizeGroups(directorySnapshot.groups) : void 0;
			var groups = directoryGroups !== void 0 && directoryGroups.length > 0 ? directoryGroups : httpGroups;
			var directoryCurrent = directorySnapshot !== void 0 ? directorySnapshot.current : void 0;
			var directoryError = directorySnapshot !== void 0 ? directorySnapshot.error : void 0;
			var selectionCellRef = react.default.useMemo(function() {
				return selectionCell(sessions, sessionId);
			}, [sessions, sessionId]);
			var selectionState = react.default.useState(void 0);
			var projectionSelection = selectionState[0];
			var setSelection = selectionState[1];
			var lastSelState = react.default.useState(null);
			var lastSel = lastSelState[0];
			var setLastSel = lastSelState[1];
			var rawSelection = directoryCurrent !== void 0 && directoryCurrent !== null ? directoryCurrent : lastSel ?? projectionSelection ?? httpDefault;
			var selection = aliasSelection(rawSelection, groups);
			var migratedRef = react.default.useRef("");
			react.default.useEffect(function() {
				if (rawSelection === void 0 || rawSelection === null) return;
				if (selection === void 0 || selection === null) return;
				if (rawSelection.provider === selection.provider && rawSelection.model === selection.model) return;
				var key = rawSelection.provider + "|" + rawSelection.model + ">" + selection.provider + "|" + selection.model;
				if (migratedRef.current === key) return;
				migratedRef.current = key;
				var request = selection.reasoningEffort === void 0 ? {
					provider: selection.provider,
					model: selection.model
				} : {
					provider: selection.provider,
					model: selection.model,
					reasoningEffort: selection.reasoningEffort
				};
				(typeof props.select === "function" ? props.select(request) : submitSelection(sessionId, request.provider, request.model, request.reasoningEffort)).then(function(ok) {
					if (ok !== false) setLastSel(request);
				}).catch(function() {
					migratedRef.current = "";
				});
			}, [rawSelection === void 0 || rawSelection === null ? "" : rawSelection.provider + "/" + rawSelection.model, selection === void 0 || selection === null ? "" : selection.provider + "/" + selection.model]);
			react.default.useEffect(function() {
				function read() {
					var next;
					try {
						next = unwrap(selectionCellRef.getSnapshot());
					} catch (cause) {
						next = void 0;
					}
					setSelection(next);
					setLastSel(function(prev) {
						if (prev === null || prev === void 0 || next === void 0) return prev;
						return prev.provider === next.provider && prev.model === next.model ? null : prev;
					});
				}
				read();
				var timer = setInterval(read, 5e3);
				return function() {
					clearInterval(timer);
				};
			}, [selectionCellRef]);
			react.default.useEffect(function() {
				return onPlanChange(function(payload) {
					setAccounts(accountsById(payload));
				});
			}, []);
			/**
			* 拉一次目录。官方目录服务缺席（补位形态，profile 禁用了官方 ui-model-selection）时，
			* 这是我们唯一的数据源，宿主那边是每次 RPC 实时构建的（`listProviders()` 按已配置路由报）。
			* @param alive - 可选；返回 false 表示组件已卸载，丢弃结果。
			*/
			function pullCatalog(alive) {
				loadModelCatalog().then(function(next) {
					if (alive !== void 0 && !alive()) return;
					setGroups(next.groups);
					setHttpDefault(next.default);
				}).catch(function(cause) {
					if (alive !== void 0 && !alive()) return;
					setError(cause && cause.message ? String(cause.message) : String(cause));
				});
			}
			react.default.useEffect(function() {
				var cancelled = false;
				if (typeof props.load === "function") props.load();
				else pullCatalog(function() {
					return !cancelled;
				});
				loadModelDetailMap().then(function(map) {
					if (!cancelled) setDetailsById(map);
				}).catch(function() {});
				return function() {
					cancelled = true;
				};
			}, [props.load]);
			react.default.useEffect(function() {
				var cancelled = false;
				function pull() {
					loadPlanStatus(false).then(function(payload) {
						if (!cancelled) setAccounts(accountsById(payload));
					}).catch(function() {});
				}
				pull();
				var timer = setInterval(pull, 6e4);
				return function() {
					cancelled = true;
					clearInterval(timer);
				};
			}, []);
			react.default.useEffect(function() {
				if (!open) return void 0;
				if (typeof props.load === "function") props.load();
				else pullCatalog();
				function onPointerDown(event) {
					if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false);
				}
				function onKeyDown(event) {
					if (event.key === "Escape") {
						if (pane !== "root") setPane("root");
						else setOpen(false);
					}
				}
				document.addEventListener("pointerdown", onPointerDown);
				document.addEventListener("keydown", onKeyDown);
				loadPlanStatus(false).then(function(payload) {
					setAccounts(accountsById(payload));
				}).catch(function() {});
				return function() {
					document.removeEventListener("pointerdown", onPointerDown);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [
				open,
				pane,
				props.load
			]);
			function show() {
				setPane("root");
				setProviderFilter(null);
				setQuery("");
				setOpen(true);
			}
			/** 当前选择对应的 model 与思考强度信息。 */
			var currentModel = void 0;
			if (selection !== void 0 && selection !== null) currentModel = findModel(groups, selection.provider, selection.model);
			if (currentModel !== void 0 && currentModel.reasoning === void 0 && selection !== void 0 && selection !== null) currentModel = withEffortLadder(currentModel, lookupDetail(detailsById, selection.provider, selection.model));
			var reasoning = currentModel !== void 0 ? currentModel.reasoning : void 0;
			var chosenEffort = selection !== void 0 && selection !== null && typeof selection.reasoningEffort === "string" ? selection.reasoningEffort : void 0;
			var effectiveEffort = chosenEffort !== void 0 ? chosenEffort : reasoning !== void 0 ? defaultEffortOf(currentModel) : void 0;
			var effortText = reasoningTextOf(chosenEffort, reasoning, defaultEffortOf(currentModel));
			function submit(selectionRequest) {
				if (busy) return Promise.resolve(false);
				setBusy(true);
				return (typeof props.select === "function" ? props.select(selectionRequest) : submitSelection(sessionId, selectionRequest.provider, selectionRequest.model, selectionRequest.reasoningEffort)).then(function(ok) {
					if (ok === false) throw new Error(t("m.rejected"));
					setError(null);
					setLastSel(selectionRequest);
					setOpen(false);
					setPane("root");
					return true;
				}).catch(function(cause) {
					setError(cause && cause.message ? String(cause.message) : String(cause));
					return false;
				}).then(function(ok) {
					setBusy(false);
					return ok;
				});
			}
			function chooseModel(groupId, modelId) {
				if (selection !== void 0 && selection !== null && selection.provider === groupId && selection.model === modelId) {
					setOpen(false);
					setPane("root");
					return;
				}
				submit({
					provider: groupId,
					model: modelId
				});
			}
			function chooseEffort(effort) {
				if (selection === void 0 || selection === null) return;
				if (effort === effectiveEffort) {
					setOpen(false);
					return;
				}
				var req = {
					provider: selection.provider,
					model: selection.model
				};
				if (effort !== void 0) req.reasoningEffort = effort;
				submit(req);
			}
			var modelLabel = (selection === void 0 || selection === null) && directorySnapshot !== void 0 && directorySnapshot.status === "loading" ? t("m.loading") : selection === void 0 || selection === null ? t("m.select") : String(selection.provider) + "/" + String(selection.model);
			var triggerText = effortText === void 0 ? modelLabel : modelLabel + " · " + effortText;
			var currentAccount = selection === void 0 || selection === null ? void 0 : accounts[selection.provider];
			var currentQuotaText = quotaShortOf(currentAccount);
			var triggerQuota = currentAccount === void 0 ? null : react.default.createElement("span", {
				className: "ms_tQuota",
				title: quotaTipOf(currentAccount),
				key: "q"
			}, react.default.createElement("span", { className: dotClass(currentAccount) }), currentQuotaText === void 0 ? null : react.default.createElement("span", {
				className: "ms_tQuotaText",
				style: { color: toneColor(worstPercent(currentAccount)) }
			}, currentQuotaText));
			var triggerLabel = selection === void 0 || selection === null ? [react.default.createElement("span", {
				className: "ms_tLabel",
				key: "all"
			}, modelLabel)] : [
				react.default.createElement("span", {
					className: "ms_tProvider",
					key: "p"
				}, String(selection.provider)),
				triggerQuota,
				react.default.createElement("span", {
					className: "ms_tSlash",
					key: "s"
				}, "/ "),
				react.default.createElement("span", {
					className: "ms_tModel",
					key: "m"
				}, String(selection.model))
			];
			var trigger = react.default.createElement("button", {
				type: "button",
				className: "ms_trigger",
				"aria-expanded": open ? "true" : "false",
				title: triggerText,
				onClick: function() {
					if (open) setOpen(false);
					else show();
				}
			}, triggerLabel, effortText === void 0 ? null : react.default.createElement("span", { className: "ms_tEffort" }, effortText), react.default.createElement("span", { className: "ms_chev" + (open ? " ms_chevOpen" : "") }, caretSvg(open)));
			if (!open) return react.default.createElement("div", {
				className: "plan_root",
				ref: rootRef
			}, trigger);
			var rootPane = react.default.createElement("button", {
				type: "button",
				className: "ms_cell",
				onClick: function() {
					setPane("model");
				}
			}, react.default.createElement("span", { className: "ms_cellLabel" }, t("m.model")), react.default.createElement("span", { className: "ms_cellValue" }, modelLabel), react.default.createElement("span", { className: "ms_cellChev" }, chevronRightSvg()));
			var canPickEffort = reasoning !== void 0 && effortText !== void 0;
			var effortCell = react.default.createElement("button", {
				type: "button",
				className: "ms_cell",
				disabled: !canPickEffort,
				style: canPickEffort ? void 0 : {
					cursor: "default",
					opacity: .55
				},
				title: reasoning === void 0 && effortText !== void 0 ? t("m.cantPickEffort") : void 0,
				onClick: canPickEffort ? function() {
					setPane("effort");
				} : void 0
			}, react.default.createElement("span", { className: "ms_cellLabel" }, t("m.effort")), react.default.createElement("span", { className: "ms_cellValue" }, effortText === void 0 ? t("m.pickModelFirst") : effortText), react.default.createElement("span", { className: "ms_cellChev" }, chevronRightSvg()));
			var needle = query.trim().toLowerCase();
			var modelPane = null;
			if (pane === "model") {
				var chips = [react.default.createElement("button", {
					key: "__all",
					type: "button",
					className: "mp_chip",
					"data-on": providerFilter === null ? "1" : "0",
					onClick: function() {
						setProviderFilter(null);
					}
				}, tf("m.all", { count: groups.length }))];
				for (var ck = 0; ck < groups.length; ck += 1) (function(g) {
					var acc = accounts[g.id];
					var quotaText = quotaShortOf(acc);
					chips.push(react.default.createElement("button", {
						key: g.id,
						type: "button",
						className: "mp_chip",
						"data-on": providerFilter === g.id ? "1" : "0",
						title: quotaTipOf(acc) ?? g.id,
						onClick: function() {
							setProviderFilter(providerFilter === g.id ? null : g.id);
						}
					}, react.default.createElement("span", { className: dotClass(acc) }), g.id, quotaText === void 0 ? null : react.default.createElement("span", { style: { color: toneColor(worstPercent(acc)) } }, " " + quotaText)));
				})(groups[ck]);
				var groupSections = [];
				for (var gs = 0; gs < groups.length; gs += 1) (function(g) {
					if (providerFilter !== null && g.id !== providerFilter) return;
					var sectionRows = [];
					for (var gm = 0; gm < g.models.length; gm += 1) (function(model) {
						if (needle !== "" && fuzzyMatch(query, model.id + " " + model.name + " " + g.name + " " + g.id) !== true) return;
						var isCurrent = selection !== void 0 && selection !== null && selection.provider === g.id && selection.model === model.id;
						var detail = lookupDetail(detailsById, g.id, model.id);
						var caps = [];
						if (detail !== void 0) {
							if (detail.vision === true) caps.push(react.default.createElement("span", {
								key: "v",
								className: "pv_capMini pv_capVision"
							}, t("cap.vision")));
							if (detail.reasoning === true) caps.push(react.default.createElement("span", {
								key: "r",
								className: "pv_capMini pv_capReason"
							}, t("cap.reasoning")));
						}
						var ctx = formatContext(detail !== void 0 && detail.contextWindow !== void 0 ? detail.contextWindow : model.contextWindow);
						sectionRows.push(react.default.createElement("button", {
							key: g.id + "/" + model.id,
							type: "button",
							className: "ms_option",
							disabled: busy || isCurrent,
							title: g.id + "/" + model.id,
							onClick: function() {
								chooseModel(g.id, model.id);
							}
						}, react.default.createElement("span", { className: "ms_name" }, model.id), react.default.createElement("span", { className: "ms_capsCol" }, caps), react.default.createElement("span", { className: "ms_ctxCol" }, ctx === void 0 ? "" : ctx), react.default.createElement("span", { className: "ms_check" }, isCurrent ? checkSvg() : null)));
					})(g.models[gm]);
					if (sectionRows.length === 0) return;
					groupSections.push(react.default.createElement("div", {
						className: "ms_group",
						key: g.id
					}, react.default.createElement("div", { className: "ms_groupTitle" }, g.id), sectionRows));
				})(groups[gs]);
				modelPane = react.default.createElement("div", { style: {
					display: "flex",
					flexDirection: "column",
					minHeight: 0
				} }, react.default.createElement("input", {
					ref: searchRef,
					className: "mp_search",
					type: "text",
					placeholder: t("m.search"),
					value: query,
					onChange: function(event) {
						setQuery(event.target.value);
					}
				}), groups.length > 1 ? react.default.createElement("div", { className: "mp_chips" }, chips) : null, directoryError !== void 0 && directoryError !== null && typeof directoryError === "string" ? react.default.createElement("div", { className: "ms_status" }, String(directoryError)) : null, react.default.createElement("div", { className: "ms_scroll" }, groupSections, groupSections.length === 0 ? react.default.createElement("div", { className: "ms_status" }, needle === "" ? t("m.none") : tf("m.noMatch", { query })) : null));
			}
			var effortPane = null;
			if (pane === "effort" && reasoning !== void 0) {
				var choices = [];
				if (defaultEffortOf(currentModel) === void 0) choices.push({
					effort: void 0,
					label: "Default"
				});
				var effList = reasoning.efforts;
				for (var ec = 0; ec < effList.length; ec += 1) choices.push({
					effort: effList[ec],
					label: effortLabel(effList[ec]) ?? effList[ec]
				});
				var effortRows = choices.map(function(level) {
					var isCur = effectiveEffort === level.effort;
					return react.default.createElement("button", {
						key: level.label,
						type: "button",
						className: "ms_option",
						disabled: busy || isCur,
						onClick: function() {
							chooseEffort(level.effort);
						}
					}, react.default.createElement("span", { className: "ms_name" }, level.label), react.default.createElement("span", { className: "ms_check" }, isCur ? checkSvg() : null));
				});
				effortPane = react.default.createElement("div", { className: "ms_scroll" }, effortRows);
			}
			var menuBody = pane === "model" ? modelPane : pane === "effort" ? effortPane : react.default.createElement("div", { style: {
				display: "flex",
				flexDirection: "column"
			} }, rootPane, effortCell);
			var tallPane = pane === "model" && groups.length > 4;
			var menu = react.default.createElement("div", { className: "ms_menu" + (tallPane ? " ms_menuTall" : "") }, menuBody, error === null ? null : react.default.createElement("div", { className: "plan_note plan_badText" }, error));
			return react.default.createElement("div", {
				className: "plan_root",
				ref: rootRef
			}, trigger, menu);
		}
		//#endregion
		//#region src/client/model-editor.ts
		/**
		* 把一条目录/配置里的模型读成编辑器的一行。
		* @param id - 模型 id。
		* @param name - 显示名（缺省用 id）。
		* @param detail - `/provider/models` 给的详情（可能有窗口/输出/能力）。
		* @param known - 这条是不是已经作为配置声明过。
		*/
		function rowOf(id, name, detail, declared) {
			var fromCatalog = detail !== void 0;
			var fromDeclared = declared !== void 0;
			var contextWindow = detail?.contextWindow !== void 0 ? detail.contextWindow : declared !== void 0 ? readNumber(declared["contextWindow"]) : void 0;
			var maxTokens = detail?.maxTokens !== void 0 ? detail.maxTokens : declared !== void 0 ? readNumber(declared["maxTokens"]) : void 0;
			var declaredInput = declared !== void 0 && Array.isArray(declared["input"]) ? declared["input"] : void 0;
			return {
				id,
				name: name !== void 0 && name !== "" ? name : declared !== void 0 && typeof declared["name"] === "string" ? declared["name"] : id,
				served: true,
				contextWindow: contextWindow === void 0 ? "" : String(contextWindow),
				maxTokens: maxTokens === void 0 ? "" : String(maxTokens),
				input: declaredInput !== void 0 ? declaredInput.filter((x) => typeof x === "string") : detail?.vision === true ? ["text", "image"] : void 0,
				source: fromCatalog && fromDeclared ? "both" : fromDeclared ? "declared" : "catalog",
				customized: false
			};
		}
		function readNumber(value) {
			return typeof value === "number" && Number.isFinite(value) ? value : void 0;
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
		function buildModelEditor(routeId, catalog, details, configured) {
			var rows = [];
			var seen = /* @__PURE__ */ new Set();
			var declared = /* @__PURE__ */ new Map();
			var configuredList = Array.isArray(configured) ? configured : [];
			for (var i = 0; i < configuredList.length; i += 1) {
				var entry = configuredList[i];
				if (entry === null || typeof entry !== "object") continue;
				var record = entry;
				var declaredId = typeof record["id"] === "string" ? record["id"] : void 0;
				if (declaredId === void 0 || declaredId === "") continue;
				declared.set(declaredId, record);
			}
			for (const [id, record] of declared) {
				var detailForDeclared = details !== void 0 && details !== null ? details[id] : void 0;
				var declaredName = typeof record["name"] === "string" ? record["name"] : void 0;
				rows.push(rowOf(id, declaredName !== void 0 ? declaredName : detailForDeclared?.name, detailForDeclared, record));
				seen.add(id);
			}
			if (Array.isArray(catalog)) for (var c = 0; c < catalog.length; c += 1) {
				var model = catalog[c];
				if (model === null || model === void 0 || typeof model.id !== "string" || model.id === "") continue;
				if (seen.has(model.id)) continue;
				seen.add(model.id);
				var detail = details !== void 0 && details !== null ? details[model.id] : void 0;
				rows.push(rowOf(model.id, model.name, detail, void 0));
			}
			return {
				routeId,
				mode: declared.size > 0 ? "custom" : "catalog",
				rows,
				pendingId: ""
			};
		}
		/** 改一行（不可变更新：返回新的 rows）。 */
		function patchModelRow(rows, id, patch) {
			var next = [];
			for (var i = 0; i < rows.length; i += 1) {
				if (rows[i].id !== id) {
					next.push(rows[i]);
					continue;
				}
				next.push({
					...rows[i],
					...patch,
					customized: true
				});
			}
			return next;
		}
		/** 加一行自定义模型（目录里没有的 id）。id 为空或已存在时原样返回。 */
		function addModelRow(rows, id) {
			var trimmed = String(id).trim();
			if (trimmed === "") return [...rows];
			for (var i = 0; i < rows.length; i += 1) if (rows[i].id === trimmed) return [...rows];
			return [...rows, {
				id: trimmed,
				name: trimmed,
				served: true,
				contextWindow: "",
				maxTokens: "",
				source: "declared",
				customized: true
			}];
		}
		/**
		* 校验：能不能把这份清单写进 `models`。
		*
		* 官方那边错一条会让**整条路由**解析失败（`invalid()` 抛错），所以这里先拦：
		* 空 id、重复 id、非正整数窗口/输出。
		* @returns 第一条错误信息；全通过返回 undefined。
		*/
		function validateModelRows(rows) {
			var seen = /* @__PURE__ */ new Set();
			for (var i = 0; i < rows.length; i += 1) {
				var row = rows[i];
				if (!row.served) continue;
				if (row.id.trim() === "") return "有模型的 ID 是空的";
				if (seen.has(row.id)) return "模型 ID 重复：" + row.id;
				seen.add(row.id);
				if (numericField(row.contextWindow) === "invalid") return row.id + " 的上下文窗口要填正整数（留空表示用默认值）";
				if (numericField(row.maxTokens) === "invalid") return row.id + " 的最大输出要填正整数（留空表示用默认值）";
			}
		}
		/** 数字字段解析：'' → undefined（不写这个字段），正整数 → number，其余 → 'invalid'。 */
		function numericField(text) {
			var trimmed = String(text ?? "").trim();
			if (trimmed === "") return void 0;
			var value = Number(trimmed);
			if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return "invalid";
			return value;
		}
		/**
		* 生成要写进 `llm-pi-ai.providers.<id>.models` 的数组。
		*
		* 只写「需要的字段」：`id` 必填；`name` / `contextWindow` / `maxTokens` / `input` 只在确实有值时写。
		* 不写 `reasoningEfforts` / `compat` —— 那两样语义复杂（档位要配 wire 值），界面上没有可靠的
		* 输入方式，宁可不写（不写 = 沿用目录里那份），也不要写错让整条路由挂掉。
		* @param rows - 编辑器里的行（只取勾选的）。
		*/
		function modelListPayload(rows) {
			var out = [];
			for (var i = 0; i < rows.length; i += 1) {
				var row = rows[i];
				if (!row.served) continue;
				var entry = { id: row.id };
				if (row.name !== "" && row.name !== row.id) entry["name"] = row.name;
				var window = numericField(row.contextWindow);
				if (typeof window === "number") entry["contextWindow"] = window;
				var output = numericField(row.maxTokens);
				if (typeof output === "number") entry["maxTokens"] = output;
				if (Array.isArray(row.input) && row.input.length > 0) entry["input"] = [...row.input];
				out.push(entry);
			}
			return out;
		}
		/**
		* 这份清单能不能用「什么都不写」（= 回落目录默认）表达。
		*
		* 条件：一条都没被改过参数、且目录里的每一条都还勾着（没有裁掉任何模型）。
		* 这时写 `models` 是多余的，而且会把目录里后续新增的模型永久挡在门外——所以宁可 unset。
		*/
		function isDefaultCatalogEquivalent(rows) {
			for (var i = 0; i < rows.length; i += 1) {
				var row = rows[i];
				if (row.source === "declared") return false;
				if (!row.served) return false;
				if (row.customized) return false;
			}
			return true;
		}
		//#endregion
		//#region src/client/provider-edit.ts
		/** 可编辑的协议种类（与官方 pi-ai 的 adapter 名一致）。 */
		const PROVIDER_API_OPTIONS = ["openai-completions", "anthropic-messages"];
		function str(value) {
			return typeof value === "string" ? value : "";
		}
		/**
		* 从宿主返回的 route 数据里取出可编辑字段的初始值。
		* @param route - `/provider/status` 的 `routes[]` 里的一条。
		*/
		function providerEditForm(route) {
			const record = route !== null && typeof route === "object" ? route : {};
			return {
				displayName: str(record["displayName"] ?? record["name"]),
				api: str(record["api"]),
				baseURL: str(record["baseURL"] ?? record["baseUrl"]),
				apiKeyEnv: str(record["apiKeyEnv"])
			};
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
		function providerEditSaveOps(routeId, form, original) {
			const ops = [];
			for (const field of [
				"displayName",
				"api",
				"baseURL",
				"apiKeyEnv"
			]) {
				const next = String(form[field] ?? "").trim();
				if (next === String(original[field] ?? "").trim()) continue;
				if (next === "") {
					ops.push({
						op: "unset",
						path: [
							"providers",
							routeId,
							field
						]
					});
					continue;
				}
				ops.push({
					op: "set",
					path: [
						"providers",
						routeId,
						field
					],
					value: next
				});
			}
			return ops;
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
		function validateProviderEdit(form, original) {
			const api = String(form.api ?? "");
			const baseURL = String(form.baseURL ?? "");
			const apiKeyEnv = String(form.apiKeyEnv ?? "");
			if (api !== "" && PROVIDER_API_OPTIONS.indexOf(api) === -1) return "edit.badApi";
			if (baseURL !== "" && !/^https?:\/\//i.test(baseURL)) return "edit.badBaseUrl";
			if (apiKeyEnv !== "" && !/^[A-Z0-9_]+$/.test(apiKeyEnv)) return "edit.badKeyEnv";
			if (original !== void 0 && original !== null) {
				for (const field of [
					"api",
					"baseURL",
					"apiKeyEnv"
				]) if (String(form[field] ?? "").trim() === "" && String(original[field] ?? "").trim() !== "") return "edit.emptyBlocked";
			}
		}
		/**
		* 表单里有没有实质改动（用于决定"保存"按钮是否可点）。
		* @param form - 表单当前值。
		* @param original - 打开编辑时的原值快照。
		*/
		function isProviderEditDirty(form, original) {
			return providerEditSaveOps("_", form, original).length > 0;
		}
		//#endregion
		//#region src/client/settings.ts
		/**
		* 设置页 Provider 标签：CC Switch 式卡片 + 「添加供应商」面板 + 「pi-ai 桥接」二级标签。
		* 桥接明细行是纯函数（piAiBridgeRows），组件照着渲染——离线可测。
		*/
		/** 当前用的是哪一档 pi-ai，分三桶：官方（'dsh' / 'dsh-app'）vs 安全区自有（'safe-<版本>'）vs vendor。 */
		function piAiSourceLabel(source) {
			if (source === "dsh" || source === "dsh-app") return t("bridge.srcOfficial");
			if (typeof source === "string" && source.startsWith("safe-")) return t("bridge.srcLatest");
			return t("bridge.srcVendored");
		}
		function piAiSourceHint(source) {
			if (source === "dsh" || source === "dsh-app") return t("bridge.hintOfficial");
			if (typeof source === "string" && source.startsWith("safe-")) return t("bridge.hintSafe");
			return t("bridge.hintVendored");
		}
		/** 安全区里最新的已就位版本（数组是旧 → 新）；没有则 undefined。 */
		function newestSafeVersion(piAi) {
			const versions = Array.isArray(piAi["safeVersions"]) ? piAi["safeVersions"] : [];
			for (let i = versions.length - 1; i >= 0; i -= 1) {
				const version = versions[i];
				if (typeof version === "string" && version !== "") return version;
			}
		}
		/**
		* 「pi-ai 桥接」标签页的明细行。纯函数，只返回数据，组件照着渲染——这样能离线测，
		* 也免得一堆拼字符串的逻辑埋在组件里。
		*
		* 只放**桥接事实**：版本 / 没体检 / 加载时被跳过的候选 / 未过检验的下载。开关态文字
		* （正在下载 / 重启生效 / 回退官方…）一句都不在这儿——那是 {@link piAiUpstreamText}
		* 在开关行右侧的专职，两处都写就会同一句出现两次（用户 09-22 报的坑）。
		* @param bridge - /provider/status 的 bridge 段（当前加载的那份）。
		* @param piAi - 同上的 piAi 段（未过检验的下载结论）。
		* @returns `[{ key, text, value?, title?, warn?, bad? }]`；value 是右侧的次要文字。
		*/
		function piAiBridgeRows(bridge, piAi) {
			var rows = [];
			if (bridge === void 0 || bridge === null) return rows;
			var bridgeRecord = bridge;
			if (bridgeRecord.active !== true) {
				rows.push({
					key: "err",
					text: String(bridgeRecord.error),
					bad: true
				});
				return rows;
			}
			rows.push({
				key: "pi",
				text: t("bridge.version"),
				value: tf("bridge.srcParen", {
					version: bridgeRecord.piAiVersion,
					source: piAiSourceLabel(bridgeRecord.source)
				}),
				title: piAiSourceHint(bridgeRecord.source)
			});
			if (bridgeRecord.probeUnverified === true) rows.push({
				key: "unverified",
				text: t("bridge.probeUnverified"),
				value: t("bridge.reason"),
				title: t("bridge.probeUnverifiedTip"),
				warn: true
			});
			var rejected = Array.isArray(bridgeRecord.rejected) ? bridgeRecord.rejected : [];
			for (var i = 0; i < rejected.length; i += 1) {
				var skipped = rejected[i];
				rows.push({
					key: "skip-" + i,
					text: tf("bridge.skip", { version: skipped.version }),
					value: t("bridge.reason"),
					title: String(skipped.error),
					warn: true
				});
			}
			var latestRejected = (piAi === void 0 || piAi === null ? {} : piAi).latestRejected;
			if (latestRejected !== void 0 && latestRejected !== null) {
				var rej = latestRejected;
				rows.push({
					key: "rejected",
					text: tf("bridge.stateRejected", { version: rej.version }),
					value: t("bridge.reason"),
					title: String(rej.error),
					warn: true
				});
			}
			return rows;
		}
		/**
		* 开关的勾态与忙碌态（纯函数）。
		*
		* enabled = 偏好是 'latest'（拨 ON）；downloading = 有一次下载正在进行
		* （/provider/status 的 piAi.download）。界面只认这两个事实，不自己推。
		*/
		function piAiToggleState(piAi) {
			var rec = piAi === void 0 || piAi === null ? {} : piAi;
			return {
				enabled: rec.preference === "latest",
				downloading: rec.download !== void 0 && rec.download !== null
			};
		}
		/**
		* 开关右侧的状态文字（纯函数）：下载中 + 各终态，全部有明确文案（Q2-C/Q5）——
		* 拨了开关的用户回来要看得到结论，而不是一片安静。
		*
		* OFF 且未下载时返回 **undefined**（不渲染右侧文字）：那一态本来就是默认态，
		* 无需向用户复读「你在用 DSH 自带版本」——版本行已经写了（0.85.1（官方））。
		* OFF 且进程还在跑安全区版时返回「重启后回退官方」：文件确实还在用，不能标「未启用」。
		* @param piAi - /provider/status 的 piAi 段。
		* @param bridge - 同上的 bridge 段（判「已启用 x.y.z」用）。
		*/
		function piAiUpstreamText(piAi, bridge) {
			var rec = piAi === void 0 || piAi === null ? {} : piAi;
			if (rec.download !== void 0 && rec.download !== null) return t("bridge.stateDownloading");
			var safeNewest = newestSafeVersion(rec);
			if (rec.preference === "latest") {
				if (rec.needsRestart === true && safeNewest !== void 0) return (rec.lastCheck === void 0 || rec.lastCheck === null ? {} : rec.lastCheck).installed === safeNewest ? tf("bridge.stateUpdated", { version: safeNewest }) : tf("bridge.statePending", { version: safeNewest });
				if (rec.latestRejected !== void 0 && rec.latestRejected !== null) return tf("bridge.stateRejected", { version: rec.latestRejected.version });
				var bridgeRecord = bridge === void 0 || bridge === null ? {} : bridge;
				if (bridgeRecord.active === true && typeof bridgeRecord.source === "string" && bridgeRecord.source.startsWith("safe-")) return;
				var lastCheck = rec.lastCheck;
				if (lastCheck !== void 0 && lastCheck !== null && lastCheck.reason !== void 0) return String(lastCheck.reason ?? lastCheck.error);
				return t("bridge.stateMissing");
			}
			if (safeNewest !== void 0) return rec.needsRestart === true ? tf("bridge.stateOffPending", { version: safeNewest }) : tf("bridge.stateOffKept", { version: safeNewest });
		}
		/** 单个摘要 chip：「5h余量:90% 34min后重置」；余额类无标签只显示金额；sep 为组间分割线。 */
		function headlineChip(chip, key) {
			if (chip.sep === true) return react.default.createElement("span", {
				key: "sep" + String(key),
				className: "pv_chipSep"
			});
			if (chip.label === void 0 || chip.label === null) return react.default.createElement("span", {
				key: String(key),
				className: "pv_chipItem"
			}, react.default.createElement("span", {
				key: "t",
				style: { color: toneColor(chip.percent) }
			}, chip.text));
			var parts = [react.default.createElement("span", {
				key: "l",
				className: "pv_chipLabel"
			}, chip.label + ":"), react.default.createElement("span", {
				key: "t",
				style: { color: toneColor(chip.percent) }
			}, chip.text)];
			if (chip.reset !== void 0 && chip.reset !== "") parts.push(react.default.createElement("span", {
				key: "r",
				className: "pv_chipReset"
			}, " ◷ " + resetCountdownText(chip.reset)));
			return react.default.createElement("span", {
				key: String(key),
				className: "pv_chipItem"
			}, parts);
		}
		/**
		* 能力 id → 样式类 + 字典 key（模型行与详情卡共用一套）。
		*
		* 分开两件事是必须的：**样式类以 id 为键**（语言无关），显示名才走 t()。
		* 原来拿中文显示名当键，切到英文就一个类都匹配不上——徽章会丢掉配色。
		*/
		var CAP_KEYS = {
			vision: {
				cls: "pv_capVision",
				label: "cap.vision"
			},
			reasoning: {
				cls: "pv_capReason",
				label: "cap.reasoning"
			},
			video: {
				cls: "pv_capVideo",
				label: "cap.video"
			}
		};
		/**
		* 一条详情里**已知为真**的能力 id（顺序：视觉、推理、视频），离线可测的纯函数。
		*
		* 返回 id 而不是显示名：id 是语言无关的内部标识，显示名在渲染时才 t() 出来。
		* 只认 `true`：`false` 是「明确不支持」，`undefined` 是「没查过」（自定义模型 id 在 pi-ai
		* 目录里查不到、route 也没声明模态时就是这样）。两者都不出徽章，但它们是两回事——
		* 详情卡里必须分开写，否则等于把「没查过」渲染成「没有视觉」。
		*/
		function capabilityKeysOf(detail) {
			var keys = [];
			if (detail === void 0 || detail === null) return keys;
			if (detail.vision === true) keys.push("vision");
			if (detail.reasoning === true) keys.push("reasoning");
			if (detail.video === true) keys.push("video");
			return keys;
		}
		/** 一条详情的**显示用**能力徽章文案（顺序同 {@link capabilityKeysOf}）；语言由 t() 现取。 */
		function capabilityBadges(detail) {
			return capabilityKeysOf(detail).map(function(id) {
				return t(CAP_KEYS[id].label);
			});
		}
		/** 能力 id → 样式类；未知 id 不给类，不塞半条样式。 */
		function capClassOf(id) {
			return CAP_KEYS[id] === void 0 ? "" : CAP_KEYS[id].cls;
		}
		/** 能力字段有没有出处：三样全是 undefined 就是「未知」，界面得说明白。 */
		function capabilitiesKnown(detail) {
			if (detail === void 0 || detail === null) return false;
			return detail.vision !== void 0 || detail.video !== void 0 || detail.reasoning !== void 0;
		}
		/**
		* 自绘下拉视图（用户批注：原生 select 弹层是 OS 样式，与页面视觉不协调）。
		* 触发器与 pv_field 输入框同观感，弹层用页面 token（白底/圆角/投影/悬停灰底/选中品牌色）。
		* 开合状态由调用方持有（展开互斥、外点关闭、Escape 关闭都在调用方的 effect 里做）。
		*/
		function pvSelectView(config) {
			var currentLabel = config.value;
			for (var i = 0; i < config.options.length; i += 1) if (config.options[i].value === config.value) {
				currentLabel = config.options[i].label;
				break;
			}
			return react.default.createElement("div", { className: "pv_sel" }, react.default.createElement("button", {
				type: "button",
				className: "pv_selTrigger" + (config.open ? " pv_selOpen" : ""),
				onClick: function() {
					config.onToggle();
				}
			}, react.default.createElement("span", { className: "pv_selValue" }, currentLabel), react.default.createElement("span", { className: "pv_selChev" }, caretSvg(config.open))), config.open !== true ? null : react.default.createElement("div", { className: "pv_selMenu" }, config.options.map(function(option) {
				var selected = option.value === config.value;
				return react.default.createElement("div", {
					key: option.value === "" ? "__default" : option.value,
					className: "pv_selOption" + (selected ? " pv_selOptionOn" : ""),
					onClick: function() {
						config.onPick(option.value);
					}
				}, react.default.createElement("span", { className: "pv_selOptLabel" }, option.label), selected ? react.default.createElement("span", { className: "pv_selCheck" }, checkSvg()) : null);
			})));
		}
		/** 模型行：ID + 能力徽章（视觉/推理/视频）+ 上下文 / 最大输出标签，悬浮出 Cherry 式详情卡。 */
		function modelRow(model, account, detailsById) {
			var detail = lookupDetail(detailsById, account.id, model.id);
			var ctx = formatContext(detail !== void 0 && detail.contextWindow !== void 0 ? detail.contextWindow : model.contextWindow);
			var max = formatContext(detail !== void 0 && detail.maxTokens !== void 0 ? detail.maxTokens : void 0);
			var caps = capabilityKeysOf(detail).map(function(id) {
				return react.default.createElement("span", {
					key: id,
					className: "pv_capMini " + capClassOf(id)
				}, t(CAP_KEYS[id].label));
			});
			return react.default.createElement("div", {
				className: "pv_mRow",
				key: "m-" + model.id
			}, react.default.createElement("span", {
				className: "pv_mId",
				title: model.id
			}, model.id), react.default.createElement("span", { className: "pv_mCaps" }, caps), react.default.createElement("span", { className: "pv_mCtx" }, ctx === void 0 ? "" : ctx), react.default.createElement("span", { className: "pv_mMax" }, max === void 0 ? "" : max), modelTip(model, account, detail));
		}
		/** Cherry 式模型详情卡：服务商 / 模型 ID / 能力标记 / 上下文 / 最大输出 / 思维链。 */
		function modelTip(model, account, detail) {
			var rows = [react.default.createElement("div", {
				className: "pv_tipTitle",
				key: "t"
			}, model.name)];
			rows.push(tipLine(t("prov.provider"), shortName(account), "p"));
			rows.push(tipLine(t("prov.modelId"), model.id, "id"));
			var capIds = capabilityKeysOf(detail);
			if (capIds.length > 0) rows.push(react.default.createElement("div", {
				className: "pv_tipRow",
				key: "c"
			}, react.default.createElement("span", { className: "pv_tipLabel" }, t("prov.caps")), react.default.createElement("span", { className: "pv_tipCaps" }, capIds.map(function(id) {
				return tipCap(t(CAP_KEYS[id].label), capClassOf(id));
			}))));
			if (!capabilitiesKnown(detail)) rows.push(react.default.createElement("div", {
				className: "pv_tipDim",
				key: "caps-unknown"
			}, t("cap.unknown")));
			if (detail !== void 0) {
				var cw = detail.contextWindow !== void 0 ? detail.contextWindow : model.contextWindow;
				if (cw !== void 0) rows.push(tipLine(t("cap.cw"), cw.toLocaleString("en-US"), "cw"));
				if (detail.maxTokens !== void 0) rows.push(tipLine(t("cap.maxTokens"), detail.maxTokens.toLocaleString("en-US"), "mt"));
				rows.push(tipLine(t("cap.chain"), detail.reasoning === void 0 ? t("cap.unknownShort") : detail.reasoning === true ? Array.isArray(detail.thinkingLevels) && detail.thinkingLevels.length > 0 ? detail.thinkingLevels.join("、") : t("cap.auto") : t("cap.off"), "tk"));
				if (detail.source === "declared") rows.push(react.default.createElement("div", {
					className: "pv_tipDim",
					key: "src"
				}, t("cap.sourceDeclared")));
			} else rows.push(react.default.createElement("div", {
				className: "pv_tipDim",
				key: "dim"
			}, t("cap.noMeta")));
			return react.default.createElement("div", { className: "pv_tip" }, rows);
		}
		function tipLine(label, value, key) {
			return react.default.createElement("div", {
				className: "pv_tipRow",
				key: String(key)
			}, react.default.createElement("span", { className: "pv_tipLabel" }, label), react.default.createElement("span", null, String(value)));
		}
		function tipCap(text, cls) {
			return react.default.createElement("span", { className: "pv_cap " + cls }, text);
		}
		/**
		* 「添加供应商」下拉里一项的状态：已配置**且密钥在**才禁选。
		* 路由配好了但还没密钥（插件自带 config 就声明了 deepseek 这种）仍可选中——选中它就是走一遍
		* 表单把密钥存进去，否则用户既加不了新的、也补不了那一条缺的 key。
		*/
		function presetPickState(preset) {
			if (preset.configured !== true) return {
				disabled: false,
				tag: null
			};
			if (preset.missingKey === true) return {
				disabled: false,
				tag: t("prov.presetMissingKey")
			};
			return {
				disabled: true,
				tag: t("prov.presetConfigured")
			};
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
		function providerSaveOps(routeId, form) {
			var ops = [];
			var fields = [
				{
					field: "api",
					value: String(form.api ?? "")
				},
				{
					field: "baseURL",
					value: String(form.baseURL ?? "").trim()
				},
				{
					field: "apiKeyEnv",
					value: String(form.apiKeyEnv ?? "").trim()
				}
			];
			for (var i = 0; i < fields.length; i += 1) {
				if (fields[i].value === "") continue;
				ops.push({
					op: "set",
					path: [
						"providers",
						routeId,
						fields[i].field
					],
					value: fields[i].value
				});
			}
			return ops;
		}
		/**
		* 这条 route 是不是已经配过了（决定「添加」还是「更新」的措辞与提示）。
		*
		* 依据是预设清单上的 configured 标记（宿主 `/provider/presets` 给的，与卡片上的
		* 「已配置 / 缺密钥」同源）——界面里不该另算一套「已存在」的判断。
		* @param presets - `/provider/presets` 的清单。
		* @param routeId - 要查的 route id。
		*/
		function isRouteConfigured(presets, routeId) {
			if (!Array.isArray(presets)) return false;
			for (var i = 0; i < presets.length; i += 1) {
				var preset = presets[i];
				if (preset !== null && typeof preset === "object" && preset["id"] === routeId && preset["configured"] === true) return true;
			}
			return false;
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
		function routeYamlOf(account) {
			var lines = [t("yaml.header"), account.id + ":"];
			if (typeof account.displayName === "string" && account.displayName !== "") lines.push("  displayName: " + account.displayName);
			if (typeof account.api === "string" && account.api !== "") lines.push("  api: " + account.api);
			if (typeof account.baseUrl === "string" && account.baseUrl !== "") lines.push("  baseURL: " + account.baseUrl);
			if (typeof account.apiKeyEnv === "string" && account.apiKeyEnv !== "") {
				lines.push("  apiKeyEnv: " + account.apiKeyEnv);
				lines.push(t("yaml.credNote"));
			}
			return lines.join("\n") + "\n";
		}
		/**
		* 「刷新余量 / 保存密钥」之后的结果判定：成功返回 undefined，失败给出原因。
		*
		* 宿主这两条路由一律回 200，成败看 body 的 ok；凭据没值时 ok=false，原因挂在 account.error
		* 上（"DEEPSEEK_API_KEY 没有值"）。只判 account 在不在会在没配 key 时弹一句"✓ 余量已刷新"，
		* 跟卡片上那句"未配置 key"直接打架。
		*/
		function refreshFailure(result) {
			var record = result === null || result === void 0 ? {} : result;
			if (record.ok === true) return void 0;
			var account = record.account;
			if (account !== null && typeof account === "object") {
				var reason = account.error;
				if (reason !== void 0 && reason !== null && String(reason) !== "") return String(reason);
			}
			if (record.error !== void 0 && record.error !== null) return String(record.error);
			return t("err.unknown");
		}
		/**
		* 添加 provider：选预设 → 填密钥/端点 → 测试 → 通过才能添加。
		* 测试走官方 llm/discoverModels 草稿探测（不落盘）；写入走官方同一套控制器
		* （settings/mutate 写 llm-pi-ai.providers 段 + credentials/set 存密钥），
		* 与官方 Models 页的存储完全同源。
		*/
		function AddProviderPanel(props) {
			var presets = Array.isArray(props.presets) ? props.presets : [];
			var detailsIndex = props.details !== void 0 && props.details !== null ? props.details : null;
			var open = props.open === true;
			var setOpen = function(next) {
				if (typeof props.onOpenChange === "function") props.onOpenChange(next);
			};
			var formState = react.default.useState({
				presetId: "",
				routeId: "",
				key: "",
				baseURL: "",
				api: "",
				apiKeyEnv: "",
				websiteUrl: void 0
			});
			var form = formState[0];
			var setForm = formState[1];
			var apiOpenState = react.default.useState(false);
			var apiOpen = apiOpenState[0];
			var setApiOpen = apiOpenState[1];
			react.default.useEffect(function() {
				if (apiOpen !== true) return void 0;
				function onDown(event) {
					var target = event.target;
					if (target !== null && typeof target === "object" && typeof target.closest === "function" && target.closest(".pv_sel") !== null) return;
					setApiOpen(false);
				}
				function onKey(event) {
					if (event.key === "Escape") setApiOpen(false);
				}
				document.addEventListener("pointerdown", onDown);
				document.addEventListener("keydown", onKey);
				return function() {
					document.removeEventListener("pointerdown", onDown);
					document.removeEventListener("keydown", onKey);
				};
			}, [apiOpen]);
			var testState = react.default.useState({
				phase: "idle",
				message: "",
				models: []
			});
			var test = testState[0];
			var setTest = testState[1];
			var queryCookieOpenState = react.default.useState(false);
			var queryCookieOpen = queryCookieOpenState[0];
			var setQueryCookieOpen = queryCookieOpenState[1];
			var queryCookieDraftState = react.default.useState("");
			var queryCookieDraft = queryCookieDraftState[0];
			var setQueryCookieDraft = queryCookieDraftState[1];
			var modelPickState = react.default.useState({});
			var modelPick = modelPickState[0];
			var setModelPick = modelPickState[1];
			var busyState = react.default.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var noteState = react.default.useState(null);
			var note = noteState[0];
			var setNote = noteState[1];
			var pickRef = react.default.useRef(null);
			var pickOpenState = react.default.useState(false);
			var pickOpen = pickOpenState[0];
			var setPickOpen = pickOpenState[1];
			var pickFilterState = react.default.useState("");
			var pickFilter = pickFilterState[0];
			var setPickFilter = pickFilterState[1];
			react.default.useEffect(function() {
				if (pickOpen !== true) return void 0;
				function onPointerDown(event) {
					if (pickRef.current !== null && pickRef.current.contains(event.target) === false) setPickOpen(false);
				}
				document.addEventListener("pointerdown", onPointerDown);
				return function() {
					document.removeEventListener("pointerdown", onPointerDown);
				};
			}, [pickOpen]);
			function patchForm(patch) {
				setForm(function(prev) {
					return withKeys(prev, patch);
				});
			}
			function pickPreset(id) {
				var preset = findById(presets, id);
				if (preset === void 0) return;
				patchForm({
					presetId: preset.id,
					routeId: preset.custom === true ? "" : preset.id,
					baseURL: preset.baseURL,
					api: preset.api,
					apiKeyEnv: preset.apiKeyEnv,
					websiteUrl: preset.websiteUrl,
					key: ""
				});
				setTest({
					phase: "idle",
					message: ""
				});
				setNote(null);
			}
			function runTest() {
				var providerId = form.routeId.trim() !== "" ? form.routeId.trim() : pickedPreset !== void 0 ? pickedPreset.id : "";
				if (providerId === "" || form.baseURL.trim() === "" || form.key.trim() === "") {
					setTest({
						phase: "fail",
						message: t("prov.addManualHint")
					});
					return;
				}
				setTest({
					phase: "run",
					message: t("prov.testing")
				});
				apiCall("llm/discoverModels", {
					settingsNs: "llm-pi-ai",
					request: {
						provider: providerId,
						baseURL: form.baseURL.trim(),
						api: form.api,
						apiKey: form.key.trim()
					}
				}).then(function(value) {
					var models = Array.isArray(value) ? value : value !== null && typeof value === "object" && Array.isArray(value.models) ? value.models : [];
					var names = [];
					var discovered = [];
					for (var i = 0; i < models.length; i += 1) {
						var m = models[i];
						var mid = typeof m === "string" ? m : String(m && (m.id || m.name) || "");
						if (mid === "") continue;
						if (typeof m === "string") discovered.push({ id: mid });
						else {
							var rec = m;
							var entry = { id: mid };
							if (rec["name"] !== void 0 && rec["name"] !== null && String(rec["name"]) !== "") entry.name = String(rec["name"]);
							var ctxRaw = rec["contextWindow"] !== void 0 ? rec["contextWindow"] : rec["context_length"];
							if (typeof ctxRaw === "number" && ctxRaw > 0) entry.ctx = ctxRaw;
							var maxRaw = rec["maxTokens"] !== void 0 ? rec["maxTokens"] : rec["max_output_tokens"];
							if (typeof maxRaw === "number" && maxRaw > 0) entry.max = maxRaw;
							var input = rec["inputModalities"] !== void 0 ? rec["inputModalities"] : rec["input"];
							if (Array.isArray(input)) entry.input = input.filter(function(x) {
								return typeof x === "string";
							});
							discovered.push(entry);
						}
						if (names.length < 3) names.push(typeof m === "string" ? m : String(m && (m.name || m.id) || "?"));
					}
					setTest({
						phase: "ok",
						message: names.length === 0 ? tf("prov.testOk", { count: models.length }) : tf("prov.testOkNames", {
							count: models.length,
							names: models.length > 3 ? tf("prov.testOkMore", { names: names.join("、") }) : names.join("、")
						}),
						models: discovered
					});
					var initialPick = {};
					for (var pi = 0; pi < discovered.length; pi += 1) initialPick[discovered[pi].id] = true;
					setModelPick(initialPick);
				}).catch(function(cause) {
					setTest({
						phase: "fail",
						message: "✗ " + String(cause && cause.message ? cause.message : cause),
						models: []
					});
				});
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
			/** 查询配置（Step Plan 控制台 cookie）：写 CONSOLE_COOKIE 凭据，成功后日志确认。 */
			function saveQueryCookieForm() {
				var ref = String(form.routeId ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_CONSOLE_COOKIE";
				var value = String(queryCookieDraft ?? "").trim();
				if (ref === "" || ref.indexOf("_CONSOLE_COOKIE") === -1) {
					setTest({
						phase: "fail",
						message: "✗ 未找到 CONSOLE_COOKIE 凭据名（先选协议与 API 地址）"
					});
					return;
				}
				if (value === "") {
					setTest({
						phase: "fail",
						message: t("prov.queryCookieEmpty")
					});
					return;
				}
				apiCall("credentials/set", {
					ref,
					value
				}).then(function() {
					setQueryCookieDraft("");
					setTest({
						phase: "ok",
						message: t("prov.queryCookieSaved")
					});
				}).catch(function(cause) {
					setTest({
						phase: "fail",
						message: tf("prov.queryCookieFailed", { reason: cause && cause.message ? cause.message : cause })
					});
				});
			}
			function add() {
				var routeId = form.routeId.trim();
				if (routeId === "") {
					setNote(t("prov.routeIdRequired"));
					return;
				}
				setBusy(true);
				setNote(null);
				var existed = isRouteConfigured(presets, routeId);
				var ops = providerSaveOps(routeId, form);
				if (existed !== true && Array.isArray(test.models) && test.models.length > 0) {
					var chosen = test.models.filter(function(m) {
						return modelPick[m.id] !== false;
					});
					if (chosen.length === 0) {
						setNote(t("prov.pickSomeModels"));
						return;
					}
					ops = ops.concat([{
						op: "set",
						path: [
							"providers",
							routeId,
							"models"
						],
						value: chosen.map(function(m) {
							var entry = { id: m.id };
							if (m.name !== void 0) entry.name = m.name;
							if (typeof m.ctx === "number" && m.ctx > 0) entry.contextWindow = m.ctx;
							if (typeof m.max === "number" && m.max > 0) entry.maxTokens = m.max;
							if (Array.isArray(m.input) && m.input.length > 0) entry.input = m.input;
							return entry;
						})
					}]);
				}
				apiCall("settings/mutate", {
					ns: "llm-pi-ai",
					ops
				}).then(function() {
					return apiCall("credentials/set", {
						ref: form.apiKeyEnv.trim(),
						value: form.key.trim()
					});
				}).then(function() {
					setTest({
						phase: "idle",
						message: ""
					});
					setForm({
						presetId: "",
						routeId: "",
						key: "",
						baseURL: "",
						api: "",
						apiKeyEnv: "",
						websiteUrl: void 0
					});
					setModelPick({});
					setOpen(false);
					if (typeof props.onAdded === "function") props.onAdded(existed ? tf("prov.updated", { id: routeId }) : tf("prov.added", { id: routeId }));
				}).catch(function(cause) {
					setNote(tf("prov.addFailed", { reason: cause && cause.message ? cause.message : cause }));
				}).then(function() {
					setBusy(false);
				});
			}
			if (!open) return react.default.createElement("button", {
				type: "button",
				className: "pv_addBtn",
				onClick: function() {
					setOpen(true);
				}
			}, t("addProvider"));
			var pickedPreset = findById(presets, form.presetId !== "" ? form.presetId : form.routeId);
			var pickedLabel = pickedPreset === void 0 ? form.routeId : pickedPreset.label;
			var customPicked = pickedPreset !== void 0 && pickedPreset.custom === true;
			var suggestedId = pickedPreset !== void 0 && customPicked ? pickedPreset.id : "";
			var suggestedEnv = pickedPreset !== void 0 && customPicked ? pickedPreset.apiKeyEnv : "";
			var pickItems = [];
			for (var pk = 0; pk < presets.length; pk += 1) (function(preset) {
				if (pickFilter.trim() !== "" && fuzzyMatch(pickFilter, preset.label + " " + preset.id) !== true) return;
				var pick = presetPickState(preset);
				pickItems.push(react.default.createElement("button", {
					key: preset.id,
					type: "button",
					className: "pv_pickItem",
					disabled: pick.disabled,
					onClick: function() {
						pickPreset(preset.id);
						setPickOpen(false);
					}
				}, preset.label, pick.tag === null ? null : react.default.createElement("span", {
					className: "plan_tag",
					style: { marginLeft: "6px" }
				}, pick.tag)));
			})(presets[pk]);
			if (pickItems.length === 0) pickItems.push(react.default.createElement("div", {
				className: "pv_pickEmpty",
				key: "empty"
			}, t("prov.noMatch")));
			return react.default.createElement("div", { className: "pv_pc" }, react.default.createElement("div", {
				className: "pv_pcBody",
				style: {
					borderTop: "0",
					paddingTop: "10px",
					gap: "6px"
				}
			}, react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, t("prov.provider")), react.default.createElement("span", {
				className: "pv_pick",
				ref: pickRef
			}, react.default.createElement("button", {
				type: "button",
				className: "pv_field pv_pickBtn",
				onClick: function() {
					setPickOpen(!pickOpen);
					setPickFilter("");
				}
			}, react.default.createElement("span", null, pickedLabel === "" ? t("prov.selectPlaceholder") : pickedLabel), react.default.createElement("span", { className: "pv_pcCaret" }, pickOpen ? "▾" : "▸")), pickOpen === false ? null : react.default.createElement("div", { className: "pv_pickMenu" }, react.default.createElement("input", {
				className: "pv_mFilter",
				style: { width: "100%" },
				type: "text",
				placeholder: t("prov.filter"),
				value: pickFilter,
				autoFocus: true,
				onChange: function(event) {
					setPickFilter(event.target.value);
				}
			}), react.default.createElement("div", { className: "pv_pickList" }, pickItems)))), react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, t("prov.routeId")), react.default.createElement("input", {
				className: customPicked ? "pv_field pv_key" : "pv_field pv_ro",
				value: form.routeId,
				readOnly: customPicked !== true,
				placeholder: suggestedId,
				title: customPicked ? t("prov.routeIdHintCustom") : t("prov.routeIdHintFixed"),
				onChange: function(event) {
					if (customPicked !== true) return;
					var next = event.target.value;
					if (next.trim() === "") {
						patchForm({
							routeId: "",
							apiKeyEnv: suggestedEnv
						});
						return;
					}
					patchForm({
						routeId: next,
						apiKeyEnv: next.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_API_KEY"
					});
				}
			})), react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, t("prov.apiKey")), react.default.createElement("input", {
				className: "pv_field pv_key",
				type: "password",
				value: form.key,
				onChange: function(event) {
					patchForm({ key: event.target.value });
				}
			}), form.websiteUrl === void 0 ? null : react.default.createElement("a", {
				className: "pv_pcLink",
				href: form.websiteUrl,
				target: "_blank",
				rel: "noreferrer",
				style: { marginLeft: "8px" }
			}, t("prov.keyLink"))), react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, t("prov.apiBase")), react.default.createElement("input", {
				className: form.baseURL === "" ? "pv_field pv_key" : "pv_field pv_ro",
				value: form.baseURL,
				readOnly: form.baseURL !== "",
				onChange: function(event) {
					patchForm({ baseURL: event.target.value });
				}
			})), react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, t("prov.protocol")), customPicked ? pvSelectView({
				open: apiOpen,
				value: form.api,
				options: [{
					value: "openai-completions",
					label: "OpenAI"
				}, {
					value: "anthropic-messages",
					label: "Anthropic"
				}],
				onToggle: function() {
					setApiOpen(!apiOpen);
				},
				onPick: function(value) {
					setApiOpen(false);
					patchForm({ api: value });
				}
			}) : react.default.createElement("input", {
				className: "pv_field pv_ro",
				value: form.api,
				readOnly: true
			})), react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, ""), react.default.createElement("span", { className: "pv_hint" }, tf("prov.credStoredAs", { ref: form.apiKeyEnv }))), react.default.createElement("div", { className: "pv_actRow" }, react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "0" },
				disabled: test.phase === "run",
				onClick: runTest
			}, test.phase === "run" ? t("prov.discovering") : t("prov.discover")), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				title: t("prov.queryConfigTip"),
				onClick: function() {
					var pickedPreset = presets.find(function(p) {
						return p.id === form.presetId;
					});
					if (pickedPreset === void 0 || pickedPreset.queryConfigNeeded !== true) {
						setTest({
							phase: "ok",
							message: t("prov.noQueryConfigNeeded")
						});
						return;
					}
					setQueryCookieOpen(true);
				}
			}, t("prov.queryConfig")), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				disabled: busy || test.phase !== "ok",
				title: test.phase === "ok" ? "" : t("prov.needTestFirst"),
				onClick: add
			}, busy ? t("prov.adding") : t("prov.addToList")), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "auto" },
				onClick: function() {
					setOpen(false);
					setTest({
						phase: "idle",
						message: ""
					});
					setNote(null);
				}
			}, t("prov.cancel"))), queryCookieOpen ? react.default.createElement("div", { className: "pv_line pv_row" }, react.default.createElement("span", null, t("prov.queryCookieLabel")), react.default.createElement("input", {
				className: "pv_field pv_key",
				type: "text",
				value: queryCookieDraft,
				placeholder: t("prov.queryCookiePlaceholder"),
				onChange: function(event) {
					setQueryCookieDraft(event.target.value);
				}
			}), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				onClick: saveQueryCookieForm
			}, t("prov.save"))) : null, test.message === "" ? null : react.default.createElement("div", { className: "plan_note" + (test.phase === "fail" ? " plan_badText" : "") }, test.message), test.phase === "ok" && test.models.length > 0 ? (function() {
				var allPicked = test.models.every(function(m) {
					return modelPick[m.id] !== false;
				});
				function pickAll(picked) {
					var next = {};
					for (var pi = 0; pi < test.models.length; pi += 1) next[test.models[pi].id] = picked;
					setModelPick(next);
				}
				var rows = test.models.map(function(m) {
					var detail = lookupDetailAnySource(detailsIndex, m.id);
					var vision = m.input !== void 0 ? m.input.indexOf("image") !== -1 : detail !== void 0 && detail.vision === true;
					var video = m.input !== void 0 ? m.input.indexOf("video") !== -1 : detail !== void 0 && detail.video === true;
					var reasoning = detail !== void 0 && detail.reasoning === true;
					var ctxText = m.ctx !== void 0 ? formatContext(m.ctx) : detail !== void 0 && detail.source === "pi-ai" ? formatContext(detail.contextWindow) : void 0;
					var maxText = m.max !== void 0 ? formatContext(m.max) : detail !== void 0 && detail.source === "pi-ai" ? formatContext(detail.maxTokens) : void 0;
					var caps = [];
					if (vision === true) caps.push(react.default.createElement("span", {
						key: "v",
						className: "pv_capMini pv_capVision"
					}, "视觉"));
					if (video === true) caps.push(react.default.createElement("span", {
						key: "d",
						className: "pv_capMini pv_capVideo"
					}, "视频"));
					if (reasoning === true) caps.push(react.default.createElement("span", {
						key: "r",
						className: "pv_capMini pv_capReason"
					}, "推理"));
					return react.default.createElement("div", {
						className: "pv_meRow",
						key: m.id
					}, react.default.createElement("input", {
						type: "checkbox",
						className: "pv_meCheck",
						checked: modelPick[m.id] !== false,
						onChange: function() {
							setModelPick(function(prev) {
								return withKeys(prev, { [m.id]: modelPick[m.id] === false });
							});
						}
					}), react.default.createElement("span", {
						className: "pv_mId",
						title: m.name !== void 0 && m.name !== m.id ? m.name : m.id
					}, m.id, m.name !== void 0 && m.name !== "" && m.name !== m.id ? react.default.createElement("span", { className: "pv_modelPickName" }, m.name) : null), react.default.createElement("span", { className: "pv_mCaps" }, caps.length > 0 ? caps : [react.default.createElement("span", {
						key: "none",
						className: "pv_pickNone"
					}, "—")]), react.default.createElement("span", { className: "pv_mCtx" }, ctxText !== void 0 ? ctxText : "—"), react.default.createElement("span", { className: "pv_mMax" }, maxText !== void 0 ? maxText : "—"));
				});
				return react.default.createElement("div", { className: "pv_modelPick" }, react.default.createElement("div", { className: "pv_meHeadRow" }, react.default.createElement("span", null, react.default.createElement("input", {
					type: "checkbox",
					className: "pv_meCheck",
					checked: allPicked,
					title: allPicked ? "全不选" : "全选",
					onChange: function() {
						pickAll(allPicked !== true);
					}
				})), react.default.createElement("span", { style: { fontFamily: "inherit" } }, t("prov.modelId")), react.default.createElement("span", null, t("prov.caps")), react.default.createElement("span", null, t("prov.ctx")), react.default.createElement("span", null, t("cap.maxTokens"))), rows);
			})() : null, !note ? null : react.default.createElement("div", { className: "plan_note" }, note)));
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
		function modelEditRow(row, _patch, remove, onToggle, busy, expanded, onToggleExpand) {
			var known = row.known === true;
			var editable = row.inPiAi !== true;
			var caps = [
				row.vision === true ? react.default.createElement("span", {
					key: "v",
					className: "pv_capMini pv_capVision",
					title: known ? "目录元数据：支持图片输入" : "添加时勾选：支持图片输入"
				}, "视觉") : null,
				row.video === true ? react.default.createElement("span", {
					key: "d",
					className: "pv_capMini pv_capVideo",
					title: known ? "目录元数据：支持视频输入" : "添加时勾选：支持视频输入"
				}, "视频") : null,
				row.knownReasoning === true || row.reasoning === true ? react.default.createElement("span", {
					key: "r",
					className: "pv_capMini pv_capReason",
					title: known ? "目录元数据：支持思维链" : "添加时勾选：支持思维链（声明条目写 reasoning: true）"
				}, "推理") : null
			];
			return react.default.createElement("div", {
				className: "pv_meRow" + (row.enabled ? "" : " pv_meRowOff"),
				key: row.id
			}, react.default.createElement("input", {
				type: "checkbox",
				className: "pv_meCheck",
				checked: row.enabled,
				disabled: busy,
				title: "勾选 / 取消只改草稿，点「保存」后写入 settings.yaml",
				onChange: function(event) {
					onToggle(row, event.target.checked === true);
				}
			}), react.default.createElement("span", { className: "pv_meIdBox" }, react.default.createElement("span", {
				className: "pv_mId" + (editable ? " pv_mIdEdit" : "") + (expanded ? " pv_mIdOpen" : ""),
				title: editable ? "点击编辑这条模型的显示名 / 上下文 / 最大输出 / 能力" : row.id,
				onClick: editable ? function() {
					onToggleExpand(row.id);
				} : void 0
			}, row.id)), react.default.createElement("span", { className: "pv_mCaps" }, caps), react.default.createElement("span", {
				className: "pv_mCtx",
				title: "上下文窗口"
			}, known && row.edited !== true ? formatContext(row.knownContextWindow) ?? "" : formatContext(parsePositiveInt(row.contextWindow)) ?? ""), react.default.createElement("span", {
				className: "pv_mMax",
				title: "最大输出"
			}, known && row.edited !== true ? formatContext(row.knownMaxTokens) ?? "" : formatContext(parsePositiveInt(row.maxTokens)) ?? ""), row.inPiAi !== true ? react.default.createElement("button", {
				type: "button",
				className: "pv_iconBtn",
				disabled: busy,
				title: "把这条自定义模型从清单里删掉（点「保存」后生效）",
				onClick: function() {
					remove(row.id);
				}
			}, "✕") : null);
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
		function resolveAddDefaults(rows, modelId, details) {
			var exactCtx = void 0;
			var exactMax = void 0;
			if (details !== null && details !== void 0 && modelId !== "") {
				var ctxs = [];
				var maxs = [];
				for (var dk in details) {
					var d = details[dk];
					if (d === null || d === void 0 || d.id !== modelId) continue;
					if (d.source !== "pi-ai") continue;
					if (typeof d.contextWindow === "number" && d.contextWindow > 0) ctxs.push(d.contextWindow);
					if (typeof d.maxTokens === "number" && d.maxTokens > 0) maxs.push(d.maxTokens);
				}
				if (ctxs.length > 0) exactCtx = Math.min.apply(null, ctxs);
				if (maxs.length > 0) exactMax = Math.min.apply(null, maxs);
			}
			var tierCtx = void 0;
			var tierMax = void 0;
			for (var i = 0; i < rows.length; i += 1) {
				var r = rows[i];
				if (r.inPiAi !== true) continue;
				if (typeof r.knownContextWindow === "number" && r.knownContextWindow > 0 && (tierCtx === void 0 || r.knownContextWindow < tierCtx)) tierCtx = r.knownContextWindow;
				if (typeof r.knownMaxTokens === "number" && r.knownMaxTokens > 0 && (tierMax === void 0 || r.knownMaxTokens < tierMax)) tierMax = r.knownMaxTokens;
			}
			return {
				ctx: String(exactCtx !== void 0 ? exactCtx : tierCtx !== void 0 ? tierCtx : 131072),
				max: String(exactMax !== void 0 ? exactMax : tierMax !== void 0 ? tierMax : 8192)
			};
		}
		function parsePositiveInt(raw) {
			if (raw === void 0 || raw === null) return void 0;
			var trimmed = String(raw).trim();
			if (trimmed === "") return void 0;
			var num = Number(trimmed);
			if (!isFinite(num) || Math.floor(num) !== num || num <= 0) return void 0;
			return num;
		}
		/** 编辑器初始行：当前生效的目录模型 + 目录里该 provider 的全部模型 + 路由声明过的模型。 */
		/** 导出供离线测试钉住初始勾选语义（跟随目录勾目录快照 / 自定义清单只勾声明条目）。 */
		/**
		* 思考档位（用户批注：编辑器/添加表单要能自定义档位，不用手写 yaml）。
		*
		* 官方 resolver（dsh-llm-pi-ai 的 THINKING_LEVELS）定义了 7 个**规范档位**，声明键只能从这里选；
		* 协议差异由「线值」吸收——线值 = 该档实际发给网关的字符串（pi-ai 数据里绝大多数是恒等映射，
		* 例外如 off→"none"、min→low 这类重命名；README 明文支持 max: ultra）。声明 reasoningEfforts
		* dict 时官方校验四条：键 ⊆ 规范档位；值 = 非空线值字符串或 null（null 仅 off 合法 = 不发送参数）；
		* 至少一个非 off 档；空对象拒绝。下面的解析/预填/序列化照这四条来。
		*/
		var EFFORT_LEVELS = [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		];
		/** 目录外模型没有任何线索可循时的兜底阶梯（OpenAI 兼容最通用；用户称「全局档位」）。 */
		var DEFAULT_EFFORT_LADDER = [
			"low",
			"medium",
			"high"
		];
		/**
		* 内置家族档位表（用户批注：多收集模型系标准，内置判断）——从 pi-ai 全目录 1000+ 模型的
		* thinkingLevelMap 按模型系聚合取众数（2026-09 快照）：deepseek/glm/zai = low/high/max、
		* claude = xhigh/max、grok = low/medium/high/xhigh、qwen = low/medium/xhigh、gpt/o 系 = 低中高(+xhigh)、
		* gemini = low/medium/high。匹配 = 模型 id 小写前缀；都不命中回 DEFAULT_EFFORT_LADDER。
		*/
		var EFFORT_FAMILY_LADDERS = [
			["deepseek", [
				"low",
				"high",
				"max"
			]],
			["glm", [
				"low",
				"high",
				"max"
			]],
			["zai", [
				"low",
				"high",
				"max"
			]],
			["kimi", [
				"low",
				"high",
				"max"
			]],
			["claude", ["xhigh", "max"]],
			["grok", [
				"low",
				"medium",
				"high",
				"xhigh"
			]],
			["qwen", [
				"low",
				"medium",
				"xhigh"
			]],
			["gemini", [
				"low",
				"medium",
				"high"
			]],
			["gpt", [
				"low",
				"medium",
				"high",
				"xhigh"
			]],
			["o1", [
				"low",
				"medium",
				"high"
			]],
			["o3", [
				"low",
				"medium",
				"high"
			]],
			["o4", [
				"low",
				"medium",
				"high"
			]]
		];
		/**
		* 读声明原文里的 reasoningEfforts 为草稿（规范档 → 线值；off 的 '' = 不发送参数）。
		* 未知键不进草稿（保存时从声明原文原样带回）；`false` / 非对象 / 空对象都算「没声明」。
		*/
		function effortsDraftOf(entry) {
			if (entry === void 0 || entry === null) return void 0;
			var raw = entry["reasoningEfforts"];
			if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return void 0;
			var out = {};
			var has = false;
			for (var level in raw) {
				if (EFFORT_LEVELS.indexOf(level) === -1) continue;
				var wire = raw[level];
				if (typeof wire === "string" && wire !== "") {
					out[level] = wire;
					has = true;
				} else if (wire === null && level === "off") {
					out[level] = "";
					has = true;
				}
			}
			return has ? out : void 0;
		}
		/**
		* 档位预填（用户选型：兄弟模型优先）——声明原文 > 同 provider 目录/适配器兄弟模型的
		* 众数档位表 > 内置家族档位表（按模型 id 前缀）> 默认 low/medium/high。
		* off 恒预填「不发送参数」（resolver 认可的关思考语义）。
		*/
		function prefillEffortsOf(entry, details, providerId, modelId) {
			var fromEntry = effortsDraftOf(entry);
			if (fromEntry !== void 0) return fromEntry;
			var counts = {};
			var own = detailsOfProvider(details, providerId);
			for (var i = 0; i < own.length; i += 1) {
				var detail = own[i];
				if (detail.source === "declared") continue;
				var levels = detail.thinkingLevels;
				if (!Array.isArray(levels) || levels.length === 0) continue;
				var ordered = levels.slice().sort(function(a, b) {
					return EFFORT_LEVELS.indexOf(a) - EFFORT_LEVELS.indexOf(b);
				});
				var sig = ordered.join(",");
				counts[sig] = counts[sig] || {
					count: 0,
					levels: ordered
				};
				counts[sig].count += 1;
			}
			var best;
			var bestCount = 0;
			for (var sig2 in counts) if (counts[sig2].count > bestCount) {
				bestCount = counts[sig2].count;
				best = counts[sig2].levels;
			}
			if (best === void 0 && modelId !== void 0) {
				var lowered = modelId.toLowerCase();
				for (var f = 0; f < EFFORT_FAMILY_LADDERS.length; f += 1) if (lowered.indexOf(EFFORT_FAMILY_LADDERS[f][0]) === 0) {
					best = EFFORT_FAMILY_LADDERS[f][1];
					break;
				}
			}
			var ladder = best !== void 0 ? best : DEFAULT_EFFORT_LADDER;
			var out = {};
			for (var j = 0; j < ladder.length; j += 1) {
				var level = ladder[j];
				if (EFFORT_LEVELS.indexOf(level) === -1) continue;
				out[level] = level === "off" ? "" : level;
			}
			return out;
		}
		/**
		* 草稿 + 声明原文（未知键原样带回）→ 官方 resolver 认的 reasoningEfforts dict。
		* 校验失败返回 error 文案（与官方四条一致：键规范、非 off 线值必填、≥1 非 off 档）。
		*/
		function effortsToDeclared(draft, declared) {
			var out = {};
			var raw = declared === void 0 || declared === null ? void 0 : declared["reasoningEfforts"];
			if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
				for (var k in raw) if (EFFORT_LEVELS.indexOf(k) === -1) out[k] = raw[k];
			}
			var nonOff = false;
			for (var i = 0; i < EFFORT_LEVELS.length; i += 1) {
				var level = EFFORT_LEVELS[i];
				var wire = draft[level];
				if (wire === void 0) continue;
				if (level === "off" && wire === "") {
					out[level] = null;
					continue;
				}
				if (typeof wire !== "string" || wire.trim() === "") return {
					value: out,
					error: "档位「" + level + "」的线值不能为空（只有 off 留空才表示不发送参数）"
				};
				out[level] = wire.trim();
				if (level !== "off") nonOff = true;
			}
			if (!nonOff) return {
				value: out,
				error: "至少要提供一个思考档位（off 只表示「关闭思考」，不能单独作为档位表）"
			};
			return {
				value: out,
				error: void 0
			};
		}
		/**
		* 给定行列表 → settings 的 models 数组（模块级纯函数，供组件与单测共用）。
		*
		* 清单做「新增 / 移除 / 行内编辑」：
		*   声明过的条目 —— 以声明原文为底；行内编辑过的参数（显示名/上下文/最大输出/能力）
		*     覆盖回条目，其余手写字段（reasoningEfforts / compat）原样保留；
		*   目录收录的条目 —— 只写 {id}（参数以上游目录为准）；
		*   自定义条目（目录里没有）—— 上下文 / 最大输出必填，能力开关写进 input 模态。
		*
		* @param ctx   组件上下文：元数据索引（预填用）与 provider 路由 id。
		* @param fail  校验失败时的报错出口（组件里是 setError）；返回 undefined 表示放弃保存。
		*/
		function payloadFromRows(list, ctx, fail) {
			var failExit = function(message) {
				fail(message);
			};
			var out = [];
			for (var i = 0; i < list.length; i += 1) {
				var row = list[i];
				if (row.enabled !== true) continue;
				if (row.declared !== void 0) {
					var declared = {
						...row.declared,
						id: row.id
					};
					if (row.edited === true) {
						var name = typeof row.name === "string" ? row.name.trim() : "";
						if (name !== "" && name !== row.id) declared.name = name;
						var ctxRaw = row.contextWindow.trim();
						if (ctxRaw !== "") {
							var ctxVal = parsePositiveInt(ctxRaw);
							if (ctxVal === void 0) return failExit("「" + row.id + "」的上下文窗口要填正整数");
							declared.contextWindow = ctxVal;
						}
						var maxRaw = row.maxTokens.trim();
						if (maxRaw !== "") {
							var maxVal = parsePositiveInt(maxRaw);
							if (maxVal === void 0) return failExit("「" + row.id + "」的最大输出要填正整数");
							declared.maxTokens = maxVal;
						}
						var modalities = Array.isArray(declared.input) ? declared.input.filter(function(x) {
							return x !== "image" && x !== "video";
						}) : ["text"];
						if (modalities.indexOf("text") === -1) modalities.unshift("text");
						if (row.vision === true && modalities.indexOf("image") === -1) modalities.push("image");
						if (row.vision !== true) modalities = modalities.filter(function(x) {
							return x !== "image";
						});
						if (row.video === true && modalities.indexOf("video") === -1) modalities.push("video");
						if (row.video !== true) modalities = modalities.filter(function(x) {
							return x !== "video";
						});
						declared.input = modalities;
						if (row.reasoning !== void 0) {
							declared.reasoning = row.reasoning === true;
							if (row.reasoning === true) {
								var effortDraft = row.effortsDraft !== void 0 ? row.effortsDraft : effortsDraftOf(row.declared);
								if (effortDraft === void 0 && row.inPiAi !== true) effortDraft = prefillEffortsOf(row.declared, ctx.details, ctx.providerId, row.id);
								if (effortDraft !== void 0) {
									var effortOut = effortsToDeclared(effortDraft, row.declared);
									if (effortOut.error !== void 0) return failExit("「" + row.id + "」" + effortOut.error);
									declared.reasoningEfforts = effortOut.value;
								}
							} else declared.reasoningEfforts = false;
						}
					}
					if (declared.reasoning === true && declared.reasoningEfforts === void 0 && row.inPiAi !== true) {
						var repairDraft = row.effortsDraft !== void 0 ? row.effortsDraft : effortsDraftOf(row.declared);
						if (repairDraft === void 0) repairDraft = prefillEffortsOf(row.declared, ctx.details, ctx.providerId, row.id);
						var repairOut = effortsToDeclared(repairDraft, row.declared);
						if (repairOut.error !== void 0) return failExit("「" + row.id + "」" + repairOut.error);
						declared.reasoningEfforts = repairOut.value;
					}
					out.push(declared);
					continue;
				}
				if (row.known === true) {
					out.push({ id: row.id });
					continue;
				}
				var ctxText = row.contextWindow.trim();
				if (ctxText === "") return failExit("自定义模型「" + row.id + "」要填上下文窗口");
				var ctxNum = Number(ctxText);
				if (!isFinite(ctxNum) || Math.floor(ctxNum) !== ctxNum || ctxNum <= 0) return failExit("「" + row.id + "」的上下文窗口要填正整数");
				var max = row.maxTokens.trim();
				if (max === "") return failExit("自定义模型「" + row.id + "」要填最大输出");
				var maxNum = Number(max);
				if (!isFinite(maxNum) || Math.floor(maxNum) !== maxNum || maxNum <= 0) return failExit("「" + row.id + "」的最大输出要填正整数");
				var input = ["text"];
				if (row.vision === true) input.push("image");
				var entry = { id: row.id };
				if (typeof row.name === "string" && row.name !== "" && row.name !== row.id) entry.name = row.name;
				entry.contextWindow = ctxNum;
				entry.maxTokens = maxNum;
				entry.input = input;
				if (row.reasoning === true) {
					entry.reasoning = true;
					var customEffort = effortsToDeclared(row.effortsDraft !== void 0 ? row.effortsDraft : prefillEffortsOf(void 0, ctx.details, ctx.providerId, row.id), void 0);
					if (customEffort.error !== void 0) return failExit("「" + row.id + "」" + customEffort.error);
					entry.reasoningEfforts = customEffort.value;
				}
				out.push(entry);
			}
			if (out.length === 0) return failExit("至少要勾选一个模型（全部不勾的清单无法保存）");
			return out;
		}
		function buildEditRows(account, catalog, details) {
			var declared = Array.isArray(account.models) ? account.models : [];
			var followingCatalog = declared.length === 0;
			var rows = [];
			var seen = {};
			function add(id, name, detail, entry, inCatalog) {
				if (id === "" || seen[id] === true) return;
				seen[id] = true;
				var declaredInput = entry !== void 0 && Array.isArray(entry.input) ? entry.input : [];
				rows.push({
					id,
					name,
					enabled: entry !== void 0 ? true : followingCatalog ? inCatalog : declared.some(function(item) {
						return item.id === id;
					}),
					contextWindow: entry !== void 0 && entry.contextWindow !== void 0 ? String(entry.contextWindow) : "",
					maxTokens: entry !== void 0 && entry.maxTokens !== void 0 ? String(entry.maxTokens) : "",
					vision: detail !== void 0 ? detail.vision === true : declaredInput.indexOf("image") !== -1,
					video: detail !== void 0 ? detail.video === true : declaredInput.indexOf("video") !== -1,
					known: detail !== void 0,
					inPiAi: detail !== void 0 && detail.source === "pi-ai",
					knownContextWindow: detail === void 0 ? void 0 : detail.contextWindow,
					knownMaxTokens: detail === void 0 ? void 0 : detail.maxTokens,
					knownReasoning: detail !== void 0 && detail.reasoning === true,
					reasoning: entry !== void 0 && entry.reasoning !== void 0 ? entry.reasoning === true : void 0,
					originVision: detail !== void 0 ? detail.vision === true : declaredInput.indexOf("image") !== -1,
					originVideo: detail !== void 0 ? detail.video === true : declaredInput.indexOf("video") !== -1,
					declared: entry,
					effortsDraft: effortsDraftOf(entry)
				});
			}
			for (var d = 0; d < declared.length; d += 1) {
				var entry = declared[d];
				if (entry === null || typeof entry !== "object") continue;
				var entryId = typeof entry.id === "string" ? entry.id : "";
				if (entryId === "") continue;
				var entryDetail = lookupDetail(details, account.id, entryId);
				add(entryId, entry.name !== void 0 ? String(entry.name) : entryDetail !== void 0 && entryDetail.name !== void 0 ? entryDetail.name : entryId, entryDetail, entry, false);
			}
			for (var c = 0; c < catalog.length; c += 1) {
				var model = catalog[c];
				add(model.id, model.name, lookupDetail(details, account.id, model.id), void 0, true);
			}
			var own = detailsOfProvider(details, account.id);
			for (var o = 0; o < own.length; o += 1) {
				if (typeof own[o].id !== "string") continue;
				add(own[o].id, own[o].name === void 0 ? String(own[o].id) : String(own[o].name), own[o], void 0, false);
			}
			return rows;
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
		function ModelListEditor(props) {
			var account = props.account;
			var rowsState = react.default.useState(function() {
				return buildEditRows(account, props.catalog, props.details);
			});
			var rows = rowsState[0];
			var setRows = rowsState[1];
			var busyState = react.default.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var errorState = react.default.useState(null);
			var error = errorState[0];
			var setError = errorState[1];
			var enabledCount = rows.filter(function(r) {
				return r.enabled === true;
			}).length;
			var testModelState = react.default.useState({
				phase: "idle",
				message: ""
			});
			var testModel = testModelState[0];
			var setTestModel = testModelState[1];
			var formState = react.default.useState(function() {
				return {
					open: false,
					id: "",
					name: "",
					ctx: "",
					max: "",
					vision: false,
					video: false,
					reasoning: false
				};
			});
			var form = formState[0];
			var setForm = formState[1];
			var emptyForm = function() {
				return {
					open: false,
					id: "",
					name: "",
					ctx: "",
					max: "",
					vision: false,
					video: false,
					reasoning: false
				};
			};
			function patch(id, next) {
				setRows(function(prev) {
					return prev.map(function(row) {
						return row.id === id ? withKeys(row, next) : row;
					});
				});
			}
			function remove(id) {
				setRows(function(prev) {
					return prev.filter(function(row) {
						return row.id !== id;
					});
				});
			}
			/** 表单「添加」：校验通过就追加一行自定义条目（默认勾上，保存后才生效）。
			*  上下文/最大输出留空 = 自动按清单里已知模型的最大值填默认（没有已知值则回退保守值），
			*  填进行里随时可改；填了但不是正整数才拦。 */
			function addFromForm() {
				var id = form.id.trim();
				if (id === "") {
					setError("先填模型 ID");
					return;
				}
				var exists = false;
				for (var i = 0; i < rows.length; i += 1) if (rows[i].id === id) exists = true;
				if (exists) {
					setError("「" + id + "」已经在清单里了");
					return;
				}
				if (lookupDetail(props.details, account.id, id) !== void 0) {
					setError("「" + id + "」已在 pi-ai 目录里，直接在清单里勾选即可");
					return;
				}
				var defaults = resolveAddDefaults(rows, id, props.details);
				var ctxRaw = form.ctx.trim() === "" ? defaults.ctx : form.ctx.trim();
				var maxRaw = form.max.trim() === "" ? defaults.max : form.max.trim();
				var ctxNum = Number(ctxRaw);
				if (!isFinite(ctxNum) || Math.floor(ctxNum) !== ctxNum || ctxNum <= 0) {
					setError("上下文窗口要填正整数");
					return;
				}
				var maxNum = Number(maxRaw);
				if (!isFinite(maxNum) || Math.floor(maxNum) !== maxNum || maxNum <= 0) {
					setError("最大输出要填正整数");
					return;
				}
				var name = form.name.trim();
				setRows(function(prev) {
					return prev.concat([{
						id,
						name: name !== "" ? name : id,
						enabled: true,
						contextWindow: String(ctxNum),
						maxTokens: String(maxNum),
						vision: form.vision === true,
						video: form.video === true,
						known: false,
						inPiAi: false,
						knownContextWindow: void 0,
						knownMaxTokens: void 0,
						knownReasoning: false,
						originVision: form.vision === true,
						originVideo: form.video === true,
						declared: void 0,
						added: true,
						reasoning: form.reasoning === true
					}]);
				});
				setForm(emptyForm);
				setError(null);
			}
			/**
			* 「测试」：像添加供应商的测试一样，保存前先验证端点真的在供这个模型。
			* 走插件宿主的 /provider/test-model——宿主用凭据仓库里的 key 请求端点的模型清单，
			* key 不出宿主；浏览器只拿到「端点共 N 个模型，含不含这个 id」。
			*/
			function testAddModel() {
				var id = form.id.trim();
				if (id === "") {
					setError("先填模型 ID");
					return;
				}
				testModelConn(id, setTestModel);
			}
			/**
			* 「测试」的公共实现：走插件宿主的 /provider/test-model——宿主用凭据仓库里的 key
			* 向这个模型 id 真发一条 1 token 的最小对话请求（实连验证，不是查清单），
			* key 不出宿主；浏览器拿到「通没通 + 耗时」或 HTTP 状态与响应片段。
			* 添加模型表单与行内编辑面板共用（回调各自落自己的状态）。
			*/
			function testModelConn(id, set) {
				set({
					phase: "run",
					message: t("prov.testing")
				});
				scrollTestResultIntoView();
				postJson("/provider/test-model", {
					providerId: account.id,
					modelId: id
				}).then(function(res) {
					if (res === null || res === void 0 || res.ok !== true) {
						set({
							phase: "fail",
							message: "✗ " + String(res && res.error || "未知错误")
						});
						scrollTestResultIntoView();
						return;
					}
					if (res.mode === "list") {
						set({
							phase: res.served === true ? "ok" : "fail",
							message: (res.served === true ? "✓ " : "✗ ") + tf(res.served === true ? "prov.listYes" : "prov.listNo", {
								total: String(res.total ?? ""),
								id
							})
						});
						scrollTestResultIntoView();
						return;
					}
					set({
						phase: "ok",
						message: "✓ " + tf("prov.pingOk", { id }) + (typeof res.latencyMs === "number" ? " · " + String(res.latencyMs) + "ms" : "")
					});
					scrollTestResultIntoView();
				}).catch(function(cause) {
					set({
						phase: "fail",
						message: "✗ " + String(cause && cause.message ? cause.message : cause)
					});
					scrollTestResultIntoView();
				});
			}
			/**
			* 测试结果渲染在编辑面板最底部，模型清单容器有滚动条——结果一出就把这行
			* 滚进可视区（block:'nearest' 只滚必要的距离），不用再手动拖滚动条。
			* 状态更新后 DOM 才有这行，所以等一帧再找。
			*/
			function scrollTestResultIntoView() {
				setTimeout(function() {
					var el = document.querySelector(".pv_meTestLine");
					if (el !== null && el !== void 0 && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
				}, 80);
			}
			/**
			* 给定行列表 → settings 的 models 数组；形状不合法时返回 undefined 并写好错误提示。
			* 清单做「新增 / 移除 / 行内编辑」：声明过的条目以声明原文为底（行内编辑过的参数覆盖回条目，
			* 其余手写字段（reasoningEfforts / compat）原样保留）；目录收录的条目只写 {id}；
			* 自定义条目上下文 / 最大输出必填。纯逻辑在模块级 {@link payloadFromRows}（可单测），
			* 这里只注入本组件上下文。
			*/
			function payloadFrom(list) {
				return payloadFromRows(list, {
					details: props.details,
					providerId: account.id
				}, setError);
			}
			function payload() {
				return payloadFrom(rows);
			}
			/**
			* 勾选 / 取消只改草稿：点「保存」时把「勾选后的清单」一次性写进 settings.yaml。
			* （曾经做过「勾选即时落盘」，用户要求改回草稿制——见「保存」按钮。）
			*/
			function toggleDraft(row, checked) {
				if (busy === true) return;
				setRows(function(prev) {
					return prev.map(function(r) {
						return r.id === row.id ? withKeys(r, { enabled: checked }) : r;
					});
				});
			}
			/** 一键全选 / 全不选（表头复选框）。 */
			function toggleAll(enabled) {
				if (busy === true) return;
				setRows(function(prev) {
					return prev.map(function(r) {
						return r.enabled === enabled ? r : withKeys(r, { enabled });
					});
				});
			}
			function submit(models, done) {
				setBusy(true);
				setError(null);
				postJson("/provider/set-models", {
					providerId: account.id,
					models
				}).then(function(res) {
					if (res === null || res === void 0 || res.ok !== true) {
						setError("保存失败：" + String(res && res.error || "未知错误"));
						return;
					}
					props.onSaved(done, models);
					props.onClose();
				}).catch(function(cause) {
					setError("保存失败：" + String(cause && cause.message ? cause.message : cause));
				}).then(function() {
					setBusy(false);
				});
			}
			/** 行内编辑：点击「目录外」模型的 ID 展开，一次只展开一行（编辑只改草稿，保存才落盘）。 */
			var editIdState = react.default.useState(null);
			var editId = editIdState[0];
			var setEditId = editIdState[1];
			var panelTestState = react.default.useState({
				phase: "idle",
				message: ""
			});
			var panelTest = panelTestState[0];
			var setPanelTest = panelTestState[1];
			/** 行内编辑面板：目录外条目的参数编辑（显示名 / 上下文 / 最大输出 / 能力）。改动只进草稿。 */
			/**
			* 思考档位 chips（行内面板用）：7 个规范档，一行多个自动换行（用户批注：不要别名输入、
			* 不要注释文字）。勾选 = 提供该档（线值恒等写入）；off = 关闭思考（线值 null = 不发送参数）。
			*/
			function effortPoolChips(draft, onDraft) {
				var chips = [];
				for (var i = 0; i < EFFORT_LEVELS.length; i += 1) {
					var level = EFFORT_LEVELS[i];
					var selected = draft[level] !== void 0;
					chips.push(react.default.createElement("label", {
						key: level,
						className: "pv_meCap pv_meEffChip" + (selected ? " pv_meEffOn" : " pv_capOff"),
						title: level === "off" ? "关闭思考：请求不带思考参数" : "提供「" + level + "」思考档"
					}, react.default.createElement("input", {
						type: "checkbox",
						checked: selected,
						onChange: (function(level) {
							return function(event) {
								var next = { ...draft };
								if (event.target.checked === true) next[level] = level === "off" ? "" : level;
								else delete next[level];
								onDraft(next);
							};
						})(level)
					}), level));
				}
				return chips;
			}
			function rowEditPanel(row) {
				function panelField(label, value, onInput, key, placeholder) {
					return react.default.createElement("div", {
						className: "pv_line pv_row",
						key
					}, react.default.createElement("span", null, label), react.default.createElement("input", {
						className: "pv_field",
						type: "text",
						value,
						placeholder,
						onChange: function(event) {
							onInput(event.target.value);
						}
					}));
				}
				function capToggle(labelText, field, on, tip, onClass) {
					return react.default.createElement("label", {
						key: field,
						className: "pv_meCap" + (on ? " " + onClass : " pv_capOff"),
						title: tip
					}, react.default.createElement("input", {
						type: "checkbox",
						checked: on,
						onChange: function(event) {
							patch(row.id, {
								[field]: event.target.checked === true,
								edited: true
							});
						}
					}), labelText);
				}
				return react.default.createElement("div", {
					className: "pv_meEditPanel",
					key: "panel-" + row.id
				}, react.default.createElement("div", { className: "pv_meFormTitle" }, "编辑模型参数（只改草稿，点「保存」落盘）"), panelField("模型 ID", row.id, function(next) {
					var trimmed = next.trim();
					if (trimmed === "" || trimmed === row.id) return;
					if (rows.some(function(other) {
						return other !== row && other.id === trimmed;
					})) {
						setPanelTest({
							phase: "fail",
							message: "✗ 模型 ID「" + trimmed + "」已存在（含目录内条目），换个名字"
						});
						return;
					}
					patch(row.id, {
						id: trimmed,
						edited: true
					});
					setEditId(trimmed);
				}, "p-id"), panelField("显示名", row.name !== row.id ? row.name : "", function(next) {
					var trimmed = next.trim();
					patch(row.id, {
						name: trimmed !== "" ? trimmed : row.id,
						edited: true
					});
				}, "p-name", "留空则同模型 ID"), panelField("上下文窗口", row.contextWindow, function(next) {
					patch(row.id, {
						contextWindow: next,
						edited: true
					});
				}, "p-ctx", "如 1000000"), panelField("最大输出", row.maxTokens, function(next) {
					patch(row.id, {
						maxTokens: next,
						edited: true
					});
				}, "p-max", "如 384000"), react.default.createElement("div", {
					className: "pv_line pv_row",
					key: "p-caps"
				}, react.default.createElement("span", null, "能力"), react.default.createElement("span", { className: "pv_mePanelCaps" }, capToggle("视觉", "vision", row.vision === true, "支持图片输入（写进模型的 input 模态）", "pv_capVision"), react.default.createElement("label", {
					className: "pv_meCap" + (row.reasoning === true || row.knownReasoning === true ? " pv_capReason" : " pv_capOff"),
					title: "支持思维链；勾选后可自定义思考档位（写进声明条目的 reasoningEfforts）"
				}, react.default.createElement("input", {
					type: "checkbox",
					checked: row.reasoning === true || row.knownReasoning === true,
					onChange: function(event) {
						var checked = event.target.checked === true;
						var nextPatch = {
							reasoning: checked,
							edited: true
						};
						if (checked === true && row.effortsDraft === void 0) nextPatch.effortsDraft = prefillEffortsOf(row.declared, props.details, account.id, row.id);
						patch(row.id, nextPatch);
					}
				}), "推理"))), row.reasoning === true || row.knownReasoning === true ? react.default.createElement("div", {
					className: "pv_line pv_row",
					key: "p-eff"
				}, react.default.createElement("span", { title: "reasoningEfforts：写入声明条目的思考档位表；off = 关闭思考（不发送参数）；至少勾一个非 off 档位" }, "思考档位"), react.default.createElement("div", { className: "pv_meEffPool" }, effortPoolChips(row.effortsDraft ?? prefillEffortsOf(row.declared, props.details, account.id, row.id), function(next) {
					patch(row.id, {
						effortsDraft: next,
						edited: true
					});
				}))) : null, react.default.createElement("div", {
					className: "pv_meActs",
					key: "p-acts"
				}, react.default.createElement("button", {
					type: "button",
					className: "pv_action",
					style: { marginLeft: "0" },
					disabled: busy || panelTest.phase === "run",
					title: "实连验证：用凭据仓库里的 key 向这个模型发一条 1 token 的最小请求（key 不出宿主）",
					onClick: function() {
						testModelConn(row.id, setPanelTest);
					}
				}, panelTest.phase === "run" ? "测试中…" : "测试"), react.default.createElement("button", {
					type: "button",
					className: "pv_action",
					style: { marginLeft: "0" },
					onClick: function() {
						setEditId(null);
						setPanelTest({
							phase: "idle",
							message: ""
						});
					}
				}, "完成")), panelTest.message === "" ? null : react.default.createElement("div", {
					className: "pv_line pv_meTestLine" + (panelTest.phase === "fail" ? " plan_badText" : ""),
					key: "p-test"
				}, panelTest.message));
			}
			var rows_ = [];
			for (var r = 0; r < rows.length; r += 1) {
				var rowItem = rows[r];
				rows_.push(modelEditRow(rowItem, patch, remove, toggleDraft, busy, editId === rowItem.id, function(id) {
					setEditId(function(prev) {
						return prev === id ? null : id;
					});
					setPanelTest({
						phase: "idle",
						message: ""
					});
				}));
				if (editId === rowItem.id && rowItem.inPiAi !== true) rows_.push(rowEditPanel(rowItem));
			}
			var allEnabled = rows.length > 0;
			for (var ar = 0; ar < rows.length; ar += 1) if (rows[ar].enabled !== true) {
				allEnabled = false;
				break;
			}
			var colHead = react.default.createElement("div", {
				className: "pv_meHeadRow",
				key: "colhead"
			}, react.default.createElement("span", { key: "h-check" }, react.default.createElement("input", {
				type: "checkbox",
				className: "pv_meCheck",
				checked: allEnabled,
				disabled: busy,
				title: allEnabled ? "全不选" : "全选",
				onChange: function() {
					toggleAll(allEnabled !== true);
				}
			})), react.default.createElement("span", {
				key: "h-id",
				style: { fontFamily: "inherit" }
			}, t("prov.modelId")), react.default.createElement("span", { key: "h-caps" }, t("prov.caps")), react.default.createElement("span", { key: "h-ctx" }, t("prov.ctx")), react.default.createElement("span", { key: "h-max" }, t("cap.maxTokens")), react.default.createElement("span", { key: "h-del" }));
			function formRow(label, control, key) {
				return react.default.createElement("div", {
					className: "pv_line pv_row",
					key
				}, react.default.createElement("span", null, label), control);
			}
			function formField(placeholder, value, key, numeric) {
				return react.default.createElement("input", {
					className: "pv_field",
					type: "text",
					inputMode: numeric === true ? "numeric" : "text",
					placeholder,
					value,
					onChange: function(event) {
						var next = event.target.value;
						setForm(function(prev) {
							return withKeys(prev, { [key]: next });
						});
					}
				});
			}
			var formEl = form.open !== true ? null : react.default.createElement("div", { className: "pv_meForm" }, react.default.createElement("div", { className: "pv_meFormTitle" }, "新增自定义模型（保存后才生效）"), formRow("模型 ID", formField("目录里没有的自定义 ID", form.id, "id"), "f-id"), formRow("显示名", formField("留空则同模型 ID", form.name, "name"), "f-name"), formRow("上下文窗口", formField("留空自动按已知模型填", form.ctx, "ctx", true), "f-ctx"), formRow("最大输出", formField("留空自动按已知模型填", form.max, "max", true), "f-max"), react.default.createElement("div", {
				className: "pv_line pv_row",
				key: "f-caps"
			}, react.default.createElement("span", null, "能力"), react.default.createElement("span", { className: "pv_meFormCaps" }, react.default.createElement("label", {
				className: "pv_meCap" + (form.vision ? " pv_capVision" : " pv_capOff"),
				title: "声明支持图片输入（写进模型的 input 模态）"
			}, react.default.createElement("input", {
				type: "checkbox",
				checked: form.vision,
				onChange: function(event) {
					var next = event.target.checked === true;
					setForm(function(prev) {
						return withKeys(prev, { vision: next });
					});
				}
			}), "视觉"), react.default.createElement("label", {
				className: "pv_meCap" + (form.reasoning ? " pv_capReason" : " pv_capOff"),
				title: "声明支持思维链；保存后在行内编辑面板可自定义思考档位（reasoningEfforts）"
			}, react.default.createElement("input", {
				type: "checkbox",
				checked: form.reasoning,
				onChange: function(event) {
					var next = event.target.checked === true;
					setForm(function(prev) {
						return withKeys(prev, { reasoning: next });
					});
				}
			}), "推理"))), react.default.createElement("div", {
				className: "pv_actRow",
				key: "f-acts"
			}, react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "0" },
				disabled: busy,
				onClick: addFromForm
			}, "添加"), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "0" },
				disabled: busy || testModel.phase === "run",
				title: "验证端点真的在供这个模型（用凭据仓库里的 key 请求端点的模型清单，key 不出宿主）",
				onClick: testAddModel
			}, testModel.phase === "run" ? "测试中…" : "测试"), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "auto" },
				disabled: busy,
				onClick: function() {
					setForm(emptyForm);
					setTestModel({
						phase: "idle",
						message: ""
					});
				}
			}, "取消")), testModel.message === "" ? null : react.default.createElement("div", {
				className: "pv_line",
				key: "f-test"
			}, testModel.message));
			return react.default.createElement("div", { className: "pv_me" }, react.default.createElement("div", { className: "pv_hint" }, "当前已添加" + String(enabledCount) + "个模型"), react.default.createElement("div", { className: "pv_meList" }, [colHead].concat(rows_)), react.default.createElement("div", { className: "pv_meActs" }, react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "0" },
				disabled: busy,
				title: "新增目录里没有的自定义模型：填 ID / 上下文 / 最大输出等参数",
				onClick: function() {
					setError(null);
					setForm(function(prev) {
						return withKeys(prev, { open: true });
					});
				}
			}, "添加模型"), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "auto" },
				disabled: busy,
				title: "把草稿里的勾选与增删一次性写入 settings.yaml",
				onClick: function() {
					setError(null);
					var models = payload();
					if (models === void 0) return;
					submit(models, "✓ " + shortName(account) + " 的模型清单已保存（" + String(models.length) + " 个）");
				}
			}, busy ? "保存中…" : "保存")), formEl, error === null ? null : react.default.createElement("div", { className: "plan_note plan_badText" }, error));
		}
		/**
		* 删除 provider 的确认弹层（本地版新增，实现 issue #3）。
		*
		* 上游第一版是在 ✕ 旁边原地摊开「确认删除 / 取消」两个小按钮：位置就是刚点过的那个槽位，
		* 代价（清掉哪条配置、哪把密钥、影响谁）一句没说，误点一次就等于把一整家供应商拆掉。
		* 这里改成遮罩弹层：把要清的东西逐条列出来，危险按钮单独一个色，取消是默认落点。
		*/
		function DeleteProviderModal(props) {
			var account = props.account;
			var modelCount = Array.isArray(account.models) ? account.models.length : 0;
			var keyRef = typeof account.apiKeyEnv === "string" && account.apiKeyEnv !== "" ? String(account.apiKeyEnv) : void 0;
			var facts = [
				{
					key: "id",
					label: "路由 ID",
					value: String(account.id)
				},
				{
					key: "cfg",
					label: "删除的配置",
					value: "settings.yaml → llm-pi-ai.providers." + String(account.id) + "（baseURL / 协议" + (modelCount > 0 ? " / 模型清单 " + String(modelCount) + " 个" : "") + " 一并删除）"
				},
				{
					key: "key",
					label: "删除的密钥",
					value: keyRef === void 0 ? "这条路由没有绑定凭据名" : keyRef + "（凭据仓库里的值一起清掉）"
				},
				{
					key: "impact",
					label: "影响",
					value: "模型选择器里这家会消失；正在用 " + shortName(account) + " 的会话下次落到默认模型"
				}
			];
			var rows = [];
			for (var i = 0; i < facts.length; i += 1) rows.push(react.default.createElement("div", {
				className: "pv_modalRow",
				key: facts[i].key
			}, react.default.createElement("span", { className: "pv_modalLabel" }, facts[i].label), react.default.createElement("span", { className: "pv_modalValue" }, facts[i].value)));
			return react.default.createElement("div", {
				className: "pv_mask",
				onClick: function() {
					if (props.busy !== true) props.onCancel();
				}
			}, react.default.createElement("div", {
				className: "pv_modal",
				onClick: function(event) {
					if (typeof event.stopPropagation === "function") event.stopPropagation();
				}
			}, react.default.createElement("div", { className: "pv_modalTitle" }, "删除 provider：" + shortName(account) + "？"), rows, react.default.createElement("div", { className: "pv_modalWarn" }, "删除后需要重新填一遍密钥与端点才能恢复，不能撤销。"), props.error === null ? null : react.default.createElement("div", { className: "plan_note plan_badText" }, props.error), react.default.createElement("div", { className: "pv_modalActs" }, react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				style: { marginLeft: "0" },
				disabled: props.busy,
				onClick: props.onCancel
			}, t("prov.cancel")), react.default.createElement("button", {
				type: "button",
				className: "pv_action",
				disabled: props.busy,
				onClick: props.onExport
			}, t("del.exportBtn")), react.default.createElement("button", {
				type: "button",
				className: "pv_delYes pv_dangerBtn",
				disabled: props.busy,
				onClick: props.onConfirm
			}, props.busy === true ? "删除中…" : "删除这条路由"))));
		}
		/**
		* Provider 标签：CC Switch 式卡片。
		* 每个 provider 一张分割明显的卡片，头部一行直给最关键信息（coding plan 的
		* 5小时/订阅余量、API 的余额），点卡片展开看窗口进度与明细；有报警/错误的卡片
		* 默认展开。pi-ai 桥接沉底且默认折叠（次要信息）。
		*/
		function ProviderSettingsSection() {
			var statusState = react.default.useState(null);
			var status = statusState[0];
			var setStatus = statusState[1];
			var planState = react.default.useState(null);
			var plan = planState[0];
			var setPlan = planState[1];
			var noteState = react.default.useState(null);
			var note = noteState[0];
			var setNote = noteState[1];
			var busyState = react.default.useState(false);
			busyState[0];
			busyState[1];
			var tabState = react.default.useState("providers");
			var tab = tabState[0];
			var setTab = tabState[1];
			var groupsState = react.default.useState([]);
			var catalogGroups = groupsState[0];
			var setCatalogGroups = groupsState[1];
			var detailsState = react.default.useState({});
			var detailsById = detailsState[0];
			var setDetailsById = detailsState[1];
			var presetsState = react.default.useState([]);
			var presets = presetsState[0];
			var setPresets = presetsState[1];
			var modelEditorsState = react.default.useState({});
			modelEditorsState[0];
			modelEditorsState[1];
			var editorOpenState = react.default.useState({});
			editorOpenState[0];
			editorOpenState[1];
			var routesState = react.default.useState({});
			var routesById = routesState[0];
			var setRoutesById = routesState[1];
			var catTickState = react.default.useState(0);
			var setCatTick = catTickState[1];
			var delState = react.default.useState(null);
			var delTarget = delState[0];
			var setDelTarget = delState[1];
			var delBusyState = react.default.useState(false);
			var delBusy = delBusyState[0];
			var setDelBusy = delBusyState[1];
			var delErrorState = react.default.useState(null);
			var delError = delErrorState[0];
			var setDelError = delErrorState[1];
			var refreshingState = react.default.useState({});
			var setRefreshing = refreshingState[1];
			var apiSelOpenState = react.default.useState(null);
			var apiSelOpenId = apiSelOpenState[0];
			var setApiSelOpenId = apiSelOpenState[1];
			react.default.useEffect(function() {
				if (apiSelOpenId === null) return void 0;
				function onDown(event) {
					var target = event.target;
					if (target !== null && typeof target === "object" && typeof target.closest === "function" && target.closest(".pv_sel") !== null) return;
					setApiSelOpenId(null);
				}
				function onKey(event) {
					if (event.key === "Escape") setApiSelOpenId(null);
				}
				document.addEventListener("pointerdown", onDown);
				document.addEventListener("keydown", onKey);
				return function() {
					document.removeEventListener("pointerdown", onDown);
					document.removeEventListener("keydown", onKey);
				};
			}, [apiSelOpenId]);
			var planRefreshingState = react.default.useState(false);
			var planRefreshing = planRefreshingState[0];
			var setPlanRefreshing = planRefreshingState[1];
			var keyDraftState = react.default.useState({});
			var keyDrafts = keyDraftState[0];
			var setKeyDrafts = keyDraftState[1];
			var savingKeyState = react.default.useState({});
			var queryCookieDraftState = react.default.useState({});
			var queryCookieDrafts = queryCookieDraftState[0];
			var setQueryCookieDrafts = queryCookieDraftState[1];
			var savingQueryCookieState = react.default.useState({});
			var savingQueryCookie = savingQueryCookieState[0];
			var setSavingQueryCookie = savingQueryCookieState[1];
			var queryCookieOpenIdState = react.default.useState(null);
			var queryCookieOpenId = queryCookieOpenIdState[0];
			var setQueryCookieOpenId = queryCookieOpenIdState[1];
			var savingKey = savingKeyState[0];
			var setSavingKey = savingKeyState[1];
			var editFormsState = react.default.useState({});
			var editForms = editFormsState[0];
			var setEditForms = editFormsState[1];
			var editBusyState = react.default.useState({});
			var editBusy = editBusyState[0];
			var setEditBusy = editBusyState[1];
			var toastState = react.default.useState(null);
			var toast = toastState[0];
			var setToast = toastState[1];
			var toastTimer = null;
			var piAiBusyState = react.default.useState(false);
			var piAiBusy = piAiBusyState[0];
			var setPiAiBusy = piAiBusyState[1];
			var setNowTick = react.default.useState(0)[1];
			react.default.useEffect(function() {
				var timer = setInterval(function() {
					setNowTick(function(n) {
						return n + 1;
					});
				}, 3e4);
				return function() {
					clearInterval(timer);
				};
			}, []);
			react.default.useEffect(function() {
				if (piAiBusy !== true) return;
				var timer = setInterval(function() {
					loadProviderStatus().then(function(payload) {
						setStatus(payload);
						var piAi = payload !== null && payload !== void 0 ? payload.piAi : void 0;
						if ((piAi !== void 0 && piAi !== null && piAi.download !== void 0 && piAi.download !== null) !== true) setPiAiBusy(false);
					}).catch(function() {
						setPiAiBusy(false);
					});
				}, 2e3);
				return function() {
					clearInterval(timer);
				};
			}, [piAiBusy]);
			var openState = react.default.useState({});
			var openMap = openState[0];
			var setOpenMap = openState[1];
			var refresh = react.default.useCallback(function(force) {
				loadProviderStatus().then(function(payload) {
					setStatus(payload);
					var byId = {};
					var list = payload !== null && payload !== void 0 && Array.isArray(payload.routes) ? payload.routes : [];
					for (var i = 0; i < list.length; i += 1) {
						var entry = list[i];
						if (entry !== null && typeof entry === "object" && typeof entry.id === "string") byId[entry.id] = entry;
					}
					setRoutesById(byId);
				}).catch(function() {
					setStatus(statusUnavailable());
				});
				setPlanRefreshing(true);
				loadPlanStatus(force).then(function(payload) {
					setPlan(payload);
					setPlanRefreshing(false);
				}).catch(function(cause) {
					setPlanRefreshing(false);
					setNote(cause && cause.message ? String(cause.message) : String(cause));
				});
			}, []);
			react.default.useEffect(function() {
				return onPlanChange(function(payload) {
					setPlan(payload);
				});
			}, []);
			react.default.useEffect(function() {
				refresh(false);
			}, [refresh]);
			react.default.useEffect(function() {
				var cancelled = false;
				loadModelCatalog().then(function(next) {
					if (!cancelled) setCatalogGroups(next.groups);
				}).catch(function() {});
				return function() {
					cancelled = true;
				};
			}, [catTickState[0]]);
			react.default.useEffect(function() {
				reloadPresets();
			}, []);
			function reloadPresets() {
				getJson("/provider/presets").then(function(payload) {
					if (payload !== null && Array.isArray(payload.presets)) setPresets(payload.presets);
				}).catch(function() {});
			}
			function onProviderAdded(message) {
				refresh(true);
				setCatTick(function(t) {
					return t + 1;
				});
				reloadPresets();
				if (message !== void 0 && message !== "") showToast(message, true);
			}
			function onProviderRemoved(account) {
				dropPlanAccount(account.id);
				setCatTick(function(t) {
					return t + 1;
				});
				reloadPresets();
			}
			react.default.useEffect(function() {
				var cancelled = false;
				loadModelDetailMap().then(function(map) {
					if (!cancelled) setDetailsById(map);
				}).catch(function() {});
				return function() {
					cancelled = true;
				};
			}, []);
			function setRefreshingFlag(id, value) {
				setRefreshing(function(prev) {
					return withKey(prev, id, value);
				});
			}
			function showToast(text, ok) {
				setToast({
					text,
					ok
				});
				if (toastTimer !== null) clearTimeout(toastTimer);
				toastTimer = setTimeout(function() {
					setToast(null);
					toastTimer = null;
				}, 2600);
			}
			function refreshSummary(account) {
				var percent = worstPercent(account);
				if (percent !== void 0) return tf("toast.refreshSummaryPct", { percent });
				if (Array.isArray(account.balances) && account.balances.length > 0) return tf("toast.refreshSummaryBalance", { value: account.balances[0].value });
				return "";
			}
			function refreshAccount(account) {
				setRefreshingFlag(account.id, true);
				postJson("/provider/refresh", { providerId: account.id }).then(function(res) {
					if (res !== null && res !== void 0 && res.account !== void 0) mergePlanAccount(res.account);
					var failure = refreshFailure(res);
					if (failure === void 0) showToast("✓ " + tf("toast.refreshed", { name: shortName(account) }) + refreshSummary(res.account), true);
					else showToast("✗ " + tf("toast.refreshFailed", {
						name: shortName(account),
						reason: failure
					}), false);
				}).catch(function(cause) {
					showToast("✗ " + tf("toast.refreshFailed", {
						name: shortName(account),
						reason: cause && cause.message ? cause.message : cause
					}), false);
				}).then(function() {
					setRefreshingFlag(account.id, false);
				});
			}
			/**
			* 卡片里直接补密钥：路由已经在了（插件自己的 config 就声明了 deepseek），缺的只是凭据。
			* 存进官方同一个凭据仓库（credentials/set，与添加面板同一条 RPC），随后立刻实测一次余量。
			*/
			function saveKey(account) {
				var ref = account.apiKeyEnv === void 0 ? "" : String(account.apiKeyEnv);
				var draft = keyDrafts[account.id];
				var value = draft === void 0 ? "" : String(draft).trim();
				if (ref === "") {
					showToast("✗ " + tf("toast.noCredentialRef", { name: shortName(account) }), false);
					return;
				}
				if (value === "") {
					showToast("✗ " + tf("toast.emptyKey", { name: shortName(account) }), false);
					return;
				}
				setSavingKey(function(prev) {
					return withKey(prev, account.id, true);
				});
				apiCall("credentials/set", {
					ref,
					value
				}).then(function() {
					setKeyDrafts(function(prev) {
						return withKey(prev, account.id, "");
					});
					return postJson("/provider/refresh", { providerId: account.id });
				}).then(function(res) {
					if (res !== null && res !== void 0 && res.account !== void 0) mergePlanAccount(res.account);
					var failure = refreshFailure(res);
					if (failure === void 0) showToast("✓ " + tf("toast.keySaved", {
						name: shortName(account),
						summary: refreshSummary(res.account)
					}), true);
					else showToast("✓ " + tf("toast.keySavedNoQuota", { reason: failure }), false);
					reloadPresets();
				}).catch(function(cause) {
					showToast("✗ " + tf("toast.keySaveFailed", { reason: String(cause && cause.message ? cause.message : cause) }), false);
				}).then(function() {
					setSavingKey(function(prev) {
						return withKey(prev, account.id, false);
					});
				});
			}
			/** 查询配置（Step Plan 控制台 cookie）：写 CONSOLE_COOKIE 凭据 + 立刻实测一次余量。 */
			function saveQueryCookie(account) {
				var ref = account.consoleCookieRef === void 0 ? "" : String(account.consoleCookieRef);
				var value = queryCookieDrafts[account.id] === void 0 ? "" : String(queryCookieDrafts[account.id]).trim();
				if (ref === "") {
					showToast("✗ 找不到 CONSOLE_COOKIE 凭据名", false);
					return;
				}
				if (value === "") {
					showToast("✗ 请先粘贴 Cookie 再保存", false);
					return;
				}
				setSavingQueryCookie(function(prev) {
					return withKey(prev, account.id, true);
				});
				apiCall("credentials/set", {
					ref,
					value
				}).then(function() {
					setQueryCookieDrafts(function(prev) {
						return withKey(prev, account.id, "");
					});
					return postJson("/provider/refresh", { providerId: account.id });
				}).then(function(res) {
					if (res !== null && res !== void 0 && res.account !== void 0) mergePlanAccount(res.account);
					var failure = refreshFailure(res);
					if (failure === void 0) showToast("✓ 查询配置已保存（Step Plan 点数已可查）", true);
					else showToast("✓ 查询配置已保存，但余额刷新失败：" + failure, false);
				}).catch(function(cause) {
					showToast("✗ 保存失败：" + String(cause && cause.message ? cause.message : cause), false);
				}).then(function() {
					setSavingQueryCookie(function(prev) {
						return withKey(prev, account.id, false);
					});
				});
			}
			/**
			* 删除前把这条 route 的配置导出成 YAML 文本（issue #3 期望 4）。
			*
			* 删除是「清路由 + 清凭据」且不可撤销，手写的 `models` / `compat` / `retryPolicy` 一起没。
			* 界面上给一份能直接贴回 `settings.yaml` 的原文，是这里唯一成本够低、又真能救回配置的办法。
			* 密钥**不导出**：值在浏览器端拿不到（宿主只下发掩码），导出凭据名让用户知道该重填哪一个。
			*/
			function exportRoute(account) {
				var text = routeYamlOf(account);
				var clipboard = navigator !== void 0 && navigator !== null ? navigator.clipboard : void 0;
				if (clipboard === void 0 || typeof clipboard.writeText !== "function") {
					setNote(t("del.exportNoClipboard"));
					return;
				}
				clipboard.writeText(text).then(function() {
					setNote(t("del.exported"));
				}, function(cause) {
					setNote(tf("del.exportFailed", { reason: cause && cause.message ? cause.message : cause }));
				});
			}
			function removeProvider(account) {
				setDelBusy(true);
				setDelError(null);
				postJson("/provider/remove", { providerId: account.id }).then(function(res) {
					if (res === null || res === void 0 || res.ok !== true) {
						setDelError("删除失败：" + String(res && res.error || "未知错误"));
						return;
					}
					setDelTarget(null);
					onProviderRemoved(account);
				}).catch(function(cause) {
					setDelError("删除失败：" + String(cause && cause.message ? cause.message : cause));
				}).then(function() {
					setDelBusy(false);
				});
			}
			function togglePiAi(next) {
				setPiAiBusy(true);
				if (next !== true) setNote("正在切换到 DSH 自带版本 ...");
				postJson("/provider/pi-ai", { enabled: next }).then(function(result) {
					if (next !== true) {
						setNote(result !== null && result !== void 0 && result.needsRestart === true ? "即将启用官方自带pi-ai，重启 dsh 后生效" : "已在使用 DSH 自带的 pi-ai");
						setPiAiBusy(false);
						refresh(false);
						return;
					}
				}).catch(function(cause) {
					setNote("开关失败：" + String(cause && cause.message ? cause.message : cause));
					setPiAiBusy(false);
				});
			}
			/** 改一个编辑字段（草稿留在本地，按「保存修改」才写盘）。 */
			function setEditField(id, field, value) {
				setEditForms(function(prev) {
					var base = prev[id] !== void 0 ? prev[id] : providerEditForm(routesById[id] !== void 0 ? routesById[id] : {});
					var next = {};
					for (var key in base) next[key] = base[key];
					next[field] = value;
					return withKey(prev, id, next);
				});
			}
			/**
			* 保存编辑：**只写改动过的字段**（见 provider-edit.ts 的说明）。
			*
			* 与「添加供应商」那条路径的关键差别：这里**不要求重新测试、不要求重打 API key**。
			* 官方 Models 页被禁用后，改一个端点还得先过一遍连通性测试显然不合理；
			* 配置字段的写入本身不涉及凭据（key 走 credentials 通道，另有补录入口）。
			*/
			function saveProviderEdit(account) {
				var form = editForms[account.id] !== void 0 ? editForms[account.id] : {};
				var origin = providerEditForm(routesById[account.id] !== void 0 ? routesById[account.id] : account);
				var bad = validateProviderEdit(form, origin);
				if (bad !== void 0) {
					setNote(t(bad));
					return;
				}
				var ops = providerEditSaveOps(account.id, form, origin);
				if (ops.length === 0) {
					setNote(t("edit.noChange"));
					return;
				}
				setEditBusy(function(prev) {
					return withKey(prev, account.id, true);
				});
				apiCall("settings/mutate", {
					ns: "llm-pi-ai",
					ops
				}).then(function() {
					setNote(tf("edit.saved", { id: account.id }));
					setEditForms(function(prev) {
						var next = {};
						for (var key in prev) if (key !== account.id) next[key] = prev[key];
						return next;
					});
					return postJson("/provider/refresh").catch(function() {});
				}).then(function() {
					refresh(true);
				}).catch(function(cause) {
					setNote(tf("toast.updateFailed", { reason: cause && cause.message ? cause.message : cause }));
				}).then(function() {
					setEditBusy(function(prev) {
						return withKey(prev, account.id, false);
					});
				});
			}
			/** 折叠态记忆：undefined 时回落到默认值（报警/错误的卡片默认展开）。 */
			function isOpen(key, dflt) {
				return openMap[key] === void 0 ? dflt : openMap[key];
			}
			/** 把所有 provider 卡片的顶层展开键显式压灭（exceptId 除外）。子键（:models 等）保留。 */
			function collapseAllProviderCards(exceptId) {
				var list = plan !== null && Array.isArray(plan.accounts) ? plan.accounts : [];
				var ids = [];
				for (var i = 0; i < list.length; i += 1) {
					var entry = list[i];
					if (entry !== null && entry !== void 0 && typeof entry.id === "string" && entry.id !== exceptId) ids.push(entry.id);
				}
				if (ids.length === 0) return;
				setOpenMap(function(prev) {
					var next = {};
					for (var key in prev) next[key] = prev[key];
					for (var j = 0; j < ids.length; j += 1) next[ids[j]] = false;
					return next;
				});
			}
			var addPanelOpenState = react.default.useState(false);
			var addPanelOpen = addPanelOpenState[0];
			var setAddPanelOpen = addPanelOpenState[1];
			function changeAddPanelOpen(next) {
				setAddPanelOpen(next);
				if (next === true) collapseAllProviderCards();
			}
			function toggle(key, dflt) {
				var opening = isOpen(key, dflt) !== true;
				if (opening) {
					collapseAllProviderCards(key);
					setAddPanelOpen(false);
				}
				setOpenMap(function(prev) {
					return withKey(prev, key, opening);
				});
			}
			var bridge = status === null || status.bridge === void 0 ? void 0 : status.bridge;
			var piAi = status === null || status.piAi === void 0 ? void 0 : status.piAi;
			var bridgeRows = piAiBridgeRows(bridge, piAi);
			var bridgeLines = [];
			for (var bi = 0; bi < bridgeRows.length; bi += 1) {
				var row = bridgeRows[bi];
				var children = [row.text];
				if (row.value !== void 0) children.push(react.default.createElement("span", {
					className: "plan_tag pv_push",
					title: row.title === void 0 ? "" : row.title,
					key: "value"
				}, row.value));
				bridgeLines.push(react.default.createElement("div", {
					className: "pv_line" + (row.bad === true ? " plan_badText" : row.warn === true ? " plan_warnText" : ""),
					key: row.key
				}, children));
			}
			if (status !== null) {
				var piAiRecord = piAi === void 0 || piAi === null ? {} : piAi;
				var piToggle = piAiToggleState(piAiRecord);
				var stateText = piAiUpstreamText(piAiRecord, bridge);
				var badTone = piAiRecord.latestRejected !== void 0 && piAiRecord.latestRejected !== null;
				var warnTone = badTone !== true && piAiRecord.needsRestart === true;
				var toggleChildren = [react.default.createElement("label", {
					className: "pv_toggle",
					key: "label",
					title: t("bridge.toggleTip")
				}, react.default.createElement("input", {
					type: "checkbox",
					className: "pv_switch",
					key: "input",
					checked: piToggle.enabled,
					disabled: piAiBusy || piToggle.downloading,
					onChange: function(event) {
						togglePiAi(event.target.checked === true);
					}
				}), react.default.createElement("span", { key: "text" }, t("bridge.toggle")))];
				if (stateText !== void 0 && stateText !== "") toggleChildren.push(react.default.createElement("span", {
					className: "pv_push" + (badTone === true ? " plan_badText" : warnTone === true ? " plan_warnText" : ""),
					key: "state",
					title: stateText
				}, stateText));
				bridgeLines.push(react.default.createElement("div", {
					className: "pv_line",
					key: "toggle"
				}, toggleChildren));
			}
			var accounts = plan !== null && Array.isArray(plan.accounts) ? plan.accounts : (function() {
				var routes = status !== null && Array.isArray(status.routes) ? status.routes : [];
				var skeleton = [];
				for (var ri = 0; ri < routes.length; ri += 1) {
					var route = routes[ri];
					if (route === null || typeof route !== "object" || typeof route.id !== "string") continue;
					skeleton.push({
						id: route.id,
						displayName: typeof route.displayName === "string" ? route.displayName : void 0,
						apiKeyEnv: typeof route.apiKeyEnv === "string" ? route.apiKeyEnv : void 0
					});
				}
				return skeleton;
			})();
			var modelsByProvider = {};
			for (var gi = 0; gi < catalogGroups.length; gi += 1) modelsByProvider[catalogGroups[gi].id] = catalogGroups[gi].models;
			var cards = [];
			for (var i = 0; i < accounts.length; i += 1) (function(account) {
				var chips = headlineChips(account);
				var dflt = account.error !== void 0 || typeof account.credentialWarning === "string";
				var expanded = isOpen(account.id, dflt);
				var chipEls = [];
				for (var c = 0; c < chips.length; c += 1) chipEls.push(headlineChip(chips[c], c));
				var bodyRows = [];
				if (expanded) {
					bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "id"
					}, react.default.createElement("span", null, t("prov.routeId")), react.default.createElement("span", { className: "pv_field" }, String(account.id))));
					var editOrigin = providerEditForm(routesById[account.id] !== void 0 ? routesById[account.id] : account);
					var editForm = editForms[account.id] !== void 0 ? editForms[account.id] : editOrigin;
					var editDirty = isProviderEditDirty(editForm, editOrigin);
					var busyEdit = editBusy[account.id] === true;
					bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "name"
					}, react.default.createElement("span", null, t("edit.displayName")), react.default.createElement("input", {
						className: "pv_field pv_key",
						type: "text",
						value: editForm.displayName,
						placeholder: account.id,
						onChange: function(event) {
							setEditField(account.id, "displayName", event.target.value);
						}
					})));
					var keyRef = typeof account.apiKeyEnv === "string" && account.apiKeyEnv !== "" ? String(account.apiKeyEnv) : void 0;
					var keyDraft = keyDrafts[account.id] === void 0 ? "" : String(keyDrafts[account.id]);
					bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "key"
					}, react.default.createElement("span", null, t("prov.apiKey")), keyRef === void 0 ? react.default.createElement("span", { className: "pv_field" }, tf("toast.noCredentialRef", { name: shortName(account) })) : react.default.createElement("span", {
						className: "pv_pick",
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: "6px",
							flex: "1 1 auto"
						}
					}, react.default.createElement("input", {
						className: "pv_field pv_key",
						style: { flex: "1 1 auto" },
						type: "password",
						placeholder: account.keyHint !== void 0 ? String(account.keyHint) : "sk-…",
						value: keyDraft,
						disabled: savingKey[account.id] === true,
						onChange: function(event) {
							var next = event.target.value;
							setKeyDrafts(function(prev) {
								return withKey(prev, account.id, next);
							});
						}
					}), react.default.createElement("button", {
						type: "button",
						className: "pv_action",
						style: {
							marginLeft: "0",
							flex: "0 0 auto"
						},
						disabled: savingKey[account.id] === true || keyDraft.trim() === "",
						title: tf("prov.saveKeyTip", { ref: keyRef }),
						onClick: function() {
							saveKey(account);
						}
					}, savingKey[account.id] === true ? t("prov.saving") : t("prov.save")))));
					bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "url"
					}, react.default.createElement("span", null, t("prov.apiBase")), react.default.createElement("input", {
						className: "pv_field pv_key pv_rowField",
						type: "text",
						value: editForm.baseURL,
						placeholder: t("edit.baseUrlPlaceholder"),
						onChange: function(event) {
							setEditField(account.id, "baseURL", event.target.value);
						}
					}), react.default.createElement("button", {
						type: "button",
						className: "pv_action",
						style: { marginLeft: "0" },
						title: t("prov.queryConfigTip"),
						onClick: function() {
							if (account.queryConfigNeeded !== true) {
								showToast(t("prov.noQueryConfigNeeded"), true);
								return;
							}
							setQueryCookieOpenId(queryCookieOpenId === account.id ? null : account.id);
						}
					}, t("prov.queryConfig"))));
					if (queryCookieOpenId === account.id) bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "query-cookie"
					}, react.default.createElement("span", null, t("prov.queryCookieLabel")), react.default.createElement("input", {
						className: "pv_field pv_key pv_rowField",
						type: "text",
						value: queryCookieDrafts[account.id] === void 0 ? "" : String(queryCookieDrafts[account.id]),
						placeholder: t("prov.queryCookiePlaceholder"),
						onChange: function(event) {
							setQueryCookieDrafts(function(prev) {
								return withKey(prev, account.id, event.target.value);
							});
						}
					}), react.default.createElement("button", {
						type: "button",
						className: "pv_action",
						style: { marginLeft: "0" },
						disabled: savingQueryCookie[account.id] === true,
						onClick: function() {
							saveQueryCookie(account);
						}
					}, savingQueryCookie[account.id] === true ? t("prov.saving") : t("prov.save"))), react.default.createElement("div", {
						className: "plan_note pv_editHint",
						key: "query-cookie-tip"
					}, t("prov.queryCookieTip")));
					bodyRows.push(react.default.createElement("div", {
						className: "pv_line pv_row",
						key: "api"
					}, react.default.createElement("span", null, t("prov.protocol")), pvSelectView({
						open: apiSelOpenId === account.id,
						value: editForm.api,
						options: [{
							value: "",
							label: t("edit.apiDefault")
						}].concat(PROVIDER_API_OPTIONS.map(function(option) {
							return {
								value: option,
								label: option
							};
						})),
						onToggle: function() {
							setApiSelOpenId(apiSelOpenId === account.id ? null : account.id);
						},
						onPick: function(value) {
							setApiSelOpenId(null);
							setEditField(account.id, "api", value);
						}
					})));
					if (editDirty || busyEdit) {
						bodyRows.push(react.default.createElement("div", {
							className: "plan_note pv_editHint",
							key: "edit-hint"
						}, t("edit.dirtyHint")));
						bodyRows.push(react.default.createElement("div", {
							className: "pv_editActs",
							key: "edit-acts"
						}, react.default.createElement("button", {
							type: "button",
							className: "pv_action",
							style: { marginLeft: "0" },
							disabled: busyEdit || !editDirty,
							onClick: function() {
								saveProviderEdit(account);
							}
						}, busyEdit ? t("edit.saving") : t("edit.save")), react.default.createElement("button", {
							type: "button",
							className: "pv_action",
							style: { marginLeft: "0" },
							disabled: busyEdit,
							onClick: function() {
								setNote(null);
								setEditForms(function(prev) {
									var next = {};
									for (var key in prev) if (key !== account.id) next[key] = prev[key];
									return next;
								});
							}
						}, t("prov.cancel"))));
					}
					var models = modelsByProvider[account.id];
					if (models !== void 0 && models.length === 0) {
						var fromDetails = [];
						for (var dk in detailsById) {
							var detail = detailsById[dk];
							if (detail === void 0 || detail === null || detail.provider !== account.id) continue;
							var detailId = typeof detail.id === "string" && detail.id !== "" ? detail.id : dk.split("/").pop();
							if (detailId === void 0) continue;
							fromDetails.push({
								id: detailId,
								name: typeof detail.name === "string" && detail.name !== "" ? detail.name : detailId
							});
						}
						if (fromDetails.length > 0) models = fromDetails;
					}
					if (models === void 0) bodyRows.push(react.default.createElement("div", {
						className: "pv_line",
						key: "m-load"
					}, t("prov.modelsLoading")));
					else if (models.length === 0 && account.deletable !== true) bodyRows.push(react.default.createElement("div", {
						className: "pv_line",
						key: "m-none"
					}, t("prov.noModels")));
					else {
						var modelsOpen = isOpen(account.id + ":models", false);
						var modelsEdit = isOpen(account.id + ":models-edit", false);
						function toggleModels() {
							setOpenMap(function(prev) {
								var next = withKey(prev, account.id + ":models", !modelsOpen);
								return modelsOpen ? withKey(next, account.id + ":models-edit", false) : next;
							});
						}
						var mBoxRows = [];
						var mTopChildren = [react.default.createElement("button", {
							type: "button",
							className: "pv_mHead",
							key: "m-head",
							onClick: toggleModels
						}, react.default.createElement("span", null, tf("prov.models", { count: models.length })))];
						mTopChildren.push(react.default.createElement("div", {
							className: "pv_mCaretCol",
							key: "m-caret",
							title: modelsOpen ? t("prov.collapse") : t("prov.expand"),
							onClick: toggleModels
						}, caretSvg(modelsOpen)));
						mBoxRows.push(react.default.createElement("div", {
							className: "pv_mTop",
							key: "m-top"
						}, mTopChildren));
						if (modelsOpen && account.deletable === true && modelsEdit === true) mBoxRows.push(react.default.createElement(ModelListEditor, {
							key: "m-edit",
							account,
							catalog: models,
							details: detailsById,
							onSaved: function(message, models) {
								showToast(message, true);
								setDetailsById(function(prev) {
									var next = {};
									for (var key in prev) next[key] = prev[key];
									for (var i = 0; i < models.length; i += 1) {
										var entry = models[i];
										var qualified = detailKeyOf(account.id, entry.id);
										var existing = next[qualified];
										var merged = existing !== void 0 && existing !== null && typeof existing === "object" ? { ...existing } : {
											id: entry.id,
											provider: account.id
										};
										if (entry.name !== void 0) merged.name = entry.name;
										if (entry.contextWindow !== void 0) merged.contextWindow = entry.contextWindow;
										if (entry.maxTokens !== void 0) merged.maxTokens = entry.maxTokens;
										if (Array.isArray(entry.input)) {
											merged.input = entry.input;
											merged.vision = entry.input.indexOf("image") !== -1;
											merged.video = entry.input.indexOf("video") !== -1;
										}
										if (entry.reasoning !== void 0) merged.reasoning = entry.reasoning === true;
										var existingSource = existing?.source;
										if (existingSource === void 0 || existingSource === "declared") merged.source = "declared";
										next[qualified] = merged;
									}
									return next;
								});
								setCatalogGroups(function(prevGroups) {
									return prevGroups.map(function(group) {
										if (group.id !== account.id) return group;
										var catalogModels = Array.isArray(group.models) ? group.models : [];
										var merged = [];
										for (var i = 0; i < models.length; i += 1) {
											var entry = models[i];
											var existing;
											for (var j = 0; j < catalogModels.length; j += 1) if (catalogModels[j].id === entry.id) {
												existing = catalogModels[j];
												break;
											}
											merged.push({
												id: entry.id,
												name: entry.name !== void 0 ? entry.name : existing !== void 0 ? existing.name : entry.id,
												contextWindow: entry.contextWindow !== void 0 ? entry.contextWindow : existing !== void 0 ? existing.contextWindow : void 0
											});
										}
										return {
											id: group.id,
											name: group.name,
											models: merged
										};
									});
								});
								onProviderAdded();
							},
							onClose: function() {
								setOpenMap(function(prev) {
									return withKey(withKey(prev, account.id + ":models", false), account.id + ":models-edit", false);
								});
							}
						}));
						else if (modelsOpen) {
							var mListRows = [];
							mListRows.push(react.default.createElement("div", {
								className: "pv_mHeadRow",
								key: "m-colhead"
							}, react.default.createElement("span", {
								className: "pv_mId",
								style: { fontFamily: "inherit" }
							}, t("prov.modelId")), react.default.createElement("span", { className: "pv_mCaps" }, t("prov.caps")), react.default.createElement("span", { className: "pv_mCtx" }, t("prov.ctx")), react.default.createElement("span", { className: "pv_mMax" }, t("cap.maxTokens"))));
							for (var m = 0; m < models.length; m += 1) mListRows.push(modelRow(models[m], account, detailsById));
							mBoxRows.push(react.default.createElement("div", {
								className: "pv_mList",
								key: "m-list"
							}, mListRows));
							if (account.deletable === true) mBoxRows.push(react.default.createElement("div", {
								className: "pv_mEditRow",
								key: "m-edit-row"
							}, react.default.createElement("button", {
								type: "button",
								className: "pv_action",
								style: { marginLeft: "0" },
								title: "打开逐模型清单编辑：勾选 / 添加 / 删除，点「保存」后写进 settings.yaml",
								onClick: function() {
									setOpenMap(function(prev) {
										return withKey(prev, account.id + ":models-edit", true);
									});
								}
							}, "编辑模型")));
						}
						bodyRows.push(react.default.createElement("div", {
							className: "pv_mBox",
							key: "mbox"
						}, mBoxRows));
					}
					if (account.error !== void 0) bodyRows.push(react.default.createElement("div", {
						className: "plan_note plan_badText",
						key: "err"
					}, String(account.error)));
					if (typeof account.credentialWarning === "string") bodyRows.push(react.default.createElement("div", {
						className: "plan_note plan_badText",
						key: "warn"
					}, account.credentialWarning));
				}
				var linkUrl = typeof account.websiteUrl === "string" && account.websiteUrl !== "" ? account.websiteUrl : typeof account.baseUrl === "string" && account.baseUrl !== "" ? account.baseUrl : void 0;
				cards.push(react.default.createElement("div", {
					className: "pv_pc" + (expanded ? " pv_pcOpen" : ""),
					key: account.id
				}, react.default.createElement("div", { className: "pv_pcTop" }, react.default.createElement("div", { className: "pv_pcMain" }, react.default.createElement("div", {
					className: "pv_pcHead",
					role: "button",
					tabIndex: 0,
					"aria-expanded": expanded ? "true" : "false",
					onClick: function() {
						toggle(account.id, dflt);
					},
					onKeyDown: function(ev) {
						if (ev && (ev.key === "Enter" || ev.key === " ")) {
							if (typeof ev.preventDefault === "function") ev.preventDefault();
							toggle(account.id, dflt);
						}
					}
				}, react.default.createElement("span", { className: "pv_pcLead" }, react.default.createElement("span", { className: "pv_pcLeadRow" }, react.default.createElement("span", { className: dotClass(account) }), react.default.createElement("span", { className: "pv_pcName" }, shortName(account)), linkUrl === void 0 ? null : react.default.createElement("a", {
					className: "pv_pcWeb",
					href: linkUrl,
					target: "_blank",
					rel: "noreferrer",
					title: tf("prov.openSite", { url: linkTextOf(linkUrl) }),
					onClick: function(event) {
						if (event && typeof event.stopPropagation === "function") event.stopPropagation();
					}
				}, "↗")))), react.default.createElement("div", { className: "pv_pcMeta" }, chipEls, react.default.createElement("span", { className: "pv_metaActs" }, account.fetchedAt === void 0 ? null : react.default.createElement("span", {
					className: "pv_fresh",
					title: tf("prov.lastRefresh", { time: String(account.fetchedAt).slice(11, 19) })
				}, "◷ " + relativeTime(account.fetchedAt)), react.default.createElement("button", {
					type: "button",
					className: "pv_iconBtn" + (refreshingState[0][account.id] === true || planRefreshing === true ? " pv_spin" : ""),
					disabled: refreshingState[0][account.id] === true || planRefreshing === true,
					title: refreshingState[0][account.id] === true || planRefreshing === true ? t("prov.refreshing") : account.fetchedAt !== void 0 ? tf("prov.refreshQuotaAt", { time: String(account.fetchedAt).slice(11, 19) }) : t("prov.refreshQuota"),
					onClick: function() {
						refreshAccount(account);
					}
				}, "↻"), account.deletable === true ? react.default.createElement("button", {
					type: "button",
					className: "pv_iconBtn",
					title: "删除这个 provider（会先弹出确认，列清要删的配置与密钥）",
					onClick: function() {
						setDelError(null);
						setDelTarget(account);
					}
				}, "✕") : null))), react.default.createElement("div", {
					className: "pv_pcCaretCol",
					title: expanded ? t("prov.collapse") : t("prov.expand"),
					onClick: function() {
						toggle(account.id, dflt);
					}
				}, caretSvg(expanded))), expanded ? react.default.createElement("div", { className: "pv_pcBody" }, bodyRows) : null));
			})(accounts[i]);
			if (cards.length === 0) cards.push(react.default.createElement("div", {
				className: "pv_line",
				key: "__none"
			}, String(plan !== null && plan.error !== void 0 ? plan.error : t("prov.none"))));
			var tabProviders = react.default.createElement("button", {
				type: "button",
				className: "pv_tab" + (tab === "providers" ? " pv_tabOn" : ""),
				onClick: function() {
					setNote(null);
					setTab("providers");
				}
			}, t("tabProviders"));
			var tabBridge = react.default.createElement("button", {
				type: "button",
				className: "pv_tab" + (tab === "bridge" ? " pv_tabOn" : ""),
				onClick: function() {
					setNote(null);
					setTab("bridge");
				}
			}, t("bridge.tab"));
			return react.default.createElement("div", { className: "pv_stack" }, react.default.createElement("div", { className: "pv_tabs" }, tabProviders, tabBridge), !note ? null : react.default.createElement("div", { className: "plan_note pv_pageNote" }, note), tab === "bridge" ? react.default.createElement("div", {
				className: "pv_pc",
				key: "pane-bridge"
			}, react.default.createElement("div", {
				className: "pv_pcBody",
				style: {
					borderTop: "0",
					padding: "10px 18px",
					justifyContent: "center"
				}
			}, bridgeLines, status === null ? react.default.createElement("div", {
				className: "pv_line",
				key: "loading"
			}, react.default.createElement("span", { className: "pv_spin" }, "↻"), react.default.createElement("span", null, t("bridge.loading"))) : null)) : react.default.createElement("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: "10px"
				},
				key: "pane-providers"
			}, react.default.createElement(AddProviderPanel, {
				presets,
				open: addPanelOpen,
				onAdded: onProviderAdded,
				onOpenChange: changeAddPanelOpen,
				details: detailsById
			}), cards), toast === null ? null : react.default.createElement("div", { className: "pv_toast " + (toast.ok === true ? "pv_toastOk" : "pv_toastFail") }, toast.text), delTarget === null ? null : react.default.createElement(DeleteProviderModal, {
				account: delTarget,
				busy: delBusy,
				error: delError,
				onExport: function() {
					if (delTarget !== null) exportRoute(delTarget);
				},
				onCancel: function() {
					if (delBusy === true) return;
					setDelTarget(null);
					setDelError(null);
				},
				onConfirm: function() {
					if (delTarget !== null) removeProvider(delTarget);
				}
			}));
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* 插件样式：沿用 GUI 的 CSS 变量，跟模型座位视觉一致。
		* installCss 一律手写 style 标签（官方 styles.insert 需要 inject 'styles'，见文件末尾注释）。
		*/
		var css = ".plan_root{position:relative;display:inline-flex;align-items:center}.plan_dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}.plan_dot_ok{background:#22a06b}.plan_dot_warn{background:#d9a300}.plan_dot_bad{background:#d9534f}.plan_tag{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-tertiary);font-weight:400}.plan_warnText{color:#b8860b}.plan_badText{color:#d9534f}.plan_note{margin-top:3px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);word-break:break-word}.mp_search{box-sizing:border-box;width:100%;padding:6px 10px;margin-bottom:4px;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:8px;outline:0}.mp_search:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}.mp_chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}.mp_chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font:inherit;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-secondary);background:0 0;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:999px;cursor:pointer}.mp_chip[data-on=\"1\"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.05));border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}.mp_modelName{font-weight:500}.mp_empty{padding:14px 10px;text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary)}.ms_trigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(560px,60vw);max-width:min(560px,60cqw);height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;background:transparent;outline:0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;font-weight:500;cursor:pointer;white-space:nowrap}.ms_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.ms_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.ms_tLabel{min-width:0;overflow:hidden;text-overflow:ellipsis}.ms_tProvider{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;flex-shrink:999}.ms_tModel{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;flex-shrink:1}.ms_tSlash{flex:0 0 auto}.ms_tEffort{flex:0 0 auto;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary))}.ms_tQuota{flex:0 0 auto;display:inline-flex;align-items:center;gap:3px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary))}@container (max-width:760px){.ms_tProvider,.ms_tSlash{display:none}}@container (max-width:620px){.ms_tQuotaText{display:none}}.ms_chev{flex:0 0 auto;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));transition:transform .12s ease}.ms_chevOpen{transform:rotate(180deg)}.ms_menu{position:absolute;bottom:calc(100% + 6px);right:0;z-index:1100;display:flex;flex-direction:column;width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));overflow:hidden;padding:4px;border:0;border-radius:20px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary)}.ms_menu.ms_menuTall{max-height:min(560px,calc(100vh - 96px))}.ms_cell{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:auto;min-width:100%;height:40px;padding:0 10px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;text-align:left}.ms_cell:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.ms_cellLabel{flex:0 0 auto;white-space:nowrap}.ms_cellValue{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:var(--dsw-alias-label-tertiary)}.ms_cellChev{flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}.ms_scroll{min-height:0;overflow-y:auto;display:flex;flex-direction:column}.ms_group{margin-top:4px}.ms_groupTitle{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-weight:500}.ms_option{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:auto;min-width:100%;min-height:38px;padding:6px 8px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:20px;text-align:left;cursor:pointer}.ms_option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.ms_option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.ms_name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}.ms_capsCol{flex:none;width:92px;display:flex;justify-content:flex-end;align-items:center;gap:4px}.ms_ctxCol{flex:none;width:48px;text-align:right;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.ms_check{flex:0 0 18px;display:grid;place-items:center;color:var(--dsw-alias-label-primary)}.ms_status{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.pv_section{display:flex;flex-direction:column;gap:12px;max-width:640px}.pv_card{padding:14px 16px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff)}.pv_title{font-size:13px;font-weight:600;line-height:18px;margin-bottom:8px}.pv_line{display:flex;align-items:center;gap:10px;font-size:13px;line-height:22px;padding:3px 0;color:var(--dsw-alias-label-secondary)}.pv_action{margin-left:auto;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.05));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:6px;padding:4px 12px;cursor:pointer}.pv_action:disabled{opacity:.5;cursor:default}.pv_toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}.pv_switch{appearance:none;-webkit-appearance:none;position:relative;flex:none;width:34px;height:20px;margin:0;border-radius:10px;background:var(--dsw-alias-fill-tertiary,rgba(0,0,0,.16));transition:background .15s;cursor:pointer}.pv_switch:checked{background:var(--dsw-alias-label-primary,#1f2329)}.pv_switch::after{content:\"\";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}.pv_switch:checked::after{left:16px}.pv_switch:disabled{opacity:.5;cursor:default}.pv_stack{display:flex;flex-direction:column;gap:14px;max-width:600px}.pv_pc{list-style:none;border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.15));border-radius:16px;background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;display:flex;flex-direction:column}.pv_pc:hover{border-color:var(--dsw-alias-label-dimmed,rgba(0,0,0,.3))}.pv_pcOpen{background:var(--dsw-alias-bg-layer-2,#f4f5f6);border-color:var(--dsw-alias-label-dimmed,rgba(0,0,0,.3))}.pv_pcTop{display:flex;align-items:stretch}.pv_pcMain{flex:1;min-width:0;display:flex;flex-direction:column}.pv_pcCaretCol{flex:none;width:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--dsw-alias-label-tertiary)}.pv_pcCaretCol:hover{color:var(--dsw-alias-label-secondary)}.pv_pcHead{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border:0;background:0 0;cursor:pointer;font:inherit;color:inherit;text-align:left;border-radius:12px}.pv_pcHead:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b5bdb);outline-offset:-2px}.pv_pcName{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pv_pcChips{flex:none;display:flex;align-items:center;gap:10px;font-size:13px;white-space:nowrap}.pv_chipItem{display:inline-flex;align-items:baseline;gap:2px}.pv_chipLabel{color:var(--dsw-alias-label-secondary)}.pv_chipSep{flex:none;width:1px;height:12px;margin:0 4px;background:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}.pv_chipReset{color:var(--dsw-alias-label-tertiary);font-size:12px}.pv_pcCaret{flex:none;display:block;color:var(--dsw-alias-label-tertiary);transition:transform .16s}.pv_pcCaretOpen{transform:rotate(180deg)}.pv_pcMeta{display:flex;align-items:center;gap:10px;padding:2px 16px 14px;font-size:13px;flex-wrap:wrap}.pv_metaActs{margin-left:auto;display:inline-flex;align-items:center;gap:4px}.pv_pcWeb{display:inline-flex;align-items:center;color:var(--dsw-alias-label-tertiary);text-decoration:none;font-size:14px;line-height:20px;padding:0 2px;border-radius:6px}.pv_pcWeb:hover{color:var(--dsw-alias-label-secondary)}.pv_lv{flex:none;margin-left:auto;font-size:12px;line-height:18px;padding:1px 10px;border-radius:999px;white-space:nowrap;color:var(--dsw-alias-state-business-primary,#5b8cff);border:1px solid var(--dsw-alias-state-business-primary,#5b8cff)}.pv_pickItem,.pv_iconBtn,.pv_action,.pv_tab,.pv_addBtn,.pv_fclear,.pv_delYes,.pv_delNo,.mp_chip,.pv_pcLink{transition:background-color .16s ease,color .16s ease}.pv_iconBtn:focus-visible,.pv_action:focus-visible,.pv_tab:focus-visible,.pv_pickItem:focus-visible,.pv_addBtn:focus-visible,a.pv_pcLink:focus-visible,.pv_selTrigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b5bdb);outline-offset:1px}input.pv_field:not([readonly]):focus,select.pv_field:focus,textarea.pv_field:focus,.pv_mFilter:focus{outline:0;border-color:var(--dsw-alias-label-primary,rgba(0,0,0,.62))}.pv_pcBody{border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));padding:10px 18px 14px;display:flex;flex-direction:column;gap:4px}.pv_line .plan_tag{margin-left:0}.pv_line .pv_push{margin-left:auto}.pv_row>span:first-child{width:72px;flex:none}.pv_hint{font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.pv_field{display:inline-flex;align-items:center;min-width:240px;max-width:100%;padding:6px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.pv_mBox{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;padding:0 14px;display:flex;flex-direction:column}.pv_mRight{margin-left:auto;display:inline-flex;align-items:center;gap:8px}.pv_iconBtn{border:0;background:0 0;cursor:pointer;font:inherit;font-size:15px;padding:3px 6px;border-radius:6px;color:var(--dsw-alias-label-tertiary)}.pv_iconBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.pv_delOn{color:#e03131;font-size:12px;width:auto;padding:2px 8px}.pv_modelEditor{display:flex;flex-direction:column;gap:6px;padding:8px 10px;margin-top:6px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.02))}.pv_edHead{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}.pv_edMode{margin-left:auto;font-size:11px;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.pv_edItem{display:flex;flex-direction:column;gap:4px}.pv_edItemOff{opacity:.5}.pv_edRow{display:flex;align-items:center;gap:6px;font-size:12px}.pv_edId{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pv_edTag{font-size:11px;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary)}.pv_edCaret{margin-left:auto;border:0;background:0 0;cursor:pointer;font:inherit;font-size:11px;padding:1px 6px;border-radius:6px;color:var(--dsw-alias-label-tertiary)}.pv_edCaret:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.pv_edFields{display:flex;flex-direction:column;gap:4px;padding:6px 0 2px 22px}.pv_edField{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}.pv_edField > .pv_field{flex:1;min-width:0}.pv_edAdd{display:flex;align-items:center;gap:6px}.pv_edActs{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pv_delPanel{display:flex;flex-direction:column;gap:6px;padding:10px 12px;margin-top:2px;border:1px solid rgba(224,49,49,.35);border-radius:10px;background:rgba(224,49,49,.05)}.pv_delPanelTitle{font-size:13px;font-weight:500;color:#e03131}.pv_delPanelBody{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.pv_delPanelActs{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.pv_delPanel .pv_delYes{border:1px solid rgba(224,49,49,.5);background:rgba(224,49,49,.1);font-weight:500}.pv_delPanel .pv_delNo{border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12))}.pv_delYes{border:0;background:0 0;cursor:pointer;font:inherit;font-size:12px;color:#e03131;padding:3px 9px;border-radius:6px}.pv_delYes:hover{background:rgba(224,49,49,.12)}.pv_delNo{border:0;background:0 0;cursor:pointer;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);padding:3px 9px;border-radius:6px}.pv_delNo:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}@keyframes pvRot{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.pv_spin{display:inline-block;animation:pvRot 1s linear infinite}.pv_toast{position:fixed;bottom:24px;right:24px;z-index:500;padding:10px 18px;border-radius:12px;font-size:13px;line-height:20px;max-width:min(420px,80vw);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18))}.pv_toastOk{color:#2f9e44}.pv_toastFail{color:#e03131}.pv_fresh{font-size:12px;line-height:18px;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}.pv_addBtn{width:100%;padding:13px;border:1px dashed var(--dsw-alias-border-l2,rgba(0,0,0,.2));border-radius:14px;background:0 0;cursor:pointer;font:inherit;font-size:14px;color:var(--dsw-alias-label-secondary)}.pv_addBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.03))}input.pv_field{cursor:text}.pv_sel{position:relative;display:inline-flex}.pv_selTrigger{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;min-width:240px;max-width:100%;padding:6px 12px;text-align:left;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.2));border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);cursor:pointer}.pv_selTrigger:hover{border-color:var(--dsw-alias-label-primary,rgba(0,0,0,.62))}.pv_selTrigger:focus{outline:0}.pv_selTrigger.pv_selOpen{border-color:var(--dsw-alias-label-primary,rgba(0,0,0,.62))}.pv_selValue{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}.pv_selChev{display:inline-flex;color:var(--dsw-alias-label-tertiary)}.pv_selOpen .pv_selChev{color:var(--dsw-alias-label-primary)}.pv_selMenu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:60;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;padding:6px;max-height:240px;overflow:auto;box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18))}.pv_selOption{display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:6px;font-size:13px;line-height:20px;text-align:left;cursor:pointer;color:var(--dsw-alias-label-primary);white-space:nowrap}.pv_selOptLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pv_selOption:hover{background:var(--dsw-alias-fill-tertiary,rgba(0,0,0,.045))}.pv_selOptionOn{color:var(--dsw-alias-brand-primary,#3b5bdb);font-weight:600;background:var(--dsw-alias-fill-tertiary,rgba(0,0,0,.045))}.pv_selCheck{flex:none;margin-left:auto;display:grid;place-items:center;color:var(--dsw-alias-brand-primary,#3b5bdb)}.pv_rowField{flex:none;width:min(300px,100%)}input.pv_ro{background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05));color:var(--dsw-alias-label-tertiary);cursor:default}.pv_key{background:var(--dsw-alias-bg-layer-1,#fff);border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}.pv_actRow{display:flex;gap:10px;align-items:center;padding:8px 0 4px}.pv_editHint{margin:2px 0 0}.pv_editActs{display:flex;gap:8px;align-items:center;padding:10px 0 2px}.pv_modelPick{max-height:240px;overflow:auto;border:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:8px;margin:4px 0 2px;display:flex;flex-direction:column}.pv_modelPick .pv_meHeadRow{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-1,#fff)}.pv_modelPick .pv_meRow .pv_mId{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;word-break:normal}.pv_modelPickName{flex:none;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}.pv_pickNone{color:var(--dsw-alias-label-tertiary)}.pv_mIdEdit{cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;color:var(--dsw-alias-label-secondary)}.pv_mIdEdit:hover{color:var(--dsw-alias-label-primary)}.pv_mIdOpen{color:var(--dsw-alias-label-primary)}.pv_meEditPanel{display:flex;flex-direction:column;gap:6px;padding:8px 10px;margin:8px 10px 8px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.02))}.pv_meEditPanel .pv_meActs{margin-bottom:0}.pv_meEditPanel .pv_row{font-size:12px;line-height:20px}.pv_meEditPanel .pv_field{min-width:0;flex:1;max-width:320px}.pv_mePanelCaps{display:inline-flex;align-items:center;gap:6px}.pv_pick{flex:1;min-width:0;position:relative}.pv_pickBtn{width:100%;cursor:pointer;justify-content:space-between;gap:8px}.pv_pickMenu{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:250;padding:6px;display:flex;flex-direction:column;gap:4px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18))}.pv_pickList{max-height:240px;overflow:auto;display:flex;flex-direction:column}.pv_pickItem{display:flex;align-items:center;gap:6px;padding:8px 12px;border:0;background:0 0;cursor:pointer;font:inherit;font-size:13.5px;color:var(--dsw-alias-label-primary);text-align:left;border-radius:8px}.pv_pickItem:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.04))}.pv_pickItem:disabled{opacity:.5;cursor:default}.pv_pickEmpty{padding:12px;font-size:13px;color:var(--dsw-alias-label-tertiary);text-align:center}.pv_msRow{display:flex;align-items:center;gap:8px}.pv_msMain{flex:1;min-width:0;display:flex;align-items:center;gap:8px;text-align:left}select.pv_msEff{flex:none;font:inherit;font-size:12px;padding:3px 8px;cursor:pointer;text-align:left;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:6px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-secondary)}.pv_tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));margin-bottom:14px}.pv_tab{font:inherit;font-size:14px;padding:8px 14px;border:0;background:0 0;cursor:pointer;color:var(--dsw-alias-label-secondary);border-bottom:2px solid transparent;margin-bottom:-1px}.pv_tab:hover{color:var(--dsw-alias-label-primary)}.pv_tabOn{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary,#3b5bdb);font-weight:600}.pv_pageNote{padding:0 18px}.pv_pcLead{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}.pv_pcLeadRow{display:flex;align-items:center;gap:8px}.pv_pcLink{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pv_pcLink:hover{color:var(--dsw-alias-label-secondary);text-decoration:underline}.pv_mRow{position:relative;display:flex;align-items:center;gap:8px;padding:3px 0}.pv_mId{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,Menlo,Consolas,monospace}.pv_mHeadRow{display:flex;align-items:center;gap:8px;padding:5px 0 4px;font-size:12px;color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}.pv_mCaps{flex:none;width:100px;display:inline-flex;justify-content:flex-end;align-items:center;gap:6px}.pv_mCtx{flex:none;width:56px;text-align:right;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}.pv_mMax{flex:none;width:64px;text-align:right;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}.pv_capIcons{display:inline-flex;gap:6px;font-size:12px;line-height:16px}.pv_capMini{font-size:11px;line-height:16px;padding:0 7px;border-radius:999px;white-space:nowrap}.pv_mHead{display:flex;align-items:center;gap:6px;flex:1;min-width:0;font:inherit;font-size:13px;font-weight:normal;line-height:18px;padding:0;border:0;background:0 0;cursor:pointer;color:var(--dsw-alias-label-primary);text-align:left}.pv_mHead:hover{color:var(--dsw-alias-label-secondary)}.pv_mTop{display:flex;align-items:center;gap:8px;height:38px;padding:0}.pv_mCaretCol{flex:none;width:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--dsw-alias-label-tertiary)}.pv_mCaretCol:hover{color:var(--dsw-alias-label-secondary)}.pv_mList{border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));margin-top:0;padding:6px 0 4px;display:flex;flex-direction:column}.pv_mFilter{flex:none;width:240px;box-sizing:border-box;padding:5px 24px 5px 12px;font:inherit;font-size:13px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:8px;outline:0;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-primary)}.pv_mFilter:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}.pv_fbox{position:relative;display:inline-flex;align-items:center;flex:none}.pv_fclear{position:absolute;right:2px;top:50%;transform:translateY(-50%);border:0;background:0 0;cursor:pointer;font:inherit;font-size:14px;line-height:1;padding:2px 6px;color:var(--dsw-alias-label-tertiary);border-radius:6px}.pv_fclear:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}.pv_tip{display:none;position:absolute;left:0;bottom:calc(100% + 6px);z-index:300;width:270px;padding:12px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.18));flex-direction:column;gap:6px}.pv_mRow:hover .pv_tip{display:flex}.pv_tipTitle{font-size:13px;font-weight:600;line-height:18px}.pv_tipRow{display:flex;gap:10px;font-size:12px;line-height:18px}.pv_tipLabel{flex:none;width:60px;color:var(--dsw-alias-label-tertiary)}.pv_tipDim{font-size:11px;color:var(--dsw-alias-label-tertiary)}.pv_tipCaps{flex:1;min-width:0;display:flex;gap:6px;flex-wrap:wrap;align-items:center}.pv_cap{font-size:11px;padding:1px 8px;border-radius:999px}.pv_capVision{color:#2f9e44;background:rgba(47,158,68,.12)}.pv_capVideo{color:#7c3aed;background:rgba(124,58,237,.12)}.pv_capReason{color:#b8860b;background:rgba(217,162,0,.15)}.pv_capDeclared{color:#0b7285;background:rgba(11,114,133,.12)}.pv_me{display:flex;flex-direction:column;gap:8px;padding:10px 0 4px;border-top:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12))}.pv_meHead{display:flex;align-items:center;gap:10px}.pv_meTitle{font-size:13px;font-weight:600;line-height:18px}.pv_meList{display:flex;flex-direction:column;max-height:320px;overflow:auto;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:10px}.pv_meHeadRow{display:grid;grid-template-columns:12px minmax(140px,1.6fr) 132px 64px 64px 24px;gap:6px;align-items:center;padding:5px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}.pv_meRow{display:grid;grid-template-columns:12px minmax(140px,1.6fr) 132px 64px 64px 24px;gap:6px;align-items:center;padding:5px 8px;font-size:12px;line-height:18px;border-bottom:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}.pv_meRow:last-child{border-bottom:0}.pv_meRowOff{opacity:.45}.pv_meCheck{margin:0;cursor:pointer}.pv_meHeadRow > span:first-child{display:flex;align-items:center;height:18px}.pv_meIdBox{display:inline-flex;align-items:center;gap:6px;min-width:0}.pv_meRow .pv_mId{width:auto;max-width:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}.pv_meNum{box-sizing:border-box;width:100%;padding:3px 8px;font:inherit;font-size:12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:7px;outline:0;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.03));color:var(--dsw-alias-label-primary)}.pv_meNum:focus{border-color:var(--dsw-alias-brand-primary,var(--dsw-alias-border-l2,rgba(0,0,0,.2)))}.pv_meRow .pv_mCtx,.pv_meRow .pv_mMax{width:auto;text-align:left;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);overflow:visible;white-space:normal}.pv_meRow .pv_mCaps{width:auto;justify-content:flex-start;flex-wrap:wrap}.pv_meRow .pv_iconBtn{padding:2px 4px;line-height:16px}.pv_meCap{display:inline-flex;align-items:center;gap:4px;cursor:pointer;user-select:none;font-size:11px;line-height:16px;padding:0 7px;border-radius:999px;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}.pv_meCap input{margin:0;cursor:pointer}.pv_capOff{opacity:.6;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1,rgba(0,0,0,.15))}.pv_meForm{display:flex;flex-direction:column;gap:6px;padding:10px 18px;margin-top:0;margin-bottom:4px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;background:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.02))}.pv_meFormTitle{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.pv_meForm .pv_field{min-width:0;flex:1}.pv_meFormCaps{display:inline-flex;align-items:center;gap:6px}.pv_meEffPool{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0;flex:1}.pv_meCap.pv_meEffOn{border-color:var(--dsw-alias-border-l1,rgba(0,0,0,.24));color:var(--dsw-alias-label-primary);background:var(--dsw-alias-fill-tertiary,rgba(0,0,0,.045))}.pv_usageLoading{flex-direction:row;align-items:center;justify-content:center;gap:8px;padding:22px 0;color:var(--dsw-alias-label-tertiary)}.pv_usageLoading .pv_spin{font-size:16px;color:var(--dsw-alias-label-secondary)}.pv_mEditRow{display:flex;align-items:center;padding:9px 0 16px}.pv_mBox > .pv_me{padding-bottom:4px}.pv_meActs{display:flex;align-items:center;gap:8px;margin-top:3px;margin-bottom:4px}.pv_mask{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.42);padding:24px}.pv_modal{width:min(520px,100%);box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:18px 20px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent,0 18px 48px rgba(0,0,0,.28))}.pv_modalTitle{font-size:14px;font-weight:600;line-height:20px}.pv_modalRow{display:flex;gap:12px;font-size:12px;line-height:19px}.pv_modalLabel{flex:none;width:80px;color:var(--dsw-alias-label-tertiary)}.pv_modalValue{flex:1 1 auto;min-width:0;word-break:break-word}.pv_modalWarn{font-size:12px;line-height:18px;padding:8px 10px;border-radius:8px;color:#a33;background:rgba(217,83,79,.12)}.pv_modalActs{display:flex;justify-content:flex-end;gap:10px;margin-top:2px}.pv_dangerBtn{color:#fff !important;background:#d9534f !important;border-color:#d9534f !important}.pv_dangerBtn:disabled{opacity:.6;cursor:default}";
		var tagId = "dsh-llm-provider/plan.css";
		/**
		* 挂样式：手写 style 标签（带 data-plugin-css 标记，重复调用幂等）。
		*
		* 不走官方 styles.insert：那个服务要 inject 'styles'，本插件没 inject 它，取 ctx.styles
		* 会直接抛（见 index.ts apply 里的注释）。手写标签是等价实现——静态插件运行时本来也只有
		* 这一条路。
		*/
		function installCss() {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-llm-provider";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		/** 测试环境标识：标题加「· 测试」后缀 + favicon 右下角盖橙色「测」角标。 */
		function markTestEnv() {
			try {
				if (document.title.indexOf(t("test.titleSuffix")) === -1) document.title = (document.title === "" ? "dsh" : document.title) + t("test.titleSuffix");
				var iconLink = document.querySelector("link[rel~=\"icon\"]");
				var img = new window.Image();
				img.onload = function() {
					var canvas = document.createElement("canvas");
					canvas.width = 64;
					canvas.height = 64;
					var g = canvas.getContext("2d");
					if (g !== null && g !== void 0) {
						g.drawImage(img, 0, 0, 64, 64);
						g.fillStyle = "#e8890c";
						g.beginPath();
						g.arc(46, 46, 20, 0, Math.PI * 2);
						g.fill();
						g.fillStyle = "#ffffff";
						g.font = "bold 24px sans-serif";
						g.textAlign = "center";
						g.textBaseline = "middle";
						g.fillText(t("test.faviconBadge"), 46, 48);
						setFavicon(canvas.toDataURL("image/png"));
						return;
					}
					setFavicon(void 0);
				};
				img.onerror = function() {
					setFavicon(void 0);
				};
				img.src = iconLink === null ? "/favicon.ico" : iconLink.href;
			} catch (cause) {}
		}
		/** 替换 favicon；dataUrl 为 undefined 时退到一个纯「测」字圆形 icon（文字也走字典）。 */
		function setFavicon(dataUrl) {
			try {
				var link = document.querySelector("link[rel~=\"icon\"]");
				if (link === null || link === void 0) {
					link = document.createElement("link");
					link.rel = "icon";
					document.head.appendChild(link);
				}
				if (dataUrl !== void 0) {
					link.href = dataUrl;
					return;
				}
				var svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><circle cx=\"32\" cy=\"32\" r=\"30\" fill=\"#e8890c\"/><text x=\"32\" y=\"43\" font-size=\"30\" font-weight=\"bold\" fill=\"#fff\" text-anchor=\"middle\">" + t("test.faviconBadge") + "</text></svg>";
				link.href = "data:image/svg+xml," + encodeURIComponent(svg);
			} catch (cause) {}
		}
		//#endregion
		//#region src/client/index.ts
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
		/**
		* 需要的客户端服务：座位注册表 + 会话。
		* `remote` / `remote.session` 是官方目录服务内部要用的：其方法被绑定到调用方上下文，
		* 少声明就会在 directoryFor 里报 "cannot get property remote.session without inject"。
		*/
		var inject = [
			"slots",
			"sessions",
			"remote",
			"remote.session",
			"locale"
		];
		function apply(ctx) {
			installCss();
			try {
				if (ctx.styles !== void 0 && ctx.styles !== null && typeof ctx.styles.insert === "function") recordDiagnostic("styles", "styles.insert");
				else recordDiagnostic("styles", "fallback-style-tag");
			} catch (cause) {
				recordDiagnostic("styles", "fallback-style-tag");
			}
			recordDiagnostic("applied", (/* @__PURE__ */ new Date()).toISOString());
			setT(localT);
			try {
				if (ctx.locale !== void 0 && ctx.locale !== null && typeof ctx.locale.register === "function") {
					try {
						ctx.locale.register("dsh-llm-provider", LOCAL_DICT);
					} catch (dup) {}
					if (typeof ctx.locale.bind === "function") {
						var bound = ctx.locale.bind("dsh-llm-provider");
						setT(function(key) {
							var value = bound(key);
							return value === key ? localT(key) : value;
						});
					}
				}
			} catch (cause) {
				var failure = cause;
				recordDiagnostic("locale", String(failure && failure.message ? failure.message : cause));
			}
			loadProviderStatus().then(function(status) {
				if (status && status.testMode === true) markTestEnv();
			}).catch(function() {});
			var modelDirectories;
			ctx.inject(["modelDirectories"], function(scope) {
				modelDirectories = scope.modelDirectories;
				recordDiagnostic("modelDirectories", modelDirectories === void 0 ? "undefined" : "ok");
			});
			var sessionsFace = ctx.sessions;
			recordDiagnostic("sessions", sessionsFace === void 0 ? "undefined" : "ok");
			/**
			* 座位/徽标的 inject 面：把官方目录服务包装成组件能用的只读数据 + 两个动作。
			* @param sessionId - 座位所在的会话。
			*/
			function directoryFace(sessionId) {
				if (modelDirectories === void 0 || typeof modelDirectories.directoryFor !== "function") {
					recordDiagnostic("face", {
						reason: "no-service",
						sessionId: String(sessionId)
					});
					return {
						sessionId,
						sessions: sessionsFace
					};
				}
				try {
					var directory = modelDirectories.directoryFor(sessionId);
					recordDiagnostic("face", {
						reason: "ok",
						sessionId: String(sessionId)
					});
					return {
						sessionId,
						sessions: sessionsFace,
						directory: directory.store,
						load: function() {
							directory.load().catch(function() {});
						},
						select: function(selection) {
							return directory.select(selection).then(function() {
								return true;
							}, function() {
								return false;
							});
						}
					};
				} catch (cause) {
					var failure = cause;
					recordDiagnostic("face", {
						reason: "threw",
						sessionId: String(sessionId),
						message: failure && failure.message ? String(failure.message) : String(cause)
					});
					return {
						sessionId,
						sessions: sessionsFace
					};
				}
			}
			ctx.slots.inject("conversation.input.model", function() {
				return ctx.slots.register({
					name: "conversation.input.model",
					id: "provider-model-seat",
					priority: -10,
					inject: directoryFace
				}, ModelSwitchSeat);
			});
			ctx.slots.inject("settings.section", function() {
				return ctx.slots.register({
					name: "settings.section",
					id: "provider",
					order: 15,
					label: function() {
						return t("nav");
					}
				}, ProviderSettingsSection);
			});
			ctx.inject(["commandUi"], function(scope) {
				registerModelCommand(scope);
			});
		}
		//#endregion
		exports.DEFAULT_EFFORT_LADDER = DEFAULT_EFFORT_LADDER;
		exports.EFFORT_FAMILY_LADDERS = EFFORT_FAMILY_LADDERS;
		exports.EFFORT_LEVELS = EFFORT_LEVELS;
		exports.LEGACY_PROVIDER_ALIASES = LEGACY_PROVIDER_ALIASES;
		exports.LOCAL_DICT = LOCAL_DICT;
		exports.PROVIDER_API_OPTIONS = PROVIDER_API_OPTIONS;
		exports.addModelRow = addModelRow;
		exports.aliasSelection = aliasSelection;
		exports.apply = apply;
		exports.buildEditRows = buildEditRows;
		exports.buildModelEditor = buildModelEditor;
		exports.capabilitiesKnown = capabilitiesKnown;
		exports.capabilityBadges = capabilityBadges;
		exports.capabilityKeysOf = capabilityKeysOf;
		exports.defaultEffortOf = defaultEffortOf;
		exports.detailsOfProvider = detailsOfProvider;
		exports.dropPlanAccount = dropPlanAccount;
		exports.effortsDraftOf = effortsDraftOf;
		exports.effortsToDeclared = effortsToDeclared;
		exports.headlineChips = headlineChips;
		exports.inject = inject;
		exports.isDefaultCatalogEquivalent = isDefaultCatalogEquivalent;
		exports.isProviderEditDirty = isProviderEditDirty;
		exports.isRouteConfigured = isRouteConfigured;
		exports.localT = localT;
		exports.lookupDetail = lookupDetail;
		exports.mergePlanAccount = mergePlanAccount;
		exports.modelListPayload = modelListPayload;
		exports.modelRow = modelRow;
		exports.modelTip = modelTip;
		exports.normalizeSelection = normalizeSelection;
		exports.onPlanChange = onPlanChange;
		exports.patchModelRow = patchModelRow;
		exports.payloadFromRows = payloadFromRows;
		exports.piAiBridgeRows = piAiBridgeRows;
		exports.piAiToggleState = piAiToggleState;
		exports.piAiUpstreamText = piAiUpstreamText;
		exports.prefillEffortsOf = prefillEffortsOf;
		exports.presetPickState = presetPickState;
		exports.providerEditForm = providerEditForm;
		exports.providerEditSaveOps = providerEditSaveOps;
		exports.providerSaveOps = providerSaveOps;
		exports.quotaShortOf = quotaShortOf;
		exports.quotaTextOf = quotaTextOf;
		exports.quotaTipOf = quotaTipOf;
		exports.reasoningTextOf = reasoningTextOf;
		exports.refreshFailure = refreshFailure;
		exports.relativeTime = relativeTime;
		exports.resetCountdownText = resetCountdownText;
		exports.resolveAddDefaults = resolveAddDefaults;
		exports.routeYamlOf = routeYamlOf;
		exports.setT = setT;
		exports.shortWindowLabel = shortWindowLabel;
		Object.defineProperty(exports, "t", {
			enumerable: true,
			get: function() {
				return t;
			}
		});
		exports.tf = tf;
		exports.validateModelRows = validateModelRows;
		exports.validateProviderEdit = validateProviderEdit;
		exports.withEffortLadder = withEffortLadder;
		return module.exports;
	}
});
