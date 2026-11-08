/** Direct unit test: 30-day row retention + forever daily aggregates. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RequestStore } from '../lib/request-store.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-store-'))
const store = new RequestStore({ file: path.join(dir, 'test.db'), logger: console })

const now = Date.now()
const old = now - 40 * 86400000
// one old row (beyond 30 days) + two fresh rows
store.record({ ts: old, key: 'k1', provider: 'p1', model: 'm1', status: 'answered', inputTokens: 10, outputTokens: 5 })
store.prune(true) // force prune with today's date
store.record({ ts: now, key: 'k1', provider: 'p1', model: 'm1', status: 'answered', inputTokens: 10, outputTokens: 5 })
store.record({ ts: now, key: 'k2', provider: 'p2', model: 'm2', status: 'refused', inputTokens: 0, outputTokens: 0 })

// rows: old row pruned
const { rows, total } = store.rows({})
assert.equal(total, 2, 'old row pruned from requests')
assert.ok(rows.every((r) => r.ts >= now - 30 * 86400000))

// totals: forever — includes the old row
const totals = store.totals({})
assert.equal(totals.requests, 3, 'daily keeps old row: ' + JSON.stringify(totals))
assert.equal(totals.answered, 2)
assert.equal(totals.refused, 1)
assert.equal(totals.inputTokens, 20)

// filtered totals
const f = store.totals({ key: 'k2' })
assert.equal(f.requests, 1)
assert.equal(f.refused, 1)

// activity map has both days
const act = store.activity({})
assert.equal(Object.keys(act).length, 2, 'wall covers old + new day: ' + JSON.stringify(act))

// pagination
store.record({ ts: now, key: 'k1', provider: 'p1', model: 'm1', status: 'answered', inputTokens: 1, outputTokens: 1 })
const p1 = store.rows({ limit: 2, offset: 0 })
const p2 = store.rows({ limit: 2, offset: 2 })
assert.equal(p1.rows.length, 2)
assert.equal(p2.rows.length, 1)
assert.equal(p1.total, 3)

// dimensions
const dims = store.dimensions()
assert.deepEqual(dims.keys.sort(), ['k1', 'k2'])

// reset wipes both
store.reset()
assert.equal(store.rows({}).total, 0)
assert.equal(store.totals({}).requests, 0)

store.close()
console.log('REQUEST-STORE-TESTS-PASSED')
