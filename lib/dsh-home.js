import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * DSH 数据目录（`$DSH_HOME`，默认 `~/.dsh`）。
 *
 * 以前这个模块还兼一份"直接解析 settings.yaml"的活儿：那时读 provider 列表用的是
 * `settings.get('llm-pi-ai')`，而那个命名空间在某些情况下没注册（llm-pi-ai 自己 apply
 * 时 registerConfigurableProviders 拿到空列表会抛，后面那句 installSection 就没跑到），
 * 于是只好自己按缩进手写了一个 YAML 解析器（93 行）。
 *
 * 2026-09-15 换成 `settings.section('llm-pi-ai')`——它直接读 dsh 解析好的文档，不要求
 * 命名空间注册，解析器整个删掉。这个文件因此只剩目录解析。
 */

/** DSH 数据目录：跟 dsh-home-paths 一致，DSH_HOME 优先。 */
export function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : join(homedir(), '.dsh')
}
