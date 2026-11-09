/**
 * Guard: a model has no scheduling switch of its own.
 *
 * The switch belongs to a name. A model is a target, and it is reachable
 * exactly when some enabled name points at it. A second flag on the model would
 * duplicate that fact — and it did, so stopping one model silently stopped every
 * alias pointing at it, which is precisely what a user reported as wrong.
 *
 * These assertions are structural on purpose: they fail if the concept is
 * reintroduced anywhere, not just if the current wording changes.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const index = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

// 1. The model-level store, its RPC and its config key are gone.
for (const gone of ['setModelDisabled', 'modelOverrides', 'loadOverrides', 'saveOverrides', 'overridesFile', 'isModelDisabled']) {
  assert.ok(!index.includes(gone), `lib/index.js must not reintroduce "${gone}"`)
}
assert.ok(!client.includes('setModelDisabled'), 'lib/client.js must not call setModelDisabled')
assert.ok(!client.includes('status?.overrides'), 'the client must not read a per-model override map')

// 2. The two RPCs that DO own a switch exist.
assert.ok(index.includes("case 'setAliasEnabled'"), 'an alias owns a switch')
assert.ok(index.includes("case 'setGroupMemberStopped'"), 'a group owns its candidates\' switches')

// 3. An alias's own switch gates routing, by the name the caller used.
assert.ok(
  index.includes('if (!(await aliasStore.isEnabled(raw))) {'),
  'a stopped alias must be refused at resolution',
)

// 4. The catalog carries no per-model stopped flag.
assert.ok(
  !/id,\s*rawId,\s*provider,[\s\S]{0,400}?\.\.\.\(isModelDisabled\(id\)/.test(index),
  'the catalog must not flag models as stopped',
)

// 5. A group candidate is skipped from the group's own set, never a global one.
assert.ok(
  index.includes('new Set(group.stopped ?? [])'),
  'group candidacy must read the group\'s own stopped set',
)

// 6. The client derives a model's state from its names.
assert.ok(client.includes('const reachable = liveAliases.length > 0 || liveGroups.length > 0'),
  'the client must derive reachability from the names pointing at a model')

console.log('NO-MODEL-SWITCH-TESTS-PASSED')
