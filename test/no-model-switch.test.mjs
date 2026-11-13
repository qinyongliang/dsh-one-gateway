/**
 * Guard: the two scheduling switches are INDEPENDENT scopes.
 *
 * History, because this file has been wrong once in each direction:
 *
 *  1. Originally a model carried one flag, and stopping it silently stopped
 *     every alias pointing at it. That was reported as wrong: an alias switch
 *     must govern only that name.
 *  2. The fix made switches name-only. That left a model with NO name — e.g.
 *     `loomy_DeepSeek-V4.1-Flash`, shown as "无名称" — with no switch at all,
 *     so stopping every name still left it callable by its canonical id. That
 *     was reported as the next bug.
 *
 * The settled contract, asserted here:
 *
 *   alias switch  — governs that NAME only; never cascades to siblings.
 *   model switch  — governs the MODEL; explicitly chosen, and the reason a
 *                   nameless model can be stopped at all.
 *
 * Neither may be implemented in terms of the other.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const index = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

/* 1. Both scopes exist, each as its own RPC. */
assert.ok(index.includes("case 'setAliasEnabled'"), 'an alias owns a switch')
assert.ok(index.includes("case 'setGroupMemberStopped'"), 'a group owns its candidates\' switches')
assert.ok(index.includes("case 'setModelStopped'"), 'a model owns a switch of its own')

/* 2. The alias switch gates routing by the name the caller used — and ONLY
      that name: it must not consult the model-level set, or one alias stop
      would take its siblings down with it. */
assert.ok(
  index.includes('if (!(await aliasStore.isEnabled(raw))) {'),
  'a stopped alias must be refused at resolution',
)
assert.ok(
  !/aliasStore\.isEnabled[\s\S]{0,200}isModelStopped/.test(index),
  'the alias switch must not cascade into the model switch',
)

/* 3. The model switch is a real, separate store — not a view over aliases. */
assert.ok(index.includes('const modelStops = new Map()'), 'the model switch has its own store')
assert.ok(index.includes('const isModelStopped = (id) =>'), 'the model switch has its own predicate')
assert.ok(
  !index.includes('isModelStopped = async') && !index.includes('const isModelStopped = async'),
  'the model switch must not be derived from the alias store',
)

/* 4. Stopping a model must NOT rewrite its aliases. The original complaint was
      a cascade; a model stop that also flipped every alias would recreate it. */
assert.ok(
  !/setModelStopped[\s\S]{0,600}aliasStore\.setEnabled/.test(index),
  'stopping a model must not disable its aliases',
)

/* 5. A group candidate is skipped from the group's own set as well. */
assert.ok(
  index.includes('new Set(group.stopped ?? [])'),
  'group candidacy must read the group\'s own stopped set',
)

/* 6. The client renders BOTH switches, and derives the model's state from the
      model-level list rather than only from its names. */
assert.ok(
  client.includes('const modelStopped = (status?.modelStops ?? []).includes(m.id)'),
  'the client must read the model-level switch',
)
assert.ok(
  client.includes('const reachable = !modelStopped && (liveAliases.length > 0 || liveGroups.length > 0)'),
  'reachability combines both scopes',
)

console.log('NO-MODEL-SWITCH-TESTS-PASSED')
