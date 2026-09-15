import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * DSH 数据目录（`$DSH_HOME`，默认 `~/.dsh`）。
 *
 * provider 路由从 `settings.section('llm-pi-ai')` 读——它直接拿 dsh 解析好的文档，
 * 不要求命名空间已注册。所以这个模块只负责目录解析。
 */

/** DSH 数据目录：跟 dsh-home-paths 一致，DSH_HOME 优先。 */
export function resolveDshHome(): string {
  const fromEnv = process.env.DSH_HOME
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : join(homedir(), '.dsh')
}
