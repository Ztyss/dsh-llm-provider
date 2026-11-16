/**
 * 可用模型拉取（/provider/available-models 的核心）离线测试：注入 fetch 桩，不触网。
 *
 * 为什么这组用例重要：拉取用的 key 来自凭据仓库，绝不能出宿主；URL 与请求头形状
 * （openai → /models + Bearer，anthropic → /v1/models + x-api-key）错了网关直接 404/401，
 * 而无凭据的本地网关（deepseek-local 这类 /models 不鉴权）必须也能拉。元数据字段族
 * （context_length / max_completion_tokens …）各家网关叫法不一，解析规则要钉死：
 * 只认正整数字段值，多个同族字段取最小，非法值一律忽略。
 */
import assert from 'node:assert/strict'
import { fetchAvailableModels } from '../lib/available-models.js'

let failures = 0
function stubFetch(responder) {
  let calls = 0
  const seen = []
  const impl = async (url, init) => {
    calls += 1
    seen.push({ url: String(url), headers: { ...(init?.headers ?? {}) } })
    const r = responder(String(url))
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
    }
  }
  return { impl, stats: () => ({ calls, seen }) }
}

function run(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log('  ok ' + label))
    .catch((error) => {
      failures += 1
      console.log('  FAIL ' + label + '\n      ' + String(error && error.message ? error.message : error))
    })
}

// ---- URL 与请求头形状 ----
await run('openai 协议 → GET <base>/models，带 Authorization: Bearer', async () => {
  const stub = stubFetch(() => ({ status: 200, body: { data: [] } }))
  const result = await fetchAvailableModels({ base: 'https://gw.example.com/v1', isAnthropic: false }, 'sk-x', stub.impl)
  assert.equal(result.ok, true)
  assert.equal(stub.stats().calls, 1)
  assert.equal(stub.stats().seen[0].url, 'https://gw.example.com/v1/models')
  assert.equal(stub.stats().seen[0].headers['Authorization'], 'Bearer sk-x')
})

await run('anthropic 协议 → GET <base>/v1/models，带 x-api-key + anthropic-version', async () => {
  const stub = stubFetch(() => ({ status: 200, body: { data: [] } }))
  const result = await fetchAvailableModels({ base: 'https://relay.example.com', isAnthropic: true }, 'sk-ant', stub.impl)
  assert.equal(result.ok, true)
  assert.equal(stub.stats().seen[0].url, 'https://relay.example.com/v1/models')
  assert.equal(stub.stats().seen[0].headers['x-api-key'], 'sk-ant')
  assert.equal(stub.stats().seen[0].headers['anthropic-version'], '2023-06-01')
  assert.equal(stub.stats().seen[0].headers['Authorization'], undefined)
})

await run('无凭据也拉取（本地网关不鉴权）→ 不带鉴权头', async () => {
  const stub = stubFetch(() => ({ status: 200, body: { data: [{ id: 'local-model' }] } }))
  const result = await fetchAvailableModels({ base: 'http://127.0.0.1:8000/v1', isAnthropic: false }, undefined, stub.impl)
  assert.equal(result.ok, true)
  assert.equal(stub.stats().seen[0].headers['Authorization'], undefined)
  assert.deepEqual(result.models.map((m) => m.id), ['local-model'])
})

// ---- 响应形状与元数据解析 ----
await run('data[] + context_length/max_completion_tokens → 数值带进 models', async () => {
  const stub = stubFetch(() => ({
    status: 200,
    body: { object: 'list', data: [
      { id: 'glm-5', object: 'model', context_length: 200000, max_completion_tokens: 128000 },
      { id: 'glm-5-air', object: 'model' },
    ] },
  }))
  const result = await fetchAvailableModels({ base: 'https://gw.example.com/v1', isAnthropic: false }, 'k', stub.impl)
  assert.equal(result.ok, true)
  assert.equal(result.models.length, 2)
  assert.deepEqual(result.models[0], { id: 'glm-5', contextWindow: 200000, maxTokens: 128000 })
  assert.deepEqual(result.models[1], { id: 'glm-5-air' })
})

