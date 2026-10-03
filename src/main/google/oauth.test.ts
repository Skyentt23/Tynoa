import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  GOOGLE_SCOPES,
  GoogleAuthError,
  buildAuthUrl,
  createPkce,
  emailFromIdToken,
  exchangeCode,
  refreshAccessToken
} from './oauth'

const client = { clientId: 'id.apps.googleusercontent.com', clientSecret: 'shh' }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function idToken(payload: object): string {
  const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.signature`
}

describe('createPkce', () => {
  it('challenge = SHA-256 du verifier en base64url', () => {
    const { verifier, challenge } = createPkce()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })
})

describe('buildAuthUrl', () => {
  it('demande un accès hors ligne avec PKCE, state et les scopes', () => {
    const url = new URL(
      buildAuthUrl({ clientId: client.clientId, redirectUri: 'http://127.0.0.1:5000', state: 'st', challenge: 'ch' })
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: client.clientId,
      redirect_uri: 'http://127.0.0.1:5000',
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      state: 'st',
      access_type: 'offline',
      prompt: 'consent'
    })
    expect(GOOGLE_SCOPES).toEqual([
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://mail.google.com/'
    ])
  })
})

describe('emailFromIdToken', () => {
  it("extrait l'email", () => expect(emailFromIdToken(idToken({ email: 'moi@gmail.com' }))).toBe('moi@gmail.com'))
  it('jeton illisible → null', () => expect(emailFromIdToken('n.importe.quoi')).toBeNull())
})

describe('exchangeCode', () => {
  it('échange le code et renvoie jetons + email', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(200, {
        access_token: 'at',
        expires_in: 3599,
        refresh_token: 'rt',
        id_token: idToken({ email: 'moi@gmail.com' })
      })
    )
    const result = await exchangeCode(
      { ...client, code: 'c0de', verifier: 'v', redirectUri: 'http://127.0.0.1:5000' },
      fetchFn,
      1_000_000
    )
    expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresAt: 1_000_000 + 3_599_000, email: 'moi@gmail.com' })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      client_id: client.clientId,
      client_secret: 'shh',
      code: 'c0de',
      code_verifier: 'v',
      grant_type: 'authorization_code',
      redirect_uri: 'http://127.0.0.1:5000'
    })
  })

  it('sans refresh_token → erreur (connexion inutilisable)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { access_token: 'at', expires_in: 3599 }))
    await expect(
      exchangeCode({ ...client, code: 'c', verifier: 'v', redirectUri: 'r' }, fetchFn)
    ).rejects.toBeInstanceOf(GoogleAuthError)
  })
})

describe('refreshAccessToken', () => {
  it('renouvelle le jeton d’accès', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { access_token: 'at2', expires_in: 3600 }))
    expect(await refreshAccessToken({ ...client, refreshToken: 'rt' }, fetchFn, 0)).toEqual({
      accessToken: 'at2',
      expiresAt: 3_600_000
    })
  })

  it('invalid_grant → revoked', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(400, { error: 'invalid_grant' }))
    await expect(refreshAccessToken({ ...client, refreshToken: 'rt' }, fetchFn)).rejects.toMatchObject({
      kind: 'revoked'
    })
  })

  it('invalid_client → invalid-client', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(401, { error: 'invalid_client' }))
    await expect(refreshAccessToken({ ...client, refreshToken: 'rt' }, fetchFn)).rejects.toMatchObject({
      kind: 'invalid-client'
    })
  })

  it('panne réseau → network', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(refreshAccessToken({ ...client, refreshToken: 'rt' }, fetchFn)).rejects.toMatchObject({
      kind: 'network'
    })
  })
})
