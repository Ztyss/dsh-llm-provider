import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { name: string }

/**
 * 两段构建：
 *
 *   宿主端   src/*.ts → lib/*.js      1:1 转译，不打包（unbundle）。产物路径跟以前一样，
 *                                      package.json 的 exports、测试、profile 的 link 都不用改。
 *   浏览器端 src/client.ts → lib/client.js
 *                                      单文件 CJS，外面套 window.__ModuleLoader__.load 外壳——
 *                                      那三行就是官方的做法（见 reference/dsh-src/packages/
 *                                      client/tsdown.client.ts 的 banner/footer/intro）。
 *
 * lib/ 是产物，不入库；改完要 `npm run build`。
 */
export default defineConfig([
  {
    name: 'dsh-provider/host',
    entry: ['src/index.ts', 'src/adapters/run.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    unbundle: true,
    dts: false,
    clean: true,
    sourcemap: false,
    // 转译而不是打包：依赖保持 import，运行时装的是哪份就用哪份
    deps: { neverBundle: true },
  },
  {
    name: 'dsh-provider/client',
    entry: { client: 'src/client.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    // 宿主端先跑，这里不能清目录
    clean: false,
    sourcemap: false,
    // react 由加载器的模块表提供，其余全部内联
    deps: {
      neverBundle: ['react'],
      alwaysBundle: (specifier: string) => specifier !== 'react',
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
