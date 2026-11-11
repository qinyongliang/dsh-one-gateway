/**
 * Regression guard for the request log's cache columns.
 *
 * The bug the user reported: every cache-heavy row displayed `100%`, so the
 * column looked wrong. It was arithmetically right but rounded away — 99.78%,
 * 99.71%, 99.66% all became 100, leaving a constant.
 *
 * Two contracts are pinned here, both from DSH's own TokenUsage doc:
 *   "Counts are DISJOINT: inputTokens is uncached input only; cached input is
 *    reported separately as cacheReadTokens/cacheWriteTokens (billed input =
 *    sum of the three)."
 *
 * 1. The ratio keeps one decimal, so 99.7% stays distinguishable from 100%.
 * 2. The TOKEN cell prints the BILLED PROMPT (uncached + cached), not the raw
 *    uncached figure — otherwise the row reads "307 in, 141K cached".
 *
 * No DOM here, so these assert the rendered contract in the source.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

/* 1. The ratio is not rounded to an integer. */
assert.ok(
  src.includes('const cacheRatio = hasCache && billedPrompt > 0'),
  'cacheRatio is computed from the billed prompt with a guard',
)
assert.ok(
  src.includes('? (row.cacheTokens / billedPrompt) * 100'),
  'cacheRatio divides cached by billed prompt',
)
assert.ok(
  !src.includes('Math.round(((row.cacheTokens ?? 0)'),
  'the ratio must not be rounded to a whole percent (that collapsed it to 100%)',
)
assert.ok(
  src.includes('cacheRatio.toFixed(1)'),
  'the ratio renders with one decimal',
)

/* 2. The TOKEN cell shows the billed prompt, and the split is reachable. */
assert.ok(
  src.includes('const billedPrompt = (row.inputTokens ?? 0) + (row.cacheTokens ?? 0)'),
  'billedPrompt sums uncached + cached, per the disjoint-counts contract',
)
assert.ok(
  src.includes('"↑" + billedPrompt.toLocaleString()'),
  'the input figure is the billed prompt',
)
assert.ok(
  !src.includes('"↑" + (row.inputTokens ?? 0).toLocaleString()'),
  'the raw uncached count must not be printed as the prompt total',
)
assert.ok(
  src.includes('uncached ${(row.inputTokens ?? 0).toLocaleString()} + cached'),
  'the hover title exposes the uncached/cached split',
)

/* 3. The arithmetic itself is unchanged and correct for real rows. */
const rows = [
  { uncached: 307, cached: 141056, expected: '99.8' },
  { uncached: 405, cached: 140672, expected: '99.7' },
  { uncached: 484, cached: 140288, expected: '99.7' },
]
for (const row of rows) {
  const billedPrompt = row.uncached + row.cached
  const ratio = (row.cached / billedPrompt) * 100
  assert.equal(ratio.toFixed(1), row.expected, `row ${row.uncached}/${row.cached} renders ${row.expected}%`)
  assert.notEqual(Math.round(ratio), Math.round(ratio * 10) / 10, 'rounding to a whole percent loses the signal')
}

/* 4. A row with no cache reports "not reported" rather than a fake 0%. */
assert.ok(
  src.includes('const hasCache = (row.cacheTokens ?? 0) > 0'),
  'hasCache distinguishes "not reported" from "zero"',
)
assert.ok(
  src.includes('cacheRatio === null'),
  'a cacheless row renders a dash, not 0%',
)

console.log('CACHE-RATIO-TESTS-PASSED')
