/**
 * 极简 react 兼容层（本地版验证用，生产环境永远是官方 react）。
 *
 * 只实现插件用到的 API：createElement / useState / useEffect / useRef / useMemo / useCallback。
 * 按「树上的位置」保存 hooks（路径稳定即可跨重渲染保持状态），setState 触发整树重渲染，
 * effect 在渲染后按 deps 变化执行。够把真实 lib/client.js 渲进 DOM 看效果，不是通用实现。
 */
(function () {
  var instances = new Map()
  var current = null
  var renderRootFn = null
  var pendingEffects = []
  var renderScheduled = false

  function instanceAt(path) {
    var found = instances.get(path)
    if (found === undefined) {
      found = { hooks: [], index: 0, effects: [], path: path }
      instances.set(path, found)
    }
    return found
  }

  function scheduleRender() {
    if (renderScheduled) return
    renderScheduled = true
    setTimeout(function () {
      renderScheduled = false
      if (renderRootFn !== null) renderRootFn()
    }, 0)
  }

  function depsChanged(prev, next) {
    if (prev === undefined) return true
    if (next === undefined) return true
    if (prev.length !== next.length) return true
    for (var i = 0; i < prev.length; i += 1) if (prev[i] !== next[i]) return true
    return false
  }

  var React = {
    createElement: function (type, props) {
      var children = []
      for (var i = 2; i < arguments.length; i += 1) children.push(arguments[i])
      return { type: type, props: props === null || props === undefined ? {} : props, children: children }
    },
    useState: function (initial) {
      var self = current
      var index = self.index++
      if (self.hooks.length <= index) self.hooks[index] = typeof initial === 'function' ? initial() : initial
      var setter = function (next) {
        var value = typeof next === 'function' ? next(self.hooks[index]) : next
        if (value === self.hooks[index]) return
        self.hooks[index] = value
        scheduleRender()
      }
      return [self.hooks[index], setter]
    },
    useEffect: function (fn, deps) {
      var self = current
      var index = self.index++
      var slot = self.effects[index]
      if (slot === undefined || depsChanged(slot.deps, deps)) {
        self.effects[index] = { deps: deps, cleanup: slot === undefined ? undefined : slot.cleanup }
        pendingEffects.push({ self: self, index: index, fn: fn })
      }
    },
    useMemo: function (fn) { return fn() },
    useCallback: function (fn) { return fn },
    useRef: function (initial) {
      var self = current
      var index = self.index++
      if (self.hooks.length <= index) self.hooks[index] = { current: initial }
      return self.hooks[index]
    },
    Fragment: '#fragment',
  }

  var ATTRS = {
    className: 'class', htmlFor: 'for', tabIndex: 'tabindex', readOnly: 'readonly',
    ariaExpanded: 'aria-expanded', inputMode: 'inputmode', value: 'value', checked: 'checked',
  }

  function setStyle(el, style) {
    for (var key in style) {
      if (style[key] === null || style[key] === undefined) continue
      var name = key.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase() })
      el.style.setProperty(name, String(style[key]))
    }
  }

  function setProps(el, props) {
    for (var key in props) {
      if (key === 'children' || key === 'key') continue
      var value = props[key]
      if (key === 'style') { if (value !== null && typeof value === 'object') setStyle(el, value); continue }
      if (key === 'className') { el.setAttribute('class', String(value)); continue }
      if (key === 'value') { if (el.value !== String(value)) el.value = String(value); continue }
      if (key === 'checked') { el.checked = value === true; continue }
      if (key === 'disabled') { el.disabled = value === true; continue }
      if (key === 'onClick' || key === 'onChange' || key === 'onKeyDown' || key === 'onInput') {
        if (typeof value !== 'function') continue
        var eventName = key === 'onClick' ? 'click' : (key === 'onKeyDown' ? 'keydown' : (key === 'onInput' ? 'input' : 'change'))
        var handler = el.__dshHandlers === undefined ? (el.__dshHandlers = {}) : el.__dshHandlers
        if (handler[key] !== undefined) el.removeEventListener(eventName, handler[key])
        handler[key] = value
        el.addEventListener(eventName, value)
        continue
      }
      if (value === null || value === undefined || value === false) continue
      var attr = ATTRS[key] === undefined ? key : ATTRS[key]
      el.setAttribute(attr, value === true ? '' : String(value))
    }
  }

  function renderNode(node, path, index) {
    if (node === null || node === undefined || node === false || node === true) return null
    if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node))
    if (Array.isArray(node)) {
      var frag = document.createDocumentFragment()
      for (var i = 0; i < node.length; i += 1) {
        var child = renderNode(node[i], path + '[]' + String(i), i)
        if (child !== null) frag.appendChild(child)
      }
      return frag
    }
    var childPath = path + '/' + String(index)
    if (typeof node.type === 'function') {
      var self = instanceAt(childPath)
      var previous = current
      current = self
      self.index = 0
      var out
      try {
        out = node.type(node.props)
      } finally {
        current = previous
      }
      return renderNode(out, childPath, 0)
    }
    if (node.type === '#fragment') {
      return renderNode(node.children, childPath, 0)
    }
    var el = document.createElement(String(node.type))
    if (node.props !== undefined) setProps(el, node.props)
    var kids = node.children === undefined ? [] : node.children
    for (var k = 0; k < kids.length; k += 1) {
      var rendered = renderNode(kids[k], childPath, k)
      if (rendered !== null) el.appendChild(rendered)
    }
    return el
  }

  function flushEffects() {
    var queue = pendingEffects
    pendingEffects = []
    for (var i = 0; i < queue.length; i += 1) {
      var entry = queue[i]
      var slot = entry.self.effects[entry.index]
      if (slot !== undefined && typeof slot.cleanup === 'function') {
        try { slot.cleanup() } catch (cause) { /* 清理失败不影响后续 */ }
      }
      try {
        var cleanup = entry.fn()
        if (slot !== undefined) slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined
      } catch (cause) {
        console.error('[harness] effect 抛错:', cause)
      }
    }
  }

  /** 把组件挂到容器上；返回重渲染函数。 */
  window.__mount = function (Component, container) {
    var tree = null
    function render() {
      var node = { type: Component, props: {}, children: [] }
      tree = renderNode(node, 'root', 0)
      container.innerHTML = ''
      if (tree !== null) container.appendChild(tree)
      flushEffects()
      if (window.__afterRender !== undefined) window.__afterRender()
    }
    renderRootFn = render
    render()
    return render
  }

  window.__React = React
})()
