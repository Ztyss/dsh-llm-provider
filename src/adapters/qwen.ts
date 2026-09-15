/**
 * 没有公开额度接口的 provider（Qwen Token Plan）：不发请求，卡片上给控制台跳转链接。
 *
 * 为什么没有：阿里官方 FAQ 只让去百炼控制台看用量，官方 CLI 的 `bl usage token-plan`
 * 声明 auth: "console"（要控制台 token），sk-sp- 只是推理凭证，而且个人版条款禁止自动化调用。
 * 如果哪天找到可用接口，照 deepseek.js 的样子写一个新适配器替换这个兜底即可。
 */
import { account } from './shared.js'
import type { AccountStatus, AdapterQueryInput, BillingAdapter } from './shared.js'

export default {
  id: 'qwen-unsupported',
  label: 'Qwen Token Plan',
  match(providerId: string, baseUrl: string | undefined): boolean {
    if (/^qwen-token-plan|^qwen-sp|^token-plan/i.test(providerId)) return true
    return typeof baseUrl === 'string'
      && (baseUrl.includes('maas.aliyuncs.com') || baseUrl.includes('dashscope'))
  },

  async query({ id, displayName, baseUrl }: AdapterQueryInput): Promise<AccountStatus> {
    // consoleUrl 不在 AccountStatus 契约里（客户端渲染跳转链接读的是 websiteUrl，插件层还会兜底填），
    // 但删掉会改下发给浏览器的 JSON：这里只按"契约外字段"标注，运行时原样保留。
    const fields: Partial<AccountStatus> & { consoleUrl: string } = {
      authConfigured: true,
      baseUrl,
      // 无法程序化查询时的兜底：Provider 卡片直接给「查询余量」跳转链接，不再堆文字说明
      consoleUrl: 'https://bailian.console.aliyun.com/',
    }
    return account(id, displayName, 'unsupported', fields)
  },
} satisfies BillingAdapter
