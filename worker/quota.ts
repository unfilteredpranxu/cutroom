import type { DurableObjectState } from '@cloudflare/workers-types'

const MINUTE = 60_000
const DAY = 86_400_000
const PER_MINUTE = 2
const PER_DAY = 10

export class AnalysisQuota {
  constructor(private readonly state: DurableObjectState) {}

  async fetch() {
    const sql = this.state.storage.sql
    const now = Date.now()
    const dayStart = Math.floor(now / DAY) * DAY
    const minuteStart = now - MINUTE

    // All SQL runs synchronously in one Durable Object turn.
    sql.exec('CREATE TABLE IF NOT EXISTS attempts (at INTEGER NOT NULL)')
    sql.exec('DELETE FROM attempts WHERE at < ?', Math.min(dayStart, minuteStart))
    const daily = sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM attempts WHERE at >= ?', dayStart).one()
    const recent = sql.exec<{ at: number }>('SELECT at FROM attempts WHERE at > ? ORDER BY at', minuteStart).toArray()

    const nextDay = daily.count >= PER_DAY ? dayStart + DAY : now
    const nextMinute = recent.length >= PER_MINUTE ? recent[0].at + MINUTE : now
    const retry = Math.ceil((Math.max(nextDay, nextMinute) - now) / 1000)
    if (retry > 0) return new Response(null, { status: 429, headers: { 'Retry-After': String(retry) } })

    sql.exec('INSERT INTO attempts (at) VALUES (?)', now)
    return new Response(null, { status: 204 })
  }
}
