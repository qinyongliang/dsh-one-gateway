/**
 * Self-contained stand-in for the schemastery surface `lib/index.js` uses at
 * load time to declare its `Config`. The published repository must run
 * `npm test` without a harness checkout, so this keeps the module loadable
 * instead of resolving schemastery from a local install path.
 *
 * The smoke test drives `apply()` with an already-plain config object, so no
 * validation runs here; the real schema is validated by the harness Loader.
 */
const leaf = () => ({ kind: 'leaf' })
function Schema() {}
Schema.prototype.object = function object(fields) { return { kind: 'object', fields } }
Schema.prototype.string = leaf
Schema.prototype.number = leaf
Schema.prototype.boolean = leaf
Schema.prototype.array = function array(inner) { return { kind: 'array', inner } }
Schema.prototype.union = function union(inner) { return { kind: 'union', inner } }

const schema = new Schema()
schema.object = (fields) => ({ kind: 'object', fields })
schema.string = leaf
schema.number = leaf
schema.boolean = leaf
schema.array = (inner) => ({ kind: 'array', inner })
schema.union = (inner) => ({ kind: 'union', inner })

export default schema
