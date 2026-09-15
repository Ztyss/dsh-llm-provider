/**
 * i18n：本地字典兜底 + 可变翻译函数。
 *
 * `t` 是可变导出（live binding）：apply 里经 {@link setT} 换成官方 locale 的 bind
 * 结果，其余模块 `import { t }` 读到的一直是当前那份。
 */

/** i18n 本地字典：注册失败/服务缺席时的兜底（也用于缺键回退）。语言从 <html lang> 判断。 */
export var LOCAL_DICT: Record<'zh' | 'en', Record<string, string>> = {
  zh: { nav: '模型服务', tabProviders: '服务商', addProvider: '＋ 添加供应商' },
  en: { nav: 'Provider', tabProviders: 'Provider', addProvider: '＋ Add Provider' },
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

export { localT }
