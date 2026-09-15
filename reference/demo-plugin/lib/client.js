/**
 * Browser half of dsh-demo-plugin — a plain classic script, no bundler.
 * The shell's lazy-CJS module table registers this factory; every side effect
 * must live INSIDE the factory closure so it runs at materialization.
 *
 * `react` and `react/jsx-runtime` are shell "seed words" (see
 * @deepseek-ai/dsh-web-frontend dist: staticModules), so `require()` resolves
 * them at runtime with no build step.
 */
window.__ModuleLoader__.load({
  id: 'dsh-demo-plugin',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')
    var jsxRuntime = require('react/jsx-runtime')

    /** Cordis service names this client plugin needs before apply() runs. */
    var inject = ['slots', 'remote']

    function DemoWidget(props) {
      var state = react.useState(null)
      var data = state[0]
      var setData = state[1]
      react.useEffect(function () {
        var cancelled = false
        fetch('/demo-plugin/ping')
          .then(function (r) { return r.json() })
          .then(function (v) { if (!cancelled) setData(v) })
          .catch(function () {})
        return function () { cancelled = true }
      }, [])
      return jsxRuntime.jsx('span', {
        style: { fontSize: 12, opacity: 0.7, padding: '0 6px' },
        children: data === null ? 'demo…' : data.greeting,
      })
    }

    function apply(ctx) {
      // 'shell.overlay' is kind:list, scope:root — always rendered (no session
      // needed), so this also proves the render path without opening a session.
      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register(
          { name: 'shell.overlay', id: 'demo-plugin', order: 50 },
          DemoWidget,
        )
      })
      // The composer-area seat (kind:list, no shipped occupants) for reference:
      // it renders only once a session is selected.
      ctx.slots.inject('conversation.input.right', function () {
        return ctx.slots.register(
          { name: 'conversation.input.right', id: 'demo-plugin', order: 50 },
          DemoWidget,
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    exports.DemoWidget = DemoWidget
    return module.exports
  },
})
