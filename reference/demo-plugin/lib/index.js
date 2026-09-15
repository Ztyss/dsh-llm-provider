/**
 * Host half of dsh-demo-plugin — a minimal object-form Cordis plugin.
 * `name` is the stable plugin identity, `inject` the services that must be
 * active before `apply` runs, `Config` the schema for the row's `config`.
 */
import Schema from '@deepseek-ai/schemastery'

export const name = 'demo-plugin'

/** Services this plugin needs before it activates. */
export const inject = ['webServer']

export const Config = Schema.object({
  greeting: Schema.string().default('hello from demo-plugin'),
})

export function apply(ctx, config) {
  ctx.logger?.('demo-plugin').info('demo-plugin host half active: %s', config.greeting)
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/demo-plugin/ping',
        handler: (_req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, greeting: config.greeting }))
        },
      }),
    'demo-plugin: /demo-plugin/ping route',
  )
}
