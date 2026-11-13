/**
 * Guard: a disabled group refuses by name; it never falls through.
 *
 * Real failure this pins: a group named `deepseek-v4.1-flash` (disabled) shares
 * its name with a bare model id three providers serve. Falling through reached
 * the ambiguity check and answered "use a namespaced id such as
 * loop_deepseek-v4.1-flash", which describes a different problem than the one
 * the caller has.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const index = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

/* 1. The disabled-group guard exists and throws before the fall-through. */
assert.ok(
  index.includes('if (group !== undefined && !group.enabled) {'),
  'a disabled group is detected explicitly',
)
assert.ok(
  index.includes("'group_disabled'"),
  'the refusal carries a dedicated code',
)

/* 2. The guard must run BEFORE the bare-id ambiguity check, or the trap returns. */
const disabledAt = index.indexOf('if (group !== undefined && !group.enabled) {')
const ambiguousAt = index.indexOf("'ambiguous_model'")
assert.ok(disabledAt > 0, 'the disabled guard is present')
assert.ok(ambiguousAt > 0, 'the ambiguity check is present')
assert.ok(
  disabledAt < ambiguousAt,
  'the disabled guard precedes the ambiguity check',
)

/* 3. The message names the group and offers a concrete member, not a generic 400. */
const guard = index.slice(disabledAt, disabledAt + 700)
assert.ok(guard.includes('is turned off'), 'the message says the group is off')
assert.ok(guard.includes('group.models'), 'the message suggests a real member')
assert.ok(guard.includes('503'), 'a turned-off name is a 503, not a 400')

/* 4. An enabled group still routes normally. */
assert.ok(
  index.includes('if (group !== undefined && group.enabled) {'),
  'the enabled path is untouched',
)

/* 5. The groups TAB itself renders the switch.
      The bug reported after the first fix: the switch existed only on the
      models tab, attached to a group chip that renders only while one of the
      group's members is on screen — so a disabled group with every member
      stopped could not be turned back on at all. */
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
assert.ok(
  client.includes('call("updateGroup", { id: g.id, enabled: g.enabled === false })'),
  'the groups tab toggles a group directly',
)
const groupsTabAt = client.indexOf('shownGroups.map((g) =>')
assert.ok(groupsTabAt > 0, 'the groups tab renders rows')
const groupsTab = client.slice(groupsTabAt, groupsTabAt + 4000)
assert.ok(
  groupsTab.includes('enabled: g.enabled === false'),
  'the switch is inside the groups tab row, not only on the models tab',
)
assert.ok(
  groupsTab.includes('opacity: g.enabled === false ? 0.55 : 1'),
  'a disabled group is visibly dimmed in its own list',
)

console.log('GROUP-DISABLED-TESTS-PASSED')
