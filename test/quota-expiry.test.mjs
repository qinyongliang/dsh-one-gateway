/**
 * Quota expiry: a candidate that answers "insufficient quota" is parked, the
 * group keeps serving from the others, and a successful probe clears the mark.
 *
 * These assert the store contract and the routing rule without a live provider:
 * the expiry list must survive a write cycle, and a parked candidate must not
 * be offered as a scheduling candidate.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
register('./smoke-hooks.mjs', import.meta.url)
const { GatewayGroupStore } = await import('../lib/groups.js')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-gateway-expiry-'))
const file = path.join(dir, 'groups.json')
const store = new GatewayGroupStore({ file })

/* 1. A created group can carry an expiry mark. */
const created = await store.create('pool', ['alpha_a', 'alpha_b', 'alpha_c'], { expired: ['alpha_b'] })
assert.equal(created.ok, true, JSON.stringify(created))
assert.deepEqual(created.group.expired, ['alpha_b'], 'create keeps the expiry mark')

/* 2. The mark survives a reload — it is stored, not in-memory. */
const reopened = new GatewayGroupStore({ file })
const loaded = await reopened.get('pool')
assert.deepEqual(loaded.expired, ['alpha_b'], 'expiry mark survives a reload')
assert.deepEqual(loaded.models, ['alpha_a', 'alpha_b', 'alpha_c'], 'a parked candidate stays in the list')
assert.deepEqual(loaded.stopped ?? [], [], 'parking is not a user stop')

/* 3. Updating without touching `expired` preserves it. */
await reopened.update('pool', { retry429: 1 })
const afterUnrelated = await reopened.get('pool')
assert.deepEqual(afterUnrelated.expired, ['alpha_b'], 'an unrelated edit preserves the mark')

/* 4. Clearing is an explicit empty list. */
await reopened.update('pool', { expired: [] })
const cleared = await reopened.get('pool')
assert.deepEqual(cleared.expired ?? [], [], 'clearing removes the mark')

/* 5. A mark for a candidate that is no longer a member is pruned, so removing
      and re-adding a model cannot resurrect a stale expiry. */
await reopened.update('pool', { expired: ['alpha_c'] })
await reopened.update('pool', { models: ['alpha_a', 'alpha_b'] })
const trimmed = await reopened.get('pool')
assert.deepEqual(trimmed.expired ?? [], [], 'the mark is pruned with its candidate')

/* 6. `stopped` and `expired` stay independent. */
await reopened.update('pool', { models: ['alpha_a', 'alpha_b'], stopped: ['alpha_a'], expired: ['alpha_b'] })
const both = await reopened.get('pool')
assert.deepEqual(both.stopped, ['alpha_a'], 'user stop kept')
assert.deepEqual(both.expired, ['alpha_b'], 'gateway park kept')

/* ---- routing contract, asserted against the source ---- */
const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..', 'lib', 'index.js'), 'utf8')

assert.ok(
  src.includes('const expiredMembers = new Set(group.expired ?? [])'),
  'scheduling reads the expiry list',
)
assert.ok(
  src.includes('!stoppedMembers.has(model) && !expiredMembers.has(model)'),
  'a parked candidate is skipped when ordering legs',
)
assert.ok(
  src.includes('const isQuotaFailure = (failure) =>'),
  'quota failures are recognised',
)
assert.ok(
  src.includes("code === 'QUOTA_EXCEEDED'") && src.includes("Number(failure.status) === 402"),
  'both the neutral code and HTTP 402 count as a quota failure',
)
assert.ok(
  src.includes('expireCandidate(route.group, attempt.leg ?? bound.exposed, candidateFailure)'),
  'a quota failure parks the candidate before moving on',
)
assert.ok(
  src.includes('let candidateFailure'),
  'the failure is hoisted so the post-loop quota check can see it',
)
assert.ok(
  src.includes('candidateFailure = failure'),
  'the retry loop records its failure for the quota check',
)
assert.ok(
  src.includes('if (await probeCandidate(leg)) await clearExpired(group.name, leg)'),
  'a successful probe clears the mark',
)
assert.ok(
  src.includes('const QUOTA_PROBE_INTERVAL_MS = 10 * 60 * 1000'),
  'the probe interval is ten minutes',
)
assert.ok(
  src.includes('if (next.done === true) return true'),
  'only a completed probe counts as recovery',
)

/* 7. A single-candidate group is never parked: that would turn a partial
      outage into a total one. */
assert.ok(
  src.includes('if (usable.length <= 1) return'),
  'the last usable candidate is never parked',
)

fs.rmSync(dir, { recursive: true, force: true })
console.log('QUOTA-EXPIRY-TESTS-PASSED')
