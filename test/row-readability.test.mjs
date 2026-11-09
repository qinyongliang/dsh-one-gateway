/**
 * Regression guard for the request-log table's two readability bugs.
 *
 * 1. The token arrows were inverted — input showed ↓ and output ↑, which reads
 *    backwards (input travels up to the model, output comes down to the caller).
 * 2. A failed row was marked only by a coloured dot and a pointer cursor, so the
 *    failure was invisible in the row itself.
 *
 * No DOM here, so these assert the rendered contract in the source.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

// Arrows: input up, output down.
assert.ok(src.includes('"↑" + (row.inputTokens'), 'input uses an up arrow')
assert.ok(src.includes('"↓" + (row.outputTokens'), 'output uses a down arrow')
assert.ok(!src.includes('"↓" + (row.inputTokens'), 'input must not use a down arrow')
assert.ok(!src.includes('"↑" + (row.outputTokens'), 'output must not use an up arrow')

// Failed rows state the reason inline, in the error colour.
assert.ok(src.includes('className: "mh-fail-inline"'), 'failed rows render an inline reason')
const styleLine = src.split('\n').find((l) => l.includes('.mh-fail-inline{')) ?? ''
assert.ok(styleLine.includes('state-error-primary'), 'the inline reason is red: ' + styleLine.slice(0, 80))
assert.ok(styleLine.includes('font-weight:600'), 'the inline reason is emphasised')

// It falls back to a label when the row has neither a code nor a message.
assert.ok(src.includes('?? t("failedLabel")'), 'inline reason falls back to a label')
assert.ok(src.includes('failedLabel: "失败"'), 'zh label present')
assert.ok(src.includes('failedLabel: "Failed"'), 'en label present')

console.log('ROW-READABILITY-TESTS-PASSED')
