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
    // The suite drives the routes through the web-server mount, which is off by
    // default whenever a standalone listener is configured.
    mount: true,
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

  // 3b. TTFT is a request property, not a group property. A direct (non-group)
  // streamed call must still record one; recording it only when a group leg
  // existed left the column null on every direct call.
  {
    const hist = await settingsCall(fetchRoutes, 'listStats', { page: 0, pageSize: 50 })
    assert.ok(hist.ok, JSON.stringify(hist))
    const direct = (hist.value.ledger?.rows ?? []).find(
      (row) => row.model === 'alpha_good' && row.kind === 'stream' && row.status === 'answered',
    )
    assert.ok(direct, 'the direct streamed call is in the ledger: ' + JSON.stringify((hist.value.ledger?.rows ?? []).map((x) => x.model + '/' + x.kind)))
    assert.ok(direct.ttftMs !== null && direct.ttftMs !== undefined, 'direct streamed call recorded a TTFT: ' + JSON.stringify(direct))
    console.log('PASS direct streamed call records TTFT')
  }

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

  // 8b2. explicit time window narrows rows, totals and the wall together
  {
    const nowMs = Date.now()
    const DAY = 86400000
    const today = await settingsCall(fetchRoutes, 'listStats', { days: 7, from: nowMs - DAY, to: nowMs + 1000 })
    assert.ok(today.ok, JSON.stringify(today))
    const all = await settingsCall(fetchRoutes, 'listStats', { days: 7 })
    assert.ok(today.value.ledger.totals.requests <= all.value.ledger.totals.requests, 'window never widens totals')
    assert.ok(today.value.ledger.totals.requests > 0, 'today window keeps the calls made this run')
    const past = await settingsCall(fetchRoutes, 'listStats', { days: 7, from: nowMs - 30 * DAY, to: nowMs - 2 * DAY })
    assert.equal(past.value.ledger.totals.requests, 0, 'past-only window excludes every call from this run')
    assert.equal(past.value.ledger.rows.length, 0, 'past-only window has no rows')
    assert.deepEqual(past.value.ledger.applied.from !== null, true, 'window echoed in applied')
  }
  console.log('PASS explicit time window filter')

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

  // 8e2. A name is case-insensitive: typing an existing name in another case
  // must reach the SAME group and add the model, not create a second name
  // beside it. This is the reported bug: the save looked like it did nothing
  // and the model never joined the group.
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'SHARED', target: 'beta_bad' })
  assert.ok(r.ok, 'uppercase spelling must be accepted: ' + JSON.stringify(r))
  assert.equal(r.value.merged, true, 'case-variant claim merges into the group: ' + JSON.stringify(r.value))
  assert.equal(r.value.group.name, 'shared', 'stored under the folded name')
  assert.ok(r.value.group.models.includes('beta_bad'), 'the claiming model joined the group: ' + JSON.stringify(r.value.group.models))
  r = await settingsCall(fetchRoutes, 'listGroups')
  assert.equal(r.value.groups.filter((g) => g.name.toLowerCase() === 'shared').length, 1, 'no duplicate group in another case')
  r = await settingsCall(fetchRoutes, 'listAliases')
  assert.ok(!r.value.aliases.some((a) => a.alias !== a.alias.toLowerCase()), 'every stored alias is lowercase: ' + JSON.stringify(r.value.aliases))
  console.log('PASS a name is case-insensitive, so a re-spelled claim joins the same group')

  // 8e3. A name the user deleted is remembered against the AUTOMATIC pass only.
  // Naming it again is an explicit instruction and must work.
  r = await settingsCall(fetchRoutes, 'removeGroup', { id: 'shared' })
  assert.ok(r.ok, JSON.stringify(r))
  r = await settingsCall(fetchRoutes, 'autoAlias')
  assert.ok(r.ok)
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'shared', target: 'alpha_good' })
  assert.ok(r.ok, 'an explicit claim resurrects a dismissed name: ' + JSON.stringify(r))
  assert.equal(r.value.alias?.alias, 'shared', 'name available again: ' + JSON.stringify(r.value))
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'Shared', target: 'beta_good' })
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(r.value.reason, 'alias-collision', 'second claim promotes to a group')
  assert.deepEqual(r.value.group.models.sort(), ['alpha_good', 'beta_good'], 'both models present')
  console.log('PASS an explicit claim outranks a remembered deletion')

  // 8f. autoAlias merges a name that another model already holds
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'good', target: 'alpha_good' })
  assert.ok(r.ok)
  r = await settingsCall(fetchRoutes, 'autoAlias')
  assert.ok(r.ok)
  r = await settingsCall(fetchRoutes, 'listGroups')
  const autoGood = r.value.groups.find((g) => g.name === 'good')
  assert.ok(autoGood, 'auto pass kept the group named good: ' + JSON.stringify(r.value.groups.map((g) => g.name)))
  assert.ok(autoGood.models.includes('alpha_good'), 'group still holds the first model')
  console.log('PASS autoAlias merges a colliding name into a group')

  // 8f2. Every name the automatic pass derives is pure lowercase. The fake
  // providers display "Good Model" / "Bad Model", so the auto names for them
  // are the mixed-case path: they must come out as 'good' / 'bad'.
  r = await settingsCall(fetchRoutes, 'autoAlias')
  assert.ok(r.ok)
  for (const name of [...(r.value.aliases ?? []).map((a) => a.alias), ...(r.value.groups ?? [])]) {
    assert.equal(name, name.toLowerCase(), 'auto-generated name is lowercase: ' + name)
  }
  for (const name of r.value.skipped ?? []) {
    assert.equal(name, name.toLowerCase(), 'a skipped auto name is lowercase too: ' + name)
  }
  r = await settingsCall(fetchRoutes, 'status')
  assert.ok(r.value.aliases.length > 0, 'aliases exist to inspect')
  for (const entry of r.value.aliases) {
    assert.equal(entry.alias, entry.alias.toLowerCase(), 'stored alias is lowercase: ' + entry.alias)
  }
  r = await settingsCall(fetchRoutes, 'listGroups')
  for (const group of r.value.groups) {
    assert.equal(group.name, group.name.toLowerCase(), 'stored group name is lowercase: ' + group.name)
  }
  console.log('PASS every auto-generated name is pure lowercase')

  // 8f3. A name may not be BOTH an alias and a group: the group owns it, so a
  // leftover alias would render the same name twice with different controls.
  // Claiming such a name must converge on the group, never keep the alias.
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'dupname', target: 'alpha_good' })
  assert.ok(r.ok, JSON.stringify(r))
  // Creating a group under a name an alias already holds must take the name
  // over: the alias becomes a shadow, and its model joins the group so it stays
  // reachable.
  r = await settingsCall(fetchRoutes, 'createGroup', { name: 'dupname', models: ['beta_good'] })
  assert.ok(r.ok, 'createGroup takes the name: ' + JSON.stringify(r))
  r = await settingsCall(fetchRoutes, 'listAliases')
  assert.ok(!r.value.aliases.some((a) => a.alias === 'dupname'), 'no alias survives beside the group: ' + JSON.stringify(r.value.aliases))
  r = await settingsCall(fetchRoutes, 'listGroups')
  const dupGroup = r.value.groups.find((g) => g.name === 'dupname')
  assert.ok(dupGroup, 'the group owns the name')
  assert.ok(dupGroup.models.includes('beta_good'), 'the group keeps its own member: ' + JSON.stringify(dupGroup.models))
  assert.ok(dupGroup.models.includes('alpha_good'), 'the retired alias model joined too: ' + JSON.stringify(dupGroup.models))
  console.log('PASS a name resolves to exactly one owner — the group')

  // 8f4. A dismissal must never outlive the group it hides. Otherwise the auto
  // pass skips a name the user can see on screen, so a model that should join
  // the group never does — the reported "saved but not added" symptom.
  r = await settingsCall(fetchRoutes, 'createGroup', { name: 'revive', models: ['alpha_good'] })
  assert.ok(r.ok, JSON.stringify(r))
  r = await settingsCall(fetchRoutes, 'removeGroup', { id: 'revive' })
  assert.ok(r.ok, JSON.stringify(r))
  r = await settingsCall(fetchRoutes, 'autoAlias')
  assert.ok(r.ok)
  // Recreate it behind the dismissal's back, exactly like the legacy data on
  // disk where a dismissed name still had a live group.
  r = await settingsCall(fetchRoutes, 'createGroup', { name: 'revive', models: ['alpha_good'] })
  assert.ok(r.ok, 'recreate: ' + JSON.stringify(r))
  r = await settingsCall(fetchRoutes, 'autoAlias')
  assert.ok(r.ok)
  r = await settingsCall(fetchRoutes, 'listGroups')
  const revived = r.value.groups.find((g) => g.name === 'revive')
  assert.ok(revived, 'the live group is not hidden by a stale dismissal: ' + JSON.stringify(r.value.groups.map((g) => g.name)))
  console.log('PASS a dismissal does not outlive the group it hides')

  // 8g. There is no per-model switch. A model is a target; availability is a
  // property of the names pointing at it, so an alias owns its own switch and
  // stopping one alias must not disturb another that points at the same model.
  {
    // Two aliases on a model that ANSWERS, so "the sibling still serves" is a
    // statement about the switch rather than about the model's health.
    r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'badname', target: 'alpha_good' })
    assert.ok(r.ok, JSON.stringify(r))
    r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'badname2', target: 'alpha_good' })
    assert.ok(r.ok, JSON.stringify(r))

    // The switch exists on the alias, not on the model.
    r = await settingsCall(fetchRoutes, 'setAliasEnabled', { alias: 'badname', enabled: false })
    assert.ok(r.ok, JSON.stringify(r))
    r = await settingsCall(fetchRoutes, 'status')
    assert.equal(r.value.aliases.find((a) => a.alias === 'badname').enabled, false, 'alias switch persisted')
    assert.ok(r.value.models.some((m) => m.id === 'alpha_bad'), 'model stays in the settings catalog')

    // A stopped alias refuses its own name...
    chat = await (await post('/chat/completions', { model: 'badname', messages: [{ role: 'user', content: 'hi' }] })).json()
    assert.equal(chat.error?.code, 'model_disabled', 'stopped alias refuses requests: ' + JSON.stringify(chat).slice(0, 160))

    // ...while the other alias at the same model is untouched. This is the
    // whole point: one name's switch never governs another.
    chat = await (await post('/chat/completions', { model: 'badname2', messages: [{ role: 'user', content: 'hi' }] })).json()
    assert.ok(chat.choices?.[0]?.message?.content !== undefined, 'sibling alias at the same model still serves: ' + JSON.stringify(chat).slice(0, 160))

    // Resuming restores it.
    r = await settingsCall(fetchRoutes, 'setAliasEnabled', { alias: 'badname', enabled: true })
    assert.ok(r.ok)
    chat = await (await post('/chat/completions', { model: 'badname', messages: [{ role: 'user', content: 'hi' }] })).json()
    assert.ok(chat.choices?.[0]?.message?.content !== undefined, 'resumed alias serves again')

    // Re-pointing an alias keeps its switch rather than silently resuming it.
    r = await settingsCall(fetchRoutes, 'setAliasEnabled', { alias: 'badname', enabled: false })
    assert.ok(r.ok)
    r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'badname', target: 'alpha_good' })
    assert.ok(r.ok)
    r = await settingsCall(fetchRoutes, 'status')
    assert.equal(r.value.aliases.find((a) => a.alias === 'badname').enabled, false, 're-pointing keeps the alias stopped')

    await settingsCall(fetchRoutes, 'removeAlias', { alias: 'badname' })
    await settingsCall(fetchRoutes, 'removeAlias', { alias: 'badname2' })
  }
  console.log('PASS an alias owns its switch; a sibling alias at the same model is unaffected')

  // 8h. a group candidate is stopped within the group, not globally.
  {
    r = await settingsCall(fetchRoutes, 'createGroup', { name: 'schedpool', models: ['alpha_good', 'beta_good'], strategy: 'sequential' })
    assert.ok(r.ok, JSON.stringify(r))
    chat = await (await post('/chat/completions', { model: 'schedpool', messages: [{ role: 'user', content: 'hi' }] })).json()
    assert.equal(chat.choices?.[0]?.message?.content, '你好', 'group serves through its head: ' + JSON.stringify(chat).slice(0, 160))

    // Stop the head inside this group: the member stays, the next leg serves.
    r = await settingsCall(fetchRoutes, 'setGroupMemberStopped', { id: 'schedpool', model: 'alpha_good', stopped: true })
    assert.ok(r.ok, JSON.stringify(r))
    r = await settingsCall(fetchRoutes, 'listGroups')
    const schedpool = r.value.groups.find((g) => g.name === 'schedpool')
    assert.deepEqual(schedpool.models, ['alpha_good', 'beta_good'], 'stopped member is NOT removed from the group')
    assert.deepEqual(schedpool.stopped, ['alpha_good'], 'the stopped set is recorded on the group')
    chat = await (await post('/chat/completions', { model: 'schedpool', messages: [{ role: 'user', content: 'hi' }] })).json()
    assert.equal(chat.choices?.[0]?.message?.content, '你好', 'group still answers via the remaining leg')

    // Stopping it in one group does not affect the same model elsewhere.
    r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'alphagood', target: 'alpha_good' })
    assert.ok(r.ok)
    chat = await (await post('/chat/completions', { model: 'alphagood', messages: [{ role: 'user', content: 'hi' }] })).json()
    assert.ok(chat.choices?.[0]?.message?.content !== undefined, 'the same model is still callable through an alias')
    await settingsCall(fetchRoutes, 'removeAlias', { alias: 'alphagood' })

    // Stop the last usable leg: the group has no candidate left, but keeps both.
    r = await settingsCall(fetchRoutes, 'setGroupMemberStopped', { id: 'schedpool', model: 'beta_good', stopped: true })
    assert.ok(r.ok)
    chat = await (await post('/chat/completions', { model: 'schedpool', messages: [{ role: 'user', content: 'hi' }] })).json()
    assert.equal(chat.error?.code, 'group_empty', 'all-stopped group refuses: ' + JSON.stringify(chat).slice(0, 160))
    r = await settingsCall(fetchRoutes, 'listGroups')
    assert.equal(r.value.groups.find((g) => g.name === 'schedpool').models.length, 2, 'members survive an empty pool')

    // Removing a candidate drops its stale stopped mark.
    r = await settingsCall(fetchRoutes, 'updateGroup', { id: 'schedpool', models: ['beta_good'] })
    assert.ok(r.ok, JSON.stringify(r))
    r = await settingsCall(fetchRoutes, 'listGroups')
    assert.deepEqual(r.value.groups.find((g) => g.name === 'schedpool').stopped, ['beta_good'], 'the mark for a removed candidate is dropped')

    r = await settingsCall(fetchRoutes, 'removeGroup', { id: 'schedpool' })
    assert.ok(r.ok)
  }
  console.log('PASS a group candidate is stopped within its group only')

  // 8h. the group picker lists real models only (no alias duplicates)
  r = await settingsCall(fetchRoutes, 'setAlias', { alias: 'goodalias', target: 'alpha_good' })
  assert.ok(r.ok)
  r = await settingsCall(fetchRoutes, 'listGroups')
  const pickerIds = r.value.models.map((m) => m.id)
  const dupes = pickerIds.filter((id, i) => pickerIds.indexOf(id) !== i)
  assert.deepEqual(dupes, [], 'picker has duplicate ids: ' + JSON.stringify(dupes))
  assert.ok(!pickerIds.includes('goodalias'), 'alias entry must not be a picker candidate')
  const targets = r.value.models.filter((m) => m.rawId === 'alpha_good' || m.id === 'alpha_good')
  assert.equal(targets.length, 1, 'exactly one row per underlying model: ' + JSON.stringify(targets.map((m) => m.id)))
  console.log('PASS group picker lists models without alias duplicates')

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

  // The DSH web server is DSH's own port. With a standalone listener configured
  // the gateway must NOT mount there, or the OpenAI surface answers on DSH's
  // address too.
  {
    const second = fakeCtx()
    apply(second.ctx, {
      lanPort: 0,
      mount: false,
      keysFile: path.join(tmp, 'keys2.json'),
      groupsFile: path.join(tmp, 'groups2.json'),
      aliasesFile: path.join(tmp, 'aliases2.json'),
      statsFile: path.join(tmp, 'stats2.json'),
    })
    assert.equal(second.routes.get('/v1'), undefined, 'mount:false must not register on the DSH web server')
    assert.ok(!second.routes.has('/v1'), 'no /v1 route on the DSH server')
    await second.stop()
    console.log('PASS mount:false keeps /v1 off the DSH web server')
  }

  // Default: a configured standalone listener implies no DSH mount.
  {
    const third = fakeCtx()
    apply(third.ctx, {
      lanPort: 0,
      keysFile: path.join(tmp, 'keys3.json'),
      groupsFile: path.join(tmp, 'groups3.json'),
      aliasesFile: path.join(tmp, 'aliases3.json'),
      statsFile: path.join(tmp, 'stats3.json'),
    })
    assert.equal(third.routes.get('/v1'), undefined, 'a standalone listener implies mount:false')
    await third.stop()
    console.log('PASS a standalone listener implies no DSH mount')
  }

  server.close()
  await stop()
  console.log('ALL SMOKE TESTS PASSED')
  process.exit(0)
}

main().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1) })
