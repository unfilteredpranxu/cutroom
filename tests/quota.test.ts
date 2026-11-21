import { DatabaseSync } from 'node:sqlite'
import type { DurableObjectState } from '@cloudflare/workers-types'
import { expect, it, vi } from 'vitest'
import { AnalysisQuota } from '../worker/quota'

it('enforces the rolling-minute and UTC-day caps using persistent SQL', async () => {
  const db = new DatabaseSync(':memory:')
  const sql = {
    exec(query: string, ...params: number[]) {
      const statement = db.prepare(query)
      if (query.startsWith('SELECT')) return { one: () => statement.get(...params), toArray: () => statement.all(...params) }
      statement.run(...params)
    },
  }
  const state = { storage: { sql } } as unknown as DurableObjectState

  vi.useFakeTimers()
  try {
    const day = Date.UTC(2026, 10, 21)
    vi.setSystemTime(day)
    let quota = new AnalysisQuota(state)
    expect((await quota.fetch()).status).toBe(204)
    expect((await quota.fetch()).status).toBe(204)
    expect((await quota.fetch()).headers.get('Retry-After')).toBe('60')
    for (let minute = 1; minute < 5; minute++) {
      vi.setSystemTime(day + minute * 60_000)
      quota = new AnalysisQuota(state)
      expect((await quota.fetch()).status).toBe(204)
      expect((await quota.fetch()).status).toBe(204)
    }
    vi.setSystemTime(day + 5 * 60_000)
    const capped = await quota.fetch()
    expect(capped.status).toBe(429)
    expect(capped.headers.get('Retry-After')).toBe(String(86_400 - 300))
    vi.setSystemTime(day + 86_400_000)
    expect((await quota.fetch()).status).toBe(204)
  } finally {
    vi.useRealTimers()
    db.close()
  }
})
