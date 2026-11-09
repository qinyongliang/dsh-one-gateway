/**
 * Smoke test for dsh-one-gateway: boots the merged plugin against a fake llm
 * service + fake webServer/connection, then drives the HTTP surface.
 * Run: node smoke.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const PORT = 18890
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-one-gateway-smoke-'))

function textStream(text = '你好') {
  return (async function* gen() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
}
function failStream(code = 'AUTH') {
  return (async function* gen() {
    yield { type: 'finish', reason: { kind: 'error', failure: { code, message: 'fake failure ' + code } } }
  })()
}

const served = []
function fakeCtx() {
  const routes = new Map()
  const fetchRoutes = new Map()
  const effects = []
  const ctx = {
    logger: { info: () => {}, warn: (...a) => console.error('[warn]', ...a), error: (...a) => console.error('[error]', ...a) },
    fiber: { entry: { id: 'dsh-one-gateway' } },
    get: (key) => (key === 'settings' ? undefined : key === 'attachments' ? undefined : undefined),
    on: () => () => {},
    effect: (fn) => { const d = fn(); effects.push(d); return d },
    inject: (keys, cb) => { if (cb) cb(ctx) },
    llm: {
      listProviders: () => [{ id: 'alpha', name: 'alpha' }, { id: 'beta', name: 'beta' }],
      listModels: async (provider) => provider === 'alpha'
        ? [{ id: 'good', name: 'Good Model' }, { id: 'bad', name: 'Bad Model' }]
        : [{ id: 'good', name: 'Good Model' }],
      resolveModelInfo: async (provider, model) => ({
        provider, id: model, name: model,
        context: { contextWindow: 128000 },
        reasoning: { efforts: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }] },
      }),
      registerConfigurableProviders: () => () => {},
      registerAdapter: () => () => {},
      stream: (options) => {
        served.push(`${options.provider}/${options.model}`)
        if (options.model === 'bad') return failStream()
        return textStream()
      },
    },
    webServer: {
      port: PORT,
      host: '127.0.0.1',
      register: (route) => { routes.set(route.path, route); return () => routes.delete(route.path) },
    },
  }
  // connection.fetch.register for the settings endpoint
  ctx.connection = { fetch: { register: async (route) => { fetchRoutes.set(route.path, route); return () => {} } } }
  ctx.get = (key) => key === 'connection' ? ctx.connection : undefined
  return { ctx, routes, fetchRoutes, stop: async () => { for (const d of effects.reverse()) await d?.() } }
}

async function settingsCall(fetchRoutes, action, payload = {}) {
  const route = fetchRoutes.get('/api/model-hub')
  assert.ok(route, 'settings route mounted')
  const response = await route.fetch({ json: async () => ({ rpcId: 'r1', payload: { action, ...payload } }) })
  const envelope = await response.json()
  return envelope.result
}

async function main() {
  const { ctx, routes, fetchRoutes, stop } = fakeCtx()
  const { apply } = await import('../lib/index.js')
  apply(ctx, {
    lanPort: false,
    keysFile: path.join(tmp, 'keys.json'),
    groupsFile: path.join(tmp, 'groups.json'),
    aliasesFile: path.join(tmp, 'aliases.json'),
    statsFile: path.join(tmp, 'stats.json'),
  })
  const route = routes.get('/v1')
  assert.ok(route, '/v1 mounted on webServer')

  // Drive the prefix route with real http through a tiny local server.
  const http = await import('node:http')
  const server = http.createServer((req, res) => {
    route.handler(req, res).catch((e) => { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end() } })
  })
  await new Promise((resolve) => server.listen(PORT + 1, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${PORT + 1}/v1`

  const post = async (p, body, headers = {}) => {
    const res = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
    return res
  }

  // 1. models list: aliases+groups only by default; ?all=1 carries name + id
  let models = await (await fetch(base + '/models?all=1')).json()
  assert.equal(models.object, 'list')
  const good = models.data.find((m) => m.id === 'alpha_good')
  assert.ok(good)
  assert.equal(good.name, 'Good Model')
  const pub = await (await fetch(base + '/models')).json()
  assert.ok(!pub.data.some((m) => m.id === 'alpha_good'), 'canonical ids hidden by default')
  const withCaps = await (await fetch(base + '/models?all=1')).json()
  const capModel = withCaps.data.find((m) => m.id === 'alpha_good')
  assert.deepEqual(capModel.reasoning_efforts, ['low', 'medium', 'high'], 'reasoning efforts advertised: ' + JSON.stringify(capModel))
  assert.equal(capModel.context_window, 128000)
  console.log('PASS models list name+id + alias-only default + reasoning efforts')

  // 2. chat non-streaming
  let chat = await (await post('/chat/completions', { model: 'alpha_good', messages: [{ role: 'user', content: 'hi' }] })).json()
  assert.equal(chat.choices[0].message.content, '你好')
  assert.equal(chat.usage.prompt_tokens, 5)
  console.log('PASS chat non-streaming')

  // 3. chat streaming
  const sres = await post('/chat/completions', { model: 'alpha_good', messages: [{ role: 'user', content: 'hi' }], stream: true })
  assert.ok(sres.headers.get('content-type').startsWith('text/event-stream'))
  const sse = await sres.text()
  assert.ok(sse.includes('"content":"你好"'))
  assert.ok(sse.includes('data: [DONE]'))
  console.log('PASS chat streaming')

  // 4. group + failover + stickiness
  let r = await settingsCall(fetchRoutes, 'createGroup', { name: 'pool', models: ['alpha_bad', 'beta_good'], strategy: 'sequential' })
  assert.ok(r.ok, JSON.stringify(r))
  served.length = 0
  chat = await (await post('/chat/completions', { model: 'pool', messages: [{ role: 'user', content: 'sticky-conv' }] }, { 'x-session-affinity': 's1' })).json()
  assert.equal(chat.choices[0].message.content, '你好')
  assert.deepEqual(served, ['alpha/bad', 'beta/good'], 'failover walked to healthy leg')
  served.length = 0
  chat = await (await post('/chat/completions', { model: 'pool', messages: [{ role: 'user', content: 'sticky-conv' }] }, { 'x-session-affinity': 's1' })).json()
  assert.deepEqual(served, ['beta/good'], 'sticky session skipped the dead leg')
  console.log('PASS group failover + session stickiness')

  // 4b. autoAlias: first lowercase token; duplicates -> group
  r = await settingsCall(fetchRoutes, 'autoAlias')
  assert.ok(r.ok, JSON.stringify(r))
  // fake names: 'Good Model' (alpha_good, beta_good share it) -> group 'good'
  //              'Bad Model'  (alpha_bad alone) -> alias 'bad'
  assert.ok(r.value.groups.includes('good'), 'duplicate token became group: ' + JSON.stringify(r.value))
  assert.ok(r.value.aliases.some((a) => a.alias === 'bad'), 'unique token became alias: ' + JSON.stringify(r.value))
  chat = await (await post('/chat/completions', { model: 'bad', messages: [{ role: 'user', content: 'hi' }] })).json()
  // bad model fails with AUTH; alias must route to alpha_bad and surface the failure (no group fallback)
  assert.equal(chat.error?.code ?? chat.code, 'AUTH', JSON.stringify(chat).slice(0, 200))
  console.log('PASS autoAlias naming + duplicate grouping')

  // 5. alias (rename)
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'fast', target: 'beta_good' })
  assert.ok(r.ok, JSON.stringify(r))
  chat = await (await post('/chat/completions', { model: 'fast', messages: [{ role: 'user', content: 'hi' }] })).json()
  assert.equal(chat.choices[0].message.content, '你好')
  assert.equal(chat.model, 'fast')
  models = await (await fetch(base + '/models')).json()
  const aliasEntry = models.data.find((m) => m.id === 'fast')
  assert.ok(aliasEntry, 'alias listed')
  assert.equal(aliasEntry.alias_of, 'beta_good')
  r = await settingsCall(fetchRoutes, 'listAliases')
  assert.ok(r.value.aliases.some((a) => a.alias === 'fast' && a.target === 'beta_good'))
  console.log('PASS alias rename + listing')

  // 6. responses non-streaming
  let resp = await (await post('/responses', { model: 'fast', input: 'hi' })).json()
  assert.equal(resp.object, 'response')
  assert.equal(resp.status, 'completed')
  assert.equal(resp.output[0].content[0].text, '你好')
  assert.equal(resp.usage.input_tokens, 5)
  console.log('PASS responses non-streaming')

  // 7. responses streaming
  const rres = await post('/responses', { model: 'fast', input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }], stream: true })
  const rtext = await rres.text()
  assert.ok(rtext.includes('event: response.created'))
  assert.ok(rtext.includes('event: response.output_text.delta'))
  assert.ok(rtext.includes('event: response.completed'))
  console.log('PASS responses streaming events')

  // 8. responses via group (failover) + stats recorded
  resp = await (await post('/responses', { model: 'pool', input: 'hi' })).json()
  assert.equal(resp.status, 'completed')
  r = await settingsCall(fetchRoutes, 'listStats', { days: 7 })
  assert.ok(r.ok)
  const dayKeys = Object.keys(r.value.days)
  assert.ok(dayKeys.length >= 1, 'stats persisted a day bucket')
  console.log('PASS responses group + stats')

  // 8b. listStats filter options merge live data + history
  r = await settingsCall(fetchRoutes, 'listStats', { days: 7 })
  assert.ok(r.ok)
  const opts = r.value.ledger.filters
  assert.ok(opts.providers.includes('alpha'), 'live providers in options: ' + JSON.stringify(opts.providers))
  assert.ok(opts.models.includes('pool'), 'group in model options')
  assert.ok(opts.models.includes('fast'), 'alias in model options')
  assert.ok(opts.models.some((m) => m.startsWith('alpha_')), 'catalog ids in model options')
  r = await settingsCall(fetchRoutes, 'listStats', { days: 7, model: 'pool' })
  assert.ok(r.ok)
  assert.ok(r.value.ledger.totals.requests > 0, 'filtered totals non-zero')
  console.log('PASS merged filter options + filtered totals')

  // 8c. alias dismissal: delete -> autoAlias must NOT recreate; manual re-add lifts it
  r = await settingsCall(fetchRoutes, 'removeAlias', { alias: 'bad' })
  assert.ok(r.ok, JSON.stringify(r))
  r = await settingsCall(fetchRoutes, 'autoAlias')
  assert.ok(r.ok)
  assert.ok(!r.value.aliases.some((a) => a.alias === 'bad'), 'dismissed alias recreated: ' + JSON.stringify(r.value))
  r = await settingsCall(fetchRoutes, 'listAliases')
  assert.ok(!r.value.aliases.some((a) => a.alias === 'bad'), 'dismissed alias still listed')
  // the TARGET model must still be callable and listed under ?all=1
  chat = await (await post('/chat/completions', { model: 'alpha_bad', messages: [{ role: 'user', content: 'hi' }] })).json()
  assert.equal(chat.error?.code ?? chat.code, 'AUTH', 'target model still routes (fails on its own merit)')
  const allModels = await (await fetch(base + '/models?all=1')).json()
  assert.ok(allModels.data.some((m) => m.id === 'alpha_bad'), 'target model still in full catalog')
  // manual re-add lifts the dismissal
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'bad', target: 'alpha_bad' })
  assert.ok(r.ok)
  r = await settingsCall(fetchRoutes, 'removeAlias', { alias: 'bad' })
  assert.ok(r.ok)
  console.log('PASS alias dismissal survives autoAlias; target model intact')

  // 8d. auto group trim: remove a member -> autoAlias must NOT re-merge
  r = await settingsCall(fetchRoutes, 'listGroups')
  const goodGroup = r.value.groups.find((g) => g.name === 'good')
  assert.ok(goodGroup, 'auto group good exists from earlier autoAlias')
  assert.equal(goodGroup.auto, true, 'auto flag persisted')
  r = await settingsCall(fetchRoutes, 'updateGroup', { id: 'good', models: ['alpha_good'] })
  assert.ok(r.ok, JSON.stringify(r))
  r = await settingsCall(fetchRoutes, 'autoAlias')
  assert.ok(r.ok)
  r = await settingsCall(fetchRoutes, 'listGroups')
  const trimmed = r.value.groups.find((g) => g.name === 'good')
  assert.deepEqual(trimmed.models, ['alpha_good'], 'trimmed auto group re-merged: ' + JSON.stringify(trimmed.models))
  console.log('PASS trimmed auto group stays trimmed after autoAlias')

  // 8e. same alias on a second model -> group of both, first model keeps the name
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'shared', target: 'alpha_good' })
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(r.value.merged, false)
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'shared', target: 'beta_good' })
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(r.value.merged, true, 'collision must merge: ' + JSON.stringify(r.value))
  assert.equal(r.value.reason, 'alias-collision')
  assert.deepEqual(r.value.group.models.sort(), ['alpha_good', 'beta_good'], 'group holds both models')
  r = await settingsCall(fetchRoutes, 'listAliases')
  assert.ok(!r.value.aliases.some((a) => a.alias === 'shared'), 'stale alias removed once the group owns the name')
  // the name resolves to the group and serves through failover
  chat = await (await post('/chat/completions', { model: 'shared', messages: [{ role: 'user', content: 'hi' }] })).json()
  assert.equal(chat.choices?.[0]?.message?.content, '你好', 'name serves via the group: ' + JSON.stringify(chat).slice(0, 200))
  // adding a third model to the same name extends the same group
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'shared', target: 'alpha_bad' })
  assert.ok(r.ok)
  assert.equal(r.value.reason, 'name-is-a-group')
  assert.equal(r.value.group.models.length, 3)
  console.log('PASS alias collision promotes to a group instead of stealing the name')

  // 9. keys
  r = await settingsCall(fetchRoutes, 'createKey', { label: 'smoke' })
  assert.ok(r.ok)
  const key = r.value.key
  const unauth = await fetch(base + '/models')
  assert.equal(unauth.status, 401)
  const authed = await fetch(base + '/models', { headers: { authorization: 'Bearer ' + key } })
  assert.equal(authed.status, 200)
  console.log('PASS API key auth')

  // 10. status carries aliases + responsesPath
  r = await settingsCall(fetchRoutes, 'status')
  assert.ok(r.ok)
  assert.equal(r.value.responsesPath, '/v1/responses')
  assert.ok(r.value.aliases.some((a) => a.alias === 'fast'))
  console.log('PASS status payload')

  server.close()
  await stop()
  console.log('ALL SMOKE TESTS PASSED')
  process.exit(0)
}

main().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1) })
