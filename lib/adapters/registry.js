/**
 * 适配器注册表：顺序即优先级（先匹配先用）。
 *
 * 加新 provider = 在 lib/adapters/ 下加一个文件（照 deepseek.js 抄结构），
 * 在这里 import + push 一行，完事。match() 认 provider id 或 baseURL。
 */
import deepseek from './deepseek.js'
import glm from './glm.js'
import kimiCoding from './kimi-coding.js'
import minimax from './minimax.js'
import moonshot from './moonshot.js'
import novita from './novita.js'
import opencodeGo from './opencode-go.js'
import openrouter from './openrouter.js'
import qwen from './qwen.js'
import siliconflow from './siliconflow.js'
import stepfun from './stepfun.js'
import volcengineArk from './volcengine-ark.js'
import zenmux from './zenmux.js'

export const adapters = [
  deepseek,
  kimiCoding,
  moonshot,
  glm,
  minimax,
  opencodeGo,
  zenmux,
  stepfun,
  siliconflow,
  openrouter,
  novita,
  volcengineArk,
  qwen,
]

/** 按 provider id（必要时兜 baseURL）找适配器。 */
export function findAdapter(providerId, baseUrl) {
  for (const adapter of adapters) {
    try {
      if (adapter.match(providerId, baseUrl)) return adapter
    } catch {
      /* match 里只做字符串判断，兜一层防手滑 */
    }
  }
  return undefined
}
