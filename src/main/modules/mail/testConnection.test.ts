import { describe, it, expect, vi, afterEach } from 'vitest'
import { testConnection } from './testConnection'
import { MailAuthError, type ImapSession } from './types'

const creds = { user: 'moi@gmail.com', pass: 'pw' }

function fakeSession(connect: () => Promise<void>): ImapSession & { close: ReturnType<typeof vi.fn> } {
  return {
    connect,
    openInbox: vi.fn(async () => ({ uidValidity: '1', uidNext: 1 })),
    fetchSince: vi.fn(async () => []),
    onNewMail: vi.fn(),
    onClose: vi.fn(),
    close: vi.fn(async () => undefined)
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('testConnection', () => {
  it('ok et ferme la session', async () => {
    const s = fakeSession(async () => undefined)
    expect(await testConnection(() => s, creds)).toEqual({ ok: true })
    expect(s.close).toHaveBeenCalled()
  })

  it('refus → auth', async () => {
    const s = fakeSession(async () => {
      throw new MailAuthError()
    })
    expect(await testConnection(() => s, creds)).toEqual({ ok: false, reason: 'auth' })
    expect(s.close).toHaveBeenCalled()
  })

  it('autre erreur → network', async () => {
    const s = fakeSession(async () => {
      throw new Error('ENOTFOUND')
    })
    expect(await testConnection(() => s, creds)).toEqual({ ok: false, reason: 'network' })
  })

  it('délai dépassé → network', async () => {
    vi.useFakeTimers()
    const s = fakeSession(() => new Promise<void>(() => undefined))
    const result = testConnection(() => s, creds, 1_000)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await result).toEqual({ ok: false, reason: 'network' })
    expect(s.close).toHaveBeenCalled()
  })
})
