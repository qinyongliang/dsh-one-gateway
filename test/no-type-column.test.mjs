/**
 * Guard: the request table has no "type" column.
 *
 * Every request this gateway serves is streamed, so a column that says "stream"
 * on every row carries no information — it is a constant dressed up as a
 * metric. The `kind` field is still recorded in the database, because it is a
 * fact about the request; it just is not worth a column.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

// The header list must not name a type column.
assert.ok(!client.includes('"colType"'), 'the request table header must not declare a type column')
assert.ok(!/colType\s*:/.test(client), 'no colType label may remain in the dictionary')

// Its cell, labels and style are gone too.
assert.ok(!client.includes('streamLabel'), 'the stream label is unused once the column is gone')
assert.ok(!client.includes('bufferedLabel'), 'the buffered label is unused once the column is gone')
assert.ok(!client.includes('is-stream'), 'the stream tag style is unused once the column is gone')

// The remaining header labels still line up with the remaining cells: the type
// cell sat between the model and effort cells, so both must still be present.
assert.ok(client.includes('["colTime", "keys", "colModel", "colEffort", "colTokens"]'),
  'the header must list the remaining columns in order')

console.log('NO-TYPE-COLUMN-TESTS-PASSED')
