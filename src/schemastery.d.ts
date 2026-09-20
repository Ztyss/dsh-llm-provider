/**
 * @deepseek-ai/schemastery 的本地类型垫片（只为 `npm run typecheck`）。
 *
 * 为什么要有：宿主 app 的 node_modules 是打包时剥过 `.md` / `.d.ts` 的（对照注册表：
 * schemastery@3.18.2 应 8 个文件、宿主只剩 6；pi-ai 应 750、宿主 595，`.d.ts`/`.md` 计数都是 0；
 * cordis 甚至留着 `*.d.ts.map` 却没有 `*.d.ts`），而仓库的 dev 软链
 * `node_modules/@deepseek-ai` 恰好指向那份 → `tsc --noEmit` 报 TS7016「找不到声明文件」。
 *
 * 注意：ambient 声明会遮蔽同名的真实类型，所以这里只声明本仓库实际用到的最小面
 * （`Schema.object`，见 index.ts 的 `Config` 兜底分支）；`Config` 的另一分支本来就是
 * `unknown`（bridge.ts 的 `BridgePluginModule.Config?: unknown`），不给它编造更丰富的类型。
 */
declare module '@deepseek-ai/schemastery' {
  const Schema: {
    object(shape: Record<string, unknown>): unknown
  }
  export default Schema
}