await run('models[] 形状（部分网关）+ 条目只有 name → id 取 name', async () => {
  const stub = stubFetch(() => ({ status: 200, body: { models: [{ name: 'qwen4-max' }] } }))
  const result = await fetchAvailableModels({ base: 'https://gw.example.com', isAnthropic: false }, 'k', stub.impl)
  assert.equal(result.ok, true)
  assert.deepEqual(result.models.map((m) => m.id), ['qwen4-max'])
})

await run('字符串条目数组 → id 直取，无元数据', async () => {
  const stub = stubFetch(() => ({ status: 200, body: { data: ['m-a', 'm-b'] } }))
  const result = await fetchAvailableModels({ base: 'https://gw.example.com', isAnthropic: false }, 'k', stub.impl)
  assert.equal(result.ok, true)
  assert.deepEqual(result.models, [{ id: 'm-a' }, { id: 'm-b' }])
})

await run('同族多字段取最小正整数；负数/0/浮点/字符串值忽略', async () => {
  const stub = stubFetch(() => ({
    status: 200,
    body: { data: [{
      id: 'mix',
      context_length: 100000,
      max_context_tokens: 60000,      // context 族最小 → 60000
      context_window: -1,             // 非法忽略
      max_completion_tokens: 32768,
      max_output_tokens: 0,           // 非法忽略
      max_model_output_tokens: 16384, // output 族最小 → 16384
      maxTokens: '99999',             // 字符串不认
    }] },
  }))
  const result = await fetchAvailableModels({ base: 'https://gw.example.com', isAnthropic: false }, 'k', stub.impl)
  assert.equal(result.ok, true)
  assert.deepEqual(result.models[0], { id: 'mix', contextWindow: 60000, maxTokens: 16384 })
})

await run('重复 id 去重（保序，首个胜出）', async () => {
  const stub = stubFetch(() => ({
    status: 200,
    body: { data: [{ id: 'dup', context_length: 100 }, { id: 'dup', context_length: 200 }, { id: 'other' }] },
  }))
  const result = await fetchAvailableModels({ base: 'https://gw.example.com', isAnthropic: false }, 'k', stub.impl)
  assert.equal(result.ok, true)
  assert.deepEqual(result.models, [{ id: 'dup', contextWindow: 100 }, { id: 'other' }])
})

await run('空清单 → ok:true + models:[]', async () => {
  const stub = stubFetch(() => ({ status: 200, body: { data: [] } }))
  const result = await fetchAvailableModels({ base: 'https://gw.example.com', isAnthropic: false }, 'k', stub.impl)
  assert.equal(result.ok, true)
  assert.deepEqual(result.models, [])
})

// ---- 失败路径如实回报 ----
await run('HTTP 404 → ok:false，error 含状态与响应片段', async () => {
  const stub = stubFetch(() => ({ status: 404, body: 'not found here' }))
  const result = await fetchAvailableModels({ base: 'https://gw.example.com', isAnthropic: false }, 'k', stub.impl)
  assert.equal(result.ok, false)
  assert.match(result.error, /HTTP 404/)
  assert.match(result.error, /not found here/)
})

await run('HTTP 401（网关要 key 而没给）→ ok:false 如实回报', async () => {
  const stub = stubFetch(() => ({ status: 401, body: { error: 'missing key' } }))
  const result = await fetchAvailableModels({ base: 'https://gw.example.com', isAnthropic: false }, undefined, stub.impl)
  assert.equal(result.ok, false)
  assert.match(result.error, /HTTP 401/)
})

await run('网络失败 → ok:false，error 含「端点请求失败」', async () => {
  const result = await fetchAvailableModels({ base: 'https://gw.example.com', isAnthropic: false }, 'k', async () => {
    throw new Error('ECONNREFUSED')
  })
  assert.equal(result.ok, false)
  assert.match(result.error, /端点请求失败/)
})

await run('200 但响应不是清单 JSON → ok:false', async () => {
  const stub = stubFetch(() => ({ status: 200, body: 'welcome to nginx' }))
  const result = await fetchAvailableModels({ base: 'https://gw.example.com', isAnthropic: false }, 'k', stub.impl)
  assert.equal(result.ok, false)
})

console.log(failures === 0 ? '\n可用模型拉取测试全部通过' : `\n可用模型拉取 ${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
