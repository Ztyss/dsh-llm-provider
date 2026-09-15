/**
 * 浏览器端纯格式化/匹配工具：不碰 react、不碰网络，离线可测。
 * 模型座位与设置页共用；文案口径见各函数注释。
 */
import type { AnyRecord } from '../types.js'
import type { HeadlineChip, PlanAccount } from './types.js'

/** 上下文窗口的人性化显示：1048576 → 1.0M，262144 → 262K（K/M 按 1000 进）。 */
export function formatContext(value: unknown): string | undefined {
  var n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  if (n >= 1e6) {
    var m = n / 1e6
    return (Number.isInteger(m) ? String(m) : m.toFixed(1)) + 'M'
  }
  if (n >= 1e3) return Math.round(n / 1e3) + 'K'
  return String(n)
}

/** 思考强度档位显示名：不翻译，原始档位首字母大写（low→Low、xhigh→Xhigh）。 */
export function effortLabel(effort: unknown): string | undefined {
  if (typeof effort !== 'string' || effort === '') return undefined
  return effort.charAt(0).toUpperCase() + effort.slice(1)
}

/**
 * 模型没显式选强度时的落点：只认目录里声明的默认档（官方同款：
 * `current.reasoningEffort ?? reasoning.defaultEffort`）。
 * 早先还拿档位表首档兜底，那等于替用户选了一个他没选过的档位——
 * 目录没声明默认档时该显示「服务商默认」，让服务商自己决定。
 */
