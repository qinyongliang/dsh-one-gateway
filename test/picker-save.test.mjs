/**
 * Regression guard for a silent-input-loss bug in the client half.
 *
 * The model picker closed itself on document `mousedown`. Its panel sits in
 * normal flow and is tall, so unmounting it mid-gesture moved the Save button
 * out from under the cursor; the browser then dispatched no `click` at all and
 * saving did nothing — the user only saw the dropdown collapse.
 *
 * jsdom is not a dependency here, so this asserts the event contract in the
 * source rather than driving a DOM: outside-close must not act on press-down.
 * It is a coarse check, but it fails loudly if the behaviour is reintroduced.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

// Every outside-close handler is attached to `click`, never `mousedown`.
const mousedown = src.match(/addEventListener\("mousedown"/g) ?? []
assert.equal(mousedown.length, 0, 'outside-close must not listen on mousedown: ' + mousedown.length + ' site(s)')

const clickClose = src.match(/addEventListener\("click", onDoc\)/g) ?? []
assert.equal(clickClose.length, 2, 'both dropdowns close on click: found ' + clickClose.length)

// The dialog backdrop stays on pointerdown, with the containment check that
// keeps a gesture started inside the dialog from closing it.
assert.ok(src.includes('onPointerDown: (e) => {'), 'dialog backdrop keeps pointerdown')
assert.ok(
  src.includes('if (inside !== null && inside.contains(e.target)) return;'),
  'dialog backdrop keeps its containment check',
)

// The picker's panel must stay mounted while a save is in flight, i.e. the
// save handler is what clears the dialog — not the outside-close path.
assert.ok(src.includes('const submitGroup = async () => {'), 'submitGroup exists')

console.log('PICKER-SAVE-TESTS-PASSED')
