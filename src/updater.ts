/**
 * pi-ai 下载入口——**已全部停用**。
 *
 * ## 为什么整块停掉
 *
 * 本文件原先负责「盯 npm 上游 → 下载新版本 → 装进 `vendor/pi-ai/<v>/` → 体检 → 标记待生效」。
 * 按用户诉求，pi-ai **只使用 DSH 自带那一份**，所以这条链路整个关闭：
 *
 *   1. **不产生重复副本**：一份 pi-ai 解压带依赖闭包约 80 MB（issue #4 实测插件目录
 *      一度 260 MB，而代码只有 220 KB），而副本带来的"跟进上游"收益是用户明确不要的；
 *   2. **不留下危险的写路径**：这条链路里有 `rmSync(target, { recursive: true })`
 *      与 `rmSync(dir, { recursive: true })`（清旧版本）。2026-09-18 的事故说明，
 *      宿主的 pi-ai 一旦被清空，DSH 会在 boot 阶段整体加载失败，**卸载插件也救不回来**。
 *      既然策略改为"只读使用宿主那份"，这两处递归删除已无存在必要，直接连同调用方移除；
 *   3. **不让版本出现分歧**：桥接直接指向宿主那份，界面读的、桥接跑的是同一份 pi-ai。
 *
 * ## 现在的行为
 *
 * - {@link checkAndUpdate}：`/provider/update` 路由仍可被调用（前端可能还挂着按钮），
 *   但它**不触网、不写盘**，只回一句"已停用"；
 * - {@link startBackgroundCheck}：启动时不再有任何后台检查。
 *
 * 宿主 pi-ai 的检测、使用与恢复指引在 `pi-ai-source.ts`（本模块不再持有任何写路径）。
 */
import type { Logger } from './types.js'

/** 一次「检查 + 更新」的结果（`/provider/update` 的响应体形状保持不变）。 */
export interface UpdateResult {
  checkedAt: string
  latest: string | undefined
  installed: string | undefined
  applied: boolean
  compatible: boolean | undefined
  error: string | undefined
}

/**
 * 检查 + 更新——已停用，等价于空操作。
 *
 * 之所以保留而不是让路由返回 404：老前端、脚本或用户书签可能仍会打这个接口，
 * 回一句明确的"已停用"比一个莫名其妙的 404 更有用。
 * @param log - 进度输出（插件日志）。
 * @returns 固定结果：什么都没做，也没有失败。
 */
export async function checkAndUpdate(log: (line: string) => void = () => {}): Promise<UpdateResult> {
  log('pi-ai 更新已停用：只使用 DSH 自带那一份')
  return {
    checkedAt: new Date().toISOString(),
    latest: undefined,
    installed: undefined,
    applied: false,
    compatible: undefined,
    error: undefined,
  }
}

/**
 * 启动时的后台检查——已停用。
 *
 * 旧行为：每 6 小时查一次 npm，有新版本就下载到 `vendor/pi-ai/<v>/`。
 * 现在只记一行日志，不做任何网络或磁盘操作。
 * @param logger - 宿主日志器。
 */
export function startBackgroundCheck(logger: Logger | undefined): void {
  logger?.info?.('pi-ai 自动更新已停用：只使用 DSH 自带那一份')
}