export function defaultEffortOf(model: unknown): string | undefined {
  if (model === null || typeof model !== 'object') return undefined
  var reasoning = (model as AnyRecord).reasoning
  if (reasoning === undefined) return undefined
  var value = (reasoning as AnyRecord).default
  return typeof value === 'string' ? value : undefined
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
export function reasoningTextOf(chosenEffort: unknown, modelReasoning: unknown, providerDefault: unknown): string | undefined {
  var chosen = effortLabel(chosenEffort)
  if (modelReasoning === undefined || modelReasoning === null) return chosen
  if (chosen !== undefined) return chosen
  var fallback = effortLabel(providerDefault)
  return fallback === undefined ? '服务商默认' : fallback
}

/** 相对时间（上次刷新指示器）：<10s 显示刚刚，<1min 显示 <1min，之后按分钟精度 m / h+m / d。 */
export function relativeTime(iso: unknown): string {
  if (typeof iso !== 'string' || iso === '') return ''
  var time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  var seconds = Math.max(0, Math.round((Date.now() - time) / 1000))
  if (seconds < 10) return '刚刚'
  if (seconds < 60) return '<1min'
  var minutes = Math.floor(seconds / 60)
  if (minutes < 60) return String(minutes) + 'm'
  var hours = Math.floor(minutes / 60)
  var min = minutes % 60
  if (hours < 24) return min > 0 ? String(hours) + 'h' + String(min) + 'm' : String(hours) + 'h'
  return String(Math.floor(hours / 24)) + 'd'
}

export function toneColor(percent: unknown): string {
  if (typeof percent !== 'number') return '#22a06b'
  if (percent <= 10) return '#d9534f'
  if (percent <= 30) return '#d9a300'
  return '#22a06b'
}

/** 一个账户里最紧的窗口剩余百分比。 */
export function worstPercent(account: PlanAccount): number | undefined {
  var worst: number | undefined
  var windows = Array.isArray(account.windows) ? account.windows : []
  for (var i = 0; i < windows.length; i += 1) {
    var percent = windows[i].percentLeft
    if (typeof percent !== 'number') continue
    if (worst === undefined || percent < worst) worst = percent
  }
  return worst
}

export function dotClass(account: PlanAccount | undefined | null): string {
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

export function shortName(account: PlanAccount): string {
  return account.displayName === undefined ? account.id : account.displayName
}

/** 徽标上的短字：优先余额，其次最紧窗口的剩余百分比。 */
export function summaryOf(account: PlanAccount | undefined | null): string {
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

/**
 * 余量短文案（模型面板的 provider chip 与模型座位触发器共用）：最紧窗口的剩余百分比，
 * 没有窗口就看钱包余额。查不了 / 没配 key 时不给数字——那种情况由指示点颜色表达。
 */
export function quotaShortOf(account: PlanAccount | undefined | null): string | undefined {
  if (account === undefined || account === null) return undefined
  var percent = worstPercent(account)
  if (percent !== undefined) return String(percent) + '%'
  var balances = Array.isArray(account.balances) ? account.balances : []
  return balances.length > 0 ? balances[0].value : undefined
}

/** 一行里的余额短文案（给模型行/过滤 chip 复用）。 */
export function quotaTextOf(account: PlanAccount | undefined | null): string | undefined {
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

/** 窗口短名（卡片头部摘要）：5 小时窗口→5h，每周/订阅周期→7d（对齐 CC Switch 的 7 天口径）。 */
export function shortWindowLabel(name: unknown): string {
  var text = String(name ?? '')
  if (text.indexOf('5 小时') !== -1 || text.indexOf('5小时') !== -1) return '5h'
  if (text.indexOf('每') !== -1 || text.indexOf('订阅') !== -1 || text.indexOf('周') !== -1) return '7d'
  return text === '' ? '窗口' : text.slice(0, 4)
}

/** 重置倒计时压缩格式（最多两个单位，零尾不显示）：34m / 5h / 5h33m / 3d5h / 4d。 */
export function resetCountdownText(iso: unknown): string {
  if (typeof iso !== 'string' || iso === '') return ''
  var time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  var delta = time - Date.now()
  if (delta <= 0) return '即将重置'
  var minutes = Math.round(delta / 60000)
  if (minutes < 1) return '即将重置'
  if (minutes < 60) return String(minutes) + 'm'
  var hours = Math.floor(minutes / 60)
  var min = minutes % 60
  if (hours < 24) return min > 0 ? String(hours) + 'h' + String(min) + 'm' : String(hours) + 'h'
  var days = Math.floor(hours / 24)
  var restH = hours % 24
  return restH > 0 ? String(days) + 'd' + String(restH) + 'h' : String(days) + 'd'
}

/** provider chip 悬停详情：各窗口余量 + 重置倒计时，或余额明细。 */
export function quotaTipOf(account: PlanAccount | undefined | null): string | undefined {
  if (account === undefined || account === null) return undefined
  if (account.error !== undefined) return '查询失败：' + String(account.error)
  var parts: string[] = []
  var windows = Array.isArray(account.windows) ? account.windows : []
  for (var i = 0; i < windows.length; i += 1) {
    if (typeof windows[i].percentLeft !== 'number') continue
    var text = shortWindowLabel(windows[i].window) + '余量 ' + String(windows[i].percentLeft) + '%'
    if (windows[i].resetAt !== undefined && windows[i].resetAt !== '') {
      text += ' ◷ ' + resetCountdownText(windows[i].resetAt)
    }
    parts.push(text)
  }
  var balances = Array.isArray(account.balances) ? account.balances : []
  for (var j = 0; j < balances.length; j += 1) parts.push(balances[j].label + ' ' + balances[j].value)
  return parts.length > 0 ? parts.join(' ｜ ') : undefined
}

/** 卡片头部摘要：直给最关键信息——coding plan 显示各窗口余量，API 显示余额。
 *  顺序：5 小时窗在前、订阅周期在后，两组之间带分割线。 */
export function headlineChips(account: PlanAccount | undefined | null): HeadlineChip[] {
  if (account === undefined || account === null) return [{ text: '无数据', percent: undefined }]
  if (account.authConfigured === false) return [{ text: '未配置 key', percent: 0 }]
  if (account.error !== undefined) return [{ text: '查询失败', percent: 0 }]
  if (account.kind === 'unsupported') return []
  if (account.kind === 'unknown-provider') return [{ text: '无适配器', percent: undefined }]
  var windows = Array.isArray(account.windows) ? account.windows : []
  var fiveHour: HeadlineChip[] = []
  var others: HeadlineChip[] = []
  for (var i = 0; i < windows.length; i += 1) {
    if (typeof windows[i].percentLeft !== 'number') continue
    var chip: HeadlineChip = {
      label: shortWindowLabel(windows[i].window),
      text: String(windows[i].percentLeft) + '%',
      percent: windows[i].percentLeft,
      reset: windows[i].resetAt,
    }
    if (/5\s*小时/.test(String(windows[i].window))) fiveHour.push(chip)
    else others.push(chip)
  }
  var chips: HeadlineChip[] = []
  for (var f = 0; f < fiveHour.length; f += 1) chips.push(fiveHour[f])
  if (fiveHour.length > 0 && others.length > 0) chips.push({ sep: true })
  for (var o = 0; o < others.length; o += 1) chips.push(others[o])
  if (chips.length > 0) return chips
  var balances = Array.isArray(account.balances) ? account.balances : []
  if (balances.length > 0) chips.push({ text: String(balances[0].value), percent: undefined })
  if (chips.length > 0) return chips
  return [{ text: summaryOf(account), percent: undefined }]
}

/** 链接显示文本：去掉协议和末尾斜杠。 */
export function linkTextOf(url: unknown): string {
  return String(url).replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** 模型过滤的模糊匹配：子串 → 缩写子序列（ds→deepseek）→ 编辑距离容错（deapseek→deepseek）。 */
export function fuzzyMatch(query: unknown, text: unknown): boolean {
  var q = String(query).toLowerCase().trim()
  if (q === '') return true
  var words = q.split(/\s+/)
  for (var w = 0; w < words.length; w += 1) {
    if (!fuzzyWord(words[w], String(text).toLowerCase())) return false
  }
  return true
}

function fuzzyWord(word: string, haystack: string): boolean {
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

function isSubsequence(needle: string, haystack: string): boolean {
  var i = 0
  for (var j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (haystack.charAt(j) === needle.charAt(i)) i += 1
  }
  return i === needle.length
}

/** Damerau-Levenshtein 编辑距离（含相邻交换），O(n·m)——词都很短，无所谓。 */
function damerauLevenshtein(a: string, b: string): number {
  var la = a.length
  var lb = b.length
  if (Math.abs(la - lb) > 2) return 99
  var d: number[][] = []
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
