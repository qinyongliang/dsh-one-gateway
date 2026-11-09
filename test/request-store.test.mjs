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

// activityDetail: the per-day consumption the wall's tooltip shows. Same day
// keys as activity, but each value is a breakdown rather than a bare count.
const detail = store.activityDetail({})
assert.deepEqual(Object.keys(detail).sort(), Object.keys(act).sort(), 'same days as the wall: ' + JSON.stringify(detail))
const todayKey = Object.keys(detail).sort().pop()
assert.equal(detail[todayKey].requests, act[todayKey], 'count agrees with activity: ' + JSON.stringify(detail[todayKey]))
assert.equal(detail[todayKey].inputTokens, 10, 'input tokens summed: ' + JSON.stringify(detail[todayKey]))
assert.equal(detail[todayKey].outputTokens, 5, 'output tokens summed: ' + JSON.stringify(detail[todayKey]))
assert.equal(detail[todayKey].answered, 1)
assert.equal(detail[todayKey].refused, 1)
// Filtered detail narrows like every other aggregate.
const detailK2 = store.activityDetail({ key: 'k2' })
assert.equal(detailK2[todayKey].requests, 1, 'filter applied: ' + JSON.stringify(detailK2))
assert.equal(detailK2[todayKey].inputTokens, 0)

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

// error details round-trip (fresh store: earlier rows were reset above)
store.record({ ts: now, key: 'k1', provider: 'p1', model: 'm1', status: 'answered', inputTokens: 1, outputTokens: 1 })
store.record({ ts: now, key: 'k1', provider: 'p1', model: 'm1', status: 'refused', inputTokens: 0, outputTokens: 0, errorCode: 'RATE_LIMIT', errorMessage: '429 too many requests' })
const failRow = store.rows({ key: 'k1' }).rows.find((r) => r.status === 'refused')
assert.equal(failRow.errorCode, 'RATE_LIMIT')
assert.equal(failRow.errorMessage, '429 too many requests')
const okRow = store.rows({ key: 'k1' }).rows.find((r) => r.status === 'answered')
assert.equal(okRow.errorCode, null)
console.log('error details round-trip ok')

// observability columns round-trip
store.record({
  ts: now, key: 'k1', provider: 'p1', model: 'm1', status: 'answered',
  inputTokens: 100, outputTokens: 50, cacheTokens: 300,
  effort: 'high', kind: 'stream', ttftMs: 1234, totalMs: 5678,
})
const rich = store.rows({ key: 'k1' }).rows.find((r) => r.effort === 'high')
assert.equal(rich.cacheTokens, 300)
assert.equal(rich.ttftMs, 1234)
assert.equal(rich.totalMs, 5678)
assert.equal(rich.kind, 'stream')
assert.equal(rich.effort, 'high')
console.log('observability columns round-trip ok')

store.close()
console.log('REQUEST-STORE-TESTS-PASSED')
