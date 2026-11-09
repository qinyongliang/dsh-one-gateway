/**
 * Time-window filter regression.
 *
 * The window arrives as epoch-ms bounds on `requests.ts` and as day strings
 * on the `daily` aggregates, so both units are asserted here: a row outside
 * the window must disappear from the table AND from the totals.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RequestStore } from '../lib/request-store.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'time-range-'))
const store = new RequestStore({ file: path.join(dir, 't.db'), logger: console })

const DAY = 86400000
const now = Date.now()
const dayKey = (ms) => {
  const d = new Date(ms)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

store.record({ ts: now - 20 * DAY, key: 'k', provider: 'p', model: 'old', status: 'answered', inputTokens: 1, outputTokens: 1 })
store.record({ ts: now - 3 * DAY, key: 'k', provider: 'p', model: 'mid', status: 'answered', inputTokens: 2, outputTokens: 2 })
store.record({ ts: now, key: 'k', provider: 'p', model: 'new', status: 'answered', inputTokens: 4, outputTokens: 4 })

// No window: everything, both units agree.
assert.equal(store.rows().total, 3)
assert.equal(store.totals().requests, 3)

// Window covering only the newest two rows.
const from = now - 5 * DAY
const windowMs = { from }
assert.equal(store.rows(windowMs).total, 2)
const dayWindow = { fromDay: dayKey(from) }
assert.equal(store.totals(dayWindow).requests, 2)
assert.equal(store.totals(dayWindow).inputTokens, 6)

// Closed interval: an upper bound excludes the newest row.
const to = now - 1 * DAY
assert.equal(store.rows({ to }).total, 2)
assert.equal(store.totals({ toDay: dayKey(to) }).requests, 2)

// Both bounds together select exactly one row.
assert.equal(store.rows({ from: now - 5 * DAY, to: now - 1 * DAY }).total, 1)
assert.equal(store.totals({ fromDay: dayKey(now - 5 * DAY), toDay: dayKey(now - 1 * DAY) }).requests, 1)

// The window composes with the dimension filters.
assert.equal(store.rows({ from, model: ['mid', 'old'] }).total, 1)
assert.equal(store.totals({ fromDay: dayKey(from), model: ['mid', 'new'] }).requests, 2)

// An empty window object changes nothing.
assert.equal(store.rows({ from: undefined, to: undefined }).total, 3)
assert.equal(store.totals({ fromDay: '', toDay: '' }).requests, 3)

// The wall respects the window too.
const act = store.activity({ fromDay: dayKey(from) })
assert.equal(Object.values(act).reduce((a, b) => a + b, 0), 2)

store.close()
console.log('TIME-RANGE-TESTS-PASSED')
