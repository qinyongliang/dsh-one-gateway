/**
 * SQLite-backed request history.
 *
 * Two tables with different lifetimes on purpose:
 *  - requests: one row per call (ts, key, provider, model, status, tokens).
 *    Pruned to the last 30 days — the paginated table reads this.
 *  - daily: per-day counters keyed by (day, key, provider, model). Never
 *    pruned — totals and the contribution wall read this, so the aggregate
 *    history outlives the row retention.
 *
 * node:sqlite is built into Node >=22.19; no dependency, no build step.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const ROW_RETENTION_DAYS = 30

export class RequestStore {
  #db
  #logger
  #lastPruneDay = ''

  constructor({ file, logger }) {
    this.#logger = logger
    mkdirSync(dirname(file), { recursive: true })
    this.#db = new DatabaseSync(file)
    this.#db.exec('PRAGMA journal_mode = WAL;')
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        key TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts);
      CREATE TABLE IF NOT EXISTS daily (
        day TEXT NOT NULL,
        key TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        requests INTEGER NOT NULL DEFAULT 0,
        answered INTEGER NOT NULL DEFAULT 0,
        refused INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, key, provider, model)
      );
    `)
    this.prune(true)
  }

  #dailyStmt() {
    return this.#db.prepare(`
      INSERT INTO daily (day, key, provider, model, requests, answered, refused, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(day, key, provider, model) DO UPDATE SET
        requests = requests + 1,
        answered = answered + excluded.answered,
        refused = refused + excluded.refused,
        input_tokens = input_tokens + excluded.input_tokens,
        output_tokens = output_tokens + excluded.output_tokens
    `)
  }

  #fold(stmt, row) {
    const d = new Date(row.ts)
    const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    stmt.run(day, String(row.key ?? 'anonymous'), String(row.provider ?? ''), row.model,
      row.status === 'answered' ? 1 : 0, row.status === 'answered' ? 0 : 1,
      row.inputTokens ?? 0, row.outputTokens ?? 0)
  }

  /** Record one call: row + forever-daily fold, in one transaction. */
  record(row) {
    try {
      const insert = this.#db.prepare('INSERT INTO requests (ts, key, provider, model, status, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)')
      const fold = this.#dailyStmt()
      this.#db.exec('BEGIN')
      insert.run(row.ts, String(row.key ?? 'anonymous'), String(row.provider ?? ''), row.model, String(row.status ?? 'answered'), row.inputTokens ?? 0, row.outputTokens ?? 0)
      this.#fold(fold, row)
      this.#db.exec('COMMIT')
      this.prune()
    } catch (error) {
      try { this.#db.exec('ROLLBACK') } catch {}
      this.#logger?.warn?.('dsh-one-gateway: request record failed', error)
    }
  }

  /**
   * Drop request rows older than 30 days; daily aggregates are untouched.
   * Runs at most once per day in the record path; an explicit call always
   * prunes (force), which is what startup and tests use.
   */
  prune(force = false) {
    const today = new Date().toISOString().slice(0, 10)
    if (!force && today === this.#lastPruneDay) return
    this.#lastPruneDay = today
    try {
      const cutoff = Date.now() - ROW_RETENTION_DAYS * 86400000
      this.#db.prepare('DELETE FROM requests WHERE ts < ?').run(cutoff)
    } catch (error) {
      this.#logger?.warn?.('dsh-one-gateway: request prune failed', error)
    }
  }

  /** Filtered rows, newest first, paginated. */
  rows({ key, provider, model, limit = 20, offset = 0 } = {}) {
    const where = []
    const args = []
    if (key) { where.push('key = ?'); args.push(key) }
    if (provider) { where.push('provider = ?'); args.push(provider) }
    if (model) { where.push('model = ?'); args.push(model) }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const total = this.#db.prepare('SELECT COUNT(*) AS n FROM requests ' + clause).get(...args).n
    const rows = this.#db.prepare('SELECT ts, key, provider, model, status, input_tokens AS inputTokens, output_tokens AS outputTokens FROM requests ' + clause + ' ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?').all(...args, limit, offset)
    return { rows, total }
  }

  /** Forever totals for the filter (from daily, not the pruned rows). */
  totals({ key, provider, model } = {}) {
    const where = []
    const args = []
    if (key) { where.push('key = ?'); args.push(key) }
    if (provider) { where.push('provider = ?'); args.push(provider) }
    if (model) { where.push('model = ?'); args.push(model) }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const row = this.#db.prepare('SELECT COALESCE(SUM(requests),0) AS requests, COALESCE(SUM(answered),0) AS answered, COALESCE(SUM(refused),0) AS refused, COALESCE(SUM(input_tokens),0) AS inputTokens, COALESCE(SUM(output_tokens),0) AS outputTokens FROM daily ' + clause).get(...args)
    return row
  }

  /** Day -> request count for the contribution wall (forever). */
  activity({ key, provider, model } = {}) {
    const where = []
    const args = []
    if (key) { where.push('key = ?'); args.push(key) }
    if (provider) { where.push('provider = ?'); args.push(provider) }
    if (model) { where.push('model = ?'); args.push(model) }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const rows = this.#db.prepare('SELECT day, SUM(requests) AS n FROM daily ' + clause + ' GROUP BY day').all(...args)
    return Object.fromEntries(rows.map((r) => [r.day, r.n]))
  }

  /** Distinct filter values seen in daily history. */
  dimensions() {
    const keys = this.#db.prepare('SELECT DISTINCT key FROM daily').all().map((r) => r.key)
    const providers = this.#db.prepare('SELECT DISTINCT provider FROM daily').all().map((r) => r.provider)
    const models = this.#db.prepare('SELECT DISTINCT model FROM daily').all().map((r) => r.model)
    return { keys, providers, models }
  }

  /** Wipe both tables (explicit reset). */
  reset() {
    this.#db.exec('DELETE FROM requests; DELETE FROM daily;')
  }

  close() {
    try { this.#db.close() } catch {}
  }
}
