/**
 * 诊断：把关键接线状态挂到 window 上，排查「某个座位没生效」时一眼看到原因。
 */
import type { AnyRecord } from '../types.js'

export function recordDiagnostic(key: string, value: unknown): void {
  try {
    var holder = window as unknown as AnyRecord
    var bucket = holder.__dshProvider as AnyRecord | undefined
    if (bucket === undefined) bucket = holder.__dshProvider = {}
    bucket[key] = value
  } catch (cause) {
    /* 没有 window 就算了 */
  }
}
