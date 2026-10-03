import { describe, it, expect } from 'vitest'
import { reconnectDelay } from './backoff'

describe('reconnectDelay', () => {
  it('5 s, 10 s, 30 s, 1 min, puis 5 min', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(reconnectDelay)).toEqual([
      5_000, 10_000, 30_000, 60_000, 300_000, 300_000, 300_000
    ])
  })
})
