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

console.log('GROUP-DISABLED-TESTS-PASSED')
