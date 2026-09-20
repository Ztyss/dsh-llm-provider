/**
 * 极简 react 兼容层（本地版验证用，生产环境永远是官方 react）。
 *
 * 只实现插件用到的 API：createElement / useState / useEffect / useRef / useMemo / useCallback。
 * v2：渲染从「整树重建」改为「最小 reconciliation」——同位置、同类型且 key 相同的 DOM 节点
 * 就地更新（className/style/属性原位改写），类型或 key 不同才重建节点。
 *
 * 为什么要改：真实 react 会复用同位置同类型的 DOM 节点、只改 props。对带 CSS transition 的
 * class 而言，这是可见行为的一部分——例如条件分支两边都是 div 时，切换分支会在同一个 div 上
 * 加/去 class，border-color 会从初始 currentColor 过渡到目标色（即「边框先黑一下再恢复」的
 * 闪烁）。v1 每次渲染都 innerHTML='' 整树重建，transition 永远不会在已有节点上触发，
 * 这一类问题在 harness 里天生复现不了（桥接页边框闪烁漏测的根因）。
 *
 * hooks 仍按「树上的位置」保存（路径稳定即可跨重渲染保持状态），setState 触发整树重渲染，
 * effect 在渲染后按 deps 变化执行。路径规则与 v1 一致：元素子节点 path+'/'+i，
 * 数组项 path+'[]'+i，组件输出为其自身节点位置。
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

  /** 就地更新属性：先清掉 old 有而 new 没有的，再套用 new（事件处理器重绑、style 整体重设）。 */
  function installProps(el, oldProps, newProps) {
    if (oldProps !== null && oldProps !== undefined) {
      for (var oldKey in oldProps) {
        if (oldKey === 'children' || oldKey === 'key' || oldKey === 'style') continue
        if (/^on[A-Z]/.test(oldKey)) continue
        var missing = newProps === null || newProps === undefined || newProps[oldKey] === undefined
        if (!missing) continue
        if (oldKey === 'className') { el.removeAttribute('class'); continue }
        if (oldKey === 'value' || oldKey === 'checked' || oldKey === 'disabled') continue
        var attr = ATTRS[oldKey] === undefined ? oldKey : ATTRS[oldKey]
        el.removeAttribute(attr)
      }
    }
    if (newProps === null || newProps === undefined) return
    for (var key in newProps) {
      if (key === 'children' || key === 'key') continue
      var value = newProps[key]
      if (key === 'style') {
        el.removeAttribute('style')
        if (value !== null && typeof value === 'object') setStyle(el, value)
        continue
      }
      if (key === 'className') { el.setAttribute('class', String(value)); continue }
      if (key === 'value') { if (el.value !== String(value)) el.value = String(value); continue }
      if (key === 'checked') { el.checked = value === true; continue }
      if (key === 'disabled') { el.disabled = value === true; continue }
      if (/^on[A-Z]/.test(key)) {
        if (typeof value !== 'function') continue
        var eventName = key === 'onClick' ? 'click' : (key === 'onKeyDown' ? 'keydown' : (key === 'onInput' ? 'input' : 'change'))
        var handler = el.__dshHandlers === undefined ? (el.__dshHandlers = {}) : el.__dshHandlers
        if (handler[key] !== undefined) el.removeEventListener(eventName, handler[key])
        handler[key] = value
        el.addEventListener(eventName, value)
        continue
      }
      if (value === null || value === undefined || value === false) continue
      var attrName = ATTRS[key] === undefined ? key : ATTRS[key]
      el.setAttribute(attrName, value === true ? '' : String(value))
    }
  }

  // ---------- 最小 reconciliation ----------
  // rec（节点档案）种类：text{dom} / dom{tag,key,props,dom} / group{items} / comp{fn,key,out,dom}
  // 每个 DOM 元素用 __dshKids 按原始子节点下标存 rec，null 项也占位，保证组件/hook 身份稳定。

  function keyOf(node) {
    var k = node && node.props ? node.props.key : undefined
    return k === undefined || k === null ? null : String(k)
  }

  function hasDom(node) {
    return !(node === null || node === undefined || node === false || node === true)
  }

  function sameShape(rec, node) {
    if (rec === null || rec === undefined) return false
    if (typeof node === 'string' || typeof node === 'number') return rec.kind === 'text'
    if (Array.isArray(node) || (node && node.type === '#fragment')) return rec.kind === 'group'
    if (typeof node.type === 'function') return rec.kind === 'comp' && rec.fn === node.type && keyOf(node) === rec.key
    return rec.kind === 'dom' && rec.tag === String(node.type).toUpperCase() && keyOf(node) === rec.key
  }

  function collectDoms(recs, out) {
    for (var i = 0; i < recs.length; i += 1) {
      var rec = recs[i]
      if (rec === null || rec === undefined) continue
      if (rec.kind === 'group') { collectDoms(rec.items, out); continue }
      if (rec.kind === 'comp') { if (rec.out !== null) collectDoms([rec.out], out); continue }
      if (rec.dom !== null) out.push(rec.dom)
    }
  }

  /** 让 el 的实际子节点顺序与 recs 展开结果一致（新节点插入、旧节点移动都走 insertBefore）。 */
  function orderChildren(el, recs) {
    var expected = []
    collectDoms(recs, expected)
    var anchor = el.firstChild
    for (var i = 0; i < expected.length; i += 1) {
      var want = expected[i]
      if (want === anchor) { anchor = anchor.nextSibling; continue }
      el.insertBefore(want, anchor)
    }
  }

  function destroyRec(rec, el) {
    if (rec === null || rec === undefined) return
    if (rec.kind === 'group') {
      for (var i = 0; i < rec.items.length; i += 1) destroyRec(rec.items[i], el)
      return
    }
    if (rec.kind === 'comp') { destroyRec(rec.out, el); return }
    if (rec.dom !== null && rec.dom.parentNode === el) el.removeChild(rec.dom)
  }

  /**
   * 把 node 同步进 slot（旧 rec，可为 null），返回新 rec（无 DOM 时返回 null）。
   * el 是挂载父元素；path 沿用 v1 规则保证 hook 身份稳定。
   */
  function reconcile(node, slot, path, index, el) {
    if (!hasDom(node)) { destroyRec(slot, el); return null }
    if (typeof node === 'string' || typeof node === 'number') {
      var text = String(node)
      if (sameShape(slot, node)) {
        if (slot.dom.data !== text) slot.dom.data = text
        return slot
      }
      destroyRec(slot, el)
      return { kind: 'text', dom: document.createTextNode(text) }
    }
    if (Array.isArray(node) || node.type === '#fragment') {
      var items = Array.isArray(node) ? node : node.children
      if (sameShape(slot, node)) {
        syncGroupItems(node, slot, items, path, index, el)
        return slot
      }
      destroyRec(slot, el)
      var fresh = { kind: 'group', items: [] }
      syncGroupItems(node, fresh, items, path, index, el)
      return fresh
    }
    if (typeof node.type === 'function') {
      var childPath = path + '/' + String(index)
      if (sameShape(slot, node)) {
        renderCompInto(node, slot, childPath, el)
        return slot
      }
      destroyRec(slot, el)
      var compRec = { kind: 'comp', fn: node.type, key: keyOf(node), out: null, dom: null }
      renderCompInto(node, compRec, childPath, el)
      return compRec
    }
    // 普通 DOM 元素
    if (sameShape(slot, node)) {
      installProps(slot.dom, slot.props, node.props)
      slot.props = node.props
      syncChildren(slot.dom, node.children, path, el)
      return slot
    }
    destroyRec(slot, el)
    var dom = document.createElement(String(node.type))
    if (node.props !== undefined) installProps(dom, null, node.props)
    var rec = { kind: 'dom', tag: String(node.type).toUpperCase(), key: keyOf(node), props: node.props, dom: dom }
    syncChildren(dom, node.children, path, el)
    return rec
  }

  function syncGroupItems(node, rec, items, path, index, el) {
    var base = Array.isArray(node) ? path + '[]' : path + '/'
    var old = rec.items
    for (var i = 0; i < items.length; i += 1) {
      rec.items[i] = reconcile(items[i], old !== undefined && i < old.length ? old[i] : null, base + String(i), i, el)
    }
    if (old !== undefined) {
      for (var j = items.length; j < old.length; j += 1) destroyRec(old[j], el)
    }
    rec.items.length = items.length
  }

  function renderCompInto(node, rec, childPath, el) {
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
    rec.out = reconcile(out, rec.out, childPath, 0, el)
    rec.dom = rec.out === null ? null : rec.out.dom
  }

  function syncChildren(el, kids, basePath, elOwner) {
    var list = kids === undefined || kids === null ? [] : kids
    var oldRecs = el.__dshKids === undefined ? [] : el.__dshKids
    var recs = new Array(list.length)
    for (var i = 0; i < list.length; i += 1) {
      recs[i] = reconcile(list[i], i < oldRecs.length ? oldRecs[i] : null, basePath + '/' + String(i), i, el)
    }
    for (var j = list.length; j < oldRecs.length; j += 1) destroyRec(oldRecs[j], el)
    el.__dshKids = recs
    orderChildren(el, recs)
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

  /** 把组件挂到容器上；返回重渲染函数。重渲染走最小 reconciliation，不整树重建。 */
  window.__mount = function (Component, container) {
    var rootRec = null
    function render() {
      var node = { type: Component, props: {}, children: [] }
      rootRec = reconcile(node, rootRec, 'root', 0, container)
      orderChildren(container, rootRec === null ? [] : [rootRec])
      flushEffects()
      if (window.__afterRender !== undefined) window.__afterRender()
    }
    renderRootFn = render
    render()
    return render
  }

  window.__React = React
})()
