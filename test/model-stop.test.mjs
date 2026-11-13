/**
 * A stopped model must be unreachable, whichever spelling addresses it.
 *
 * The reported bug: `loomy_DeepSeek-V4.1-Flash` had no alias ("无名称"), so
 * stopping every name left it callable, and a group whose candidate list held
 * it kept routing there. The switch is on the MODEL, so its reach is the model.
 *
 * Asserted against the source (no DOM / no live provider here): the guard must
 * exist on both resolution paths and in the candidate pool.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const index = fs.readFileSync(path.join(here, '..', 'lib', 'index.js'), 'utf8')
const client = fs.readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

/* 1. The model-level set exists and is persisted. */
assert.ok(index.includes('const modelStops = new Map()'), 'a model-level stop set exists')
assert.ok(index.includes('const isModelStopped = (id) =>'), 'there is a model-stop predicate')
assert.ok(index.includes('void loadModelStops()'), 'the set is loaded at startup')
assert.ok(index.includes('await saveModelStops()'), 'the set is persisted')

/* 2. Both resolution paths refuse a stopped canonical id. */
const canonicalGuards = index.split('if (isModelStopped(raw)) {').length - 1
assert.ok(canonicalGuards >= 2, 'both resolveLeg and resolveRoute guard a stopped model: ' + canonicalGuards)

/* 3. Every spelling maps to the same stop: provider_model and provider/model. */
assert.ok(
  index.includes("modelStops.has(id.slice(0, slash) + '_' + id.slice(slash + 1))"),
  'the slash spelling is normalised to the canonical id',
)

/* 4. A stopped model leaves every group candidate pool. */
assert.ok(
  index.includes('!expiredMembers.has(model) && !isModelStopped(model)'),
  'the candidate pool drops a stopped model',
)

/* 5. The action exists and reports back. */
assert.ok(index.includes("case 'setModelStopped': {"), 'setModelStopped is a settings action')
assert.ok(index.includes('modelStops: [...modelStops.keys()]'), 'status exposes the stopped ids')

/* 6. The models tab renders a switch per model, not only per alias. */
assert.ok(client.includes('const toggleModel = useCallback('), 'the client has a model switch handler')
assert.ok(client.includes('call("setModelStopped", { id, stopped })'), 'the handler calls the action')
assert.ok(
  client.includes('const modelStopped = (status?.modelStops ?? []).includes(m.id)'),
  'the row reads the model-level stop state',
)
assert.ok(
  client.includes('onClick: () => toggleModel(m.id, !modelStopped)'),
  'the row renders a working switch',
)

/* 7. The two scopes stay independent: an alias switch must not imply a model stop. */
assert.ok(
  index.includes("case 'setAliasEnabled': {"),
  'the alias-level switch still exists as its own scope',
)

/* 8. A model stop is not silently undone by the auto pass. */
assert.ok(
  !index.includes('modelStops.delete(entry)') && !index.includes('modelStops.clear()\n    catalog'),
  'nothing clears the stop set implicitly',
)

console.log('MODEL-STOP-TESTS-PASSED')
