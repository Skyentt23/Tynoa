import { describe, it, expect, vi } from 'vitest'
import type { GoogleStatus } from '../../shared/events'
import { GoogleAccount, type GoogleAccountDeps } from './googleAccount'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const idToken = `x.${Buffer.from(JSON.stringify({ email: 'moi@gmail.com' })).toString('base64url')}.y`

function setup(opts: { token?: string | null; client?: boolean; fetchFn?: GoogleAccountDeps['fetchFn'] } = {}) {
  let stored: string | null = opts.token === undefined ? null : opts.token
  const tokenStore = {
    save: vi.fn((t: string) => {
      stored = t
    }),
    load: () => stored,
    has: () => stored !== null,
    clear: vi.fn(() => {
      stored = null
    })
  }
  const statuses: GoogleStatus[] = []
  let now = 1_000_000
  const fetchFn =
    opts.fetchFn ??
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(init?.body as string)
      if (body.get('grant_type') === 'authorization_code') {
        return jsonResponse(200, { access_token: 'at1', expires_in: 3600, refresh_token: 'rt', id_token: idToken })
      }
      return jsonResponse(200, { access_token: 'at2', expires_in: 3600 })
    })
  const openBrowser = vi.fn()
  const onConnected = vi.fn()
  const account = new GoogleAccount({
    getClient: () => (opts.client === false ? null : { clientId: 'id', clientSecret: 's' }),
    tokenStore,
    fetchFn,
    openBrowser,
    onStatus: (s) => statuses.push(s),
    onConnected,
    waitForAuthCode: async () => ({ redirectUri: 'http://127.0.0.1:1', code: Promise.resolve('c0de') }),
    now: () => now
  })
  return { account, tokenStore, statuses, fetchFn, openBrowser, onConnected, advance: (ms: number) => (now += ms) }
}

describe('GoogleAccount.connect', () => {
  it('ouvre le navigateur, enregistre le jeton et signale l’email', async () => {
    const t = setup()
    expect(await t.account.connect()).toEqual({ ok: true, email: 'moi@gmail.com' })
    expect(t.openBrowser.mock.calls[0][0]).toMatch(/^https:\/\/accounts\.google\.com\//)
    expect(t.tokenStore.save).toHaveBeenCalledWith('rt')
    expect(t.onConnected).toHaveBeenCalledWith('moi@gmail.com')
    expect(t.statuses.at(-1)).toEqual({ state: 'connected', email: 'moi@gmail.com' })
    expect(await t.account.getAccessToken()).toBe('at1')
  })

  it('sans identifiant client configuré → not-configured', async () => {
    const t = setup({ client: false })
    expect(await t.account.connect()).toEqual({ ok: false, reason: 'not-configured' })
    expect(t.openBrowser).not.toHaveBeenCalled()
  })

  it('identifiant client refusé → invalid-client', async () => {
    const t = setup({ fetchFn: vi.fn(async () => jsonResponse(401, { error: 'invalid_client' })) })
    expect(await t.account.connect()).toEqual({ ok: false, reason: 'invalid-client' })
    expect(t.tokenStore.save).not.toHaveBeenCalled()
  })
})

describe('GoogleAccount.getAccessToken', () => {
  it('non connecté → null, sans appel réseau', async () => {
    const t = setup()
    expect(await t.account.getAccessToken()).toBeNull()
    expect(t.fetchFn).not.toHaveBeenCalled()
  })

  it('renouvelle avec le jeton enregistré puis garde en cache jusqu’à 60 s de l’expiration', async () => {
    const t = setup({ token: 'rt' })
    expect(await t.account.getAccessToken()).toBe('at2')
    expect(await t.account.getAccessToken()).toBe('at2')
    expect(t.fetchFn).toHaveBeenCalledTimes(1)
    t.advance(3_600_000 - 59_000)
    await t.account.getAccessToken()
    expect(t.fetchFn).toHaveBeenCalledTimes(2)
  })

  it('appels simultanés → un seul renouvellement', async () => {
    const t = setup({ token: 'rt' })
    await Promise.all([t.account.getAccessToken(), t.account.getAccessToken()])
    expect(t.fetchFn).toHaveBeenCalledTimes(1)
  })

  it('révocation : efface le jeton, signale error/revoked, et ne réessaie plus', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(400, { error: 'invalid_grant' }))
    const t = setup({ token: 'rt', fetchFn })
    expect(await t.account.getAccessToken()).toBeNull()
    expect(t.tokenStore.clear).toHaveBeenCalled()
    expect(t.statuses.at(-1)).toEqual({ state: 'error', reason: 'revoked' })
    expect(await t.account.getAccessToken()).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('panne réseau → lève une erreur network sans effacer le jeton', async () => {
    const t = setup({
      token: 'rt',
      fetchFn: vi.fn(async () => {
        throw new TypeError('fetch failed')
      })
    })
    await expect(t.account.getAccessToken()).rejects.toMatchObject({ kind: 'network' })
    expect(t.tokenStore.clear).not.toHaveBeenCalled()
  })
})

describe('GoogleAccount.disconnect', () => {
  it('efface le jeton et signale disconnected', async () => {
    const t = setup({ token: 'rt' })
    t.account.disconnect()
    expect(t.account.isConnected()).toBe(false)
    expect(t.statuses.at(-1)).toEqual({ state: 'disconnected' })
    expect(await t.account.getAccessToken()).toBeNull()
  })
})

describe('GoogleAccount.invalidate', () => {
  it('force un renouvellement au prochain appel', async () => {
    const t = setup({ token: 'rt' })
    await t.account.getAccessToken()
    t.account.invalidate()
    await t.account.getAccessToken()
    expect(t.fetchFn).toHaveBeenCalledTimes(2)
  })
})
