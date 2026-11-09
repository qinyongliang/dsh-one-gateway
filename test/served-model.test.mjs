/**
 * A group's name says what was asked for; `served` says what answered.
 *
 * Without this, a row for group "free" cannot tell you whether ling or qoder
 * ran the call — the group name overwrote that fact. The two are kept as
 * separate columns so the group name stays queryable and no existing reader
 * changes meaning.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RequestStore } from '../lib/request-store.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'served-'))
const store = new RequestStore({ file: path.join(dir, 'test.db'), logger: console })
const now = Date.now()

// A grouped call: the group name is what was requested, the member is what ran.
store.record({
  ts: now, key: 'k', provider: 'ling', model: 'free', status: 'answered',
  inputTokens: 1827, outputTokens: 168, served: 'ling_glm-5.3-flash',
})
// A direct call: served matches the requested model, and is still recorded.
store.record({
  ts: now + 1, key: 'k', provider: 'trae', model: 'trae_glm-5.3-flash', status: 'answered',
  inputTokens: 10, outputTokens: 5, served: 'trae_glm-5.3-flash',
})
// A failure keeps its member too, so a failed leg is identifiable.
store.record({
  ts: now + 2, key: 'k', provider: 'trae', model: 'free', status: 'refused',
  inputTokens: 0, outputTokens: 0, served: 'trae_glm-5.3-flash',
  errorCode: 'CONTEXT_WINDOW_EXCEEDED', errorMessage: 'overflow',
})

// Written BEFORE the query, so the read-back assertion below sees it.
// Old rows (written before this column existed) must read back as null, not
// undefined — the client distinguishes "no data" from "empty string".
store.record({ ts: now + 3, key: 'k', provider: 'p', model: 'legacy', status: 'answered' })

const { rows } = store.rows({ limit: 10 })
// Match on the model, not on the timestamp: `ts` is an integer column and the
// rows are ordered newest-first, so a positional or arithmetic lookup is
// fragile in exactly the way this test should not be.
const byModel = (name, provider) => rows.find((r) => r.model === name && r.provider === provider)

// The group name is preserved as the requested model.
assert.equal(byModel('free','ling').model, 'free', 'the requested name stays the group')
// The member that actually answered is recorded beside it.
assert.equal(byModel('free','ling').served, 'ling_glm-5.3-flash', 'served records the member that answered')
// A direct call records itself, so readers need no special case.
assert.equal(byModel('trae_glm-5.3-flash','trae').served, 'trae_glm-5.3-flash', 'a direct call records its own model')
assert.equal(byModel('trae_glm-5.3-flash','trae').served, byModel('trae_glm-5.3-flash','trae').model, 'for a direct call served equals model')
// A failed attempt still names the leg that failed.
assert.equal(byModel('free','trae').served, 'trae_glm-5.3-flash', 'a failed attempt records the leg')
assert.equal(byModel('free','trae').errorCode, 'CONTEXT_WINDOW_EXCEEDED')

assert.equal(byModel('legacy','p').served, null, 'a row without served reads back as null')

store.close()
console.log('SERVED-MODEL-TESTS-PASSED')
