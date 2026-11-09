/** Multi-value filter regression: arrays use IN semantics across rows/totals/activity. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RequestStore } from '../lib/request-store.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-filter-'))
const store = new RequestStore({ file: path.join(dir, 't.db'), logger: console })
const now = Date.now()
store.record({ ts: now, key: 'k1', provider: 'p1', model: 'm1', status: 'answered', inputTokens: 1, outputTokens: 1 })
store.record({ ts: now, key: 'k2', provider: 'p2', model: 'm2', status: 'answered', inputTokens: 2, outputTokens: 2 })
store.record({ ts: now, key: 'k3', provider: 'p3', model: 'm3', status: 'refused', inputTokens: 0, outputTokens: 0 })

// multi-key filter
assert.equal(store.rows({ key: ['k1', 'k2'] }).total, 2)
assert.equal(store.totals({ key: ['k1', 'k2'] }).requests, 2)
assert.equal(store.totals({ key: ['k1', 'k2'] }).inputTokens, 3)
// multi-provider
assert.equal(store.totals({ provider: ['p2', 'p3'] }).requests, 2)
// multi-model
assert.equal(store.rows({ model: ['m1', 'm3'] }).total, 2)
// combined
assert.equal(store.totals({ key: ['k1', 'k2'], provider: ['p1'] }).requests, 1)
// activity respects multi filter
const act = store.activity({ key: ['k1', 'k2'] })
assert.equal(Object.values(act).reduce((a, b) => a + b, 0), 2)
// single string still works (back-compat within the API)
assert.equal(store.totals({ key: 'k1' }).requests, 1)
// empty array = no filter
assert.equal(store.totals({ key: [] }).requests, 3)
store.close()
console.log('MULTI-FILTER-TESTS-PASSED')
