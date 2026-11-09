/**
 * Model aliases: friendly public names for concrete provider models.
 *
 * An alias is a pure routing preference, like a group: it lives in its own
 * JSON document next to the group store, is read on every request that might
 * name one, and never touches credentials. Renaming a model here does not
 * rename anything on the provider — the canonical `<provider>_<model>` id
 * keeps working, and the alias is simply another way to spell it.
 *
 * Naming rules match groups (letters/digits/-/., no underscore) so the three
 * namespaces — canonical ids, group names, aliases — cannot collide: the
 * underscore is the provider separator, and an alias may not contain one.
 *
 * @module dsh-one-gateway/aliases
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { foldName } from './names.js'

/** Default alias store location inside the DSH home directory. */
export function defaultAliasesFile() {
  return dshHomePath('model-hub-aliases.json')
}

/** Same shape as group names: no underscore, so namespaces stay disjoint. */
export function isValidAliasName(name) {
  return typeof name === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$/.test(name)
}

/**
 * File-backed alias store with serialized writes and a cached document.
 *
 * The document is `{ version: 1, aliases: [{ alias, target }] }` where target
 * is the canonical exposed id (`<provider>_<model>`). A corrupt record is
 * dropped rather than repaired; a corrupt file loads empty and is kept on
 * disk until real data replaces it.
 */
export class AliasStore {
  #file
  #logger
  #cache
  #dismissed = new Set()
  #queue = Promise.resolve()

  constructor({ file = defaultAliasesFile(), logger } = {}) {
    this.#file = file
    this.#logger = logger
  }

  get file() { return this.#file }

  async #load() {
    if (this.#cache !== undefined) return this.#cache
    let text
    try {
      text = await readFile(this.#file, 'utf8')
    } catch {
      this.#cache = []
      return this.#cache
    }
    let document
    try {
      document = JSON.parse(text)
    } catch {
      this.#logger?.warn?.(`dsh-one-gateway: ${this.#file} is not valid JSON; treating it as empty`)
      this.#cache = []
      return this.#cache
    }
    this.#dismissed = new Set(Array.isArray(document?.dismissed) ? document.dismissed.filter((x) => typeof x === 'string') : [])
    const rows = Array.isArray(document?.aliases) ? document.aliases : []
    const seen = new Set()
    const aliases = []
    for (const row of rows) {
      // Folded on load: a document written before names were case-insensitive
      // can hold "GLM-5.3-Flash" next to "glm-5.3-flash", and both have to land
      // on the same name rather than shadowing each other.
      const alias = foldName(typeof row?.alias === 'string' ? row.alias : '')
      const target = typeof row?.target === 'string' ? row.target.trim() : ''
      if (!isValidAliasName(alias) || target === '' || seen.has(alias)) continue
      seen.add(alias)
      aliases.push({ alias, target })
    }
    this.#cache = aliases
    return aliases
  }

  async #persist(aliases) {
    const run = async () => {
      await mkdir(dirname(this.#file), { recursive: true })
      const temp = `${this.#file}.${process.pid}.tmp`
      await writeFile(temp, `${JSON.stringify({ version: 1, aliases, dismissed: [...this.#dismissed] }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temp, this.#file)
      this.#cache = aliases
    }
    this.#queue = this.#queue.then(run, run)
    return this.#queue
  }

  /** Every alias, in stored order. */
  async all() {
    return [...await this.#load()]
  }

  /** Whether an auto name was manually dismissed (deleted by the user). */
  async isDismissed(alias) {
    await this.#load()
    return this.#dismissed.has(foldName(alias))
  }

  /** Record a manual dismissal so the auto pass never recreates it. */
  async dismiss(alias) {
    await this.#load()
    const name = foldName(alias)
    if (this.#dismissed.has(name)) return
    this.#dismissed.add(name)
    await this.#persist(await this.#load())
  }

  /** Clear a dismissal: the user explicitly wants this name back. */
  async undismiss(alias) {
    await this.#load()
    const name = foldName(alias)
    if (!this.#dismissed.has(name)) return
    this.#dismissed.delete(name)
    await this.#persist(await this.#load())
  }

  /** The canonical target an alias names, or undefined. */
  async resolve(alias) {
    const name = foldName(alias)
    const hit = (await this.#load()).find((row) => row.alias === name)
    return hit?.target
  }

  /**
   * Create or replace one alias.
   * @returns `{ ok: true, alias }` or `{ ok: false, error }`.
   */
  async set(alias, target) {
    const name = foldName(alias)
    const to = typeof target === 'string' ? target.trim() : ''
    if (!isValidAliasName(name)) {
      return { ok: false, error: 'alias must start with a letter or digit and contain only letters, digits, - and . (no underscore)' }
    }
    if (to === '' || !to.includes('_')) {
      return { ok: false, error: 'target must be a canonical model id such as provider_model' }
    }
    const aliases = (await this.#load()).filter((row) => row.alias !== name)
    aliases.push({ alias: name, target: to })
    await this.#persist(aliases)
    return { ok: true, alias: { alias: name, target: to } }
  }

  /** Remove one alias; false when it did not exist. */
  async remove(alias) {
    const name = foldName(alias)
    const aliases = await this.#load()
    const next = aliases.filter((row) => row.alias !== name)
    if (next.length === aliases.length) return false
    await this.#persist(next)
    return true
  }
}
