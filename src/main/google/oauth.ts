import { createHash, randomBytes } from 'node:crypto'

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  // IMAP par OAuth n'accepte que ce scope ; Tynoa reste en lecture seule.
  'https://mail.google.com/'
]

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export type GoogleAuthErrorKind = 'revoked' | 'network' | 'invalid-client'

export class GoogleAuthError extends Error {
  constructor(
    readonly kind: GoogleAuthErrorKind,
    detail?: string
  ) {
    super(detail ? `Google OAuth (${kind}) : ${detail}` : `Google OAuth (${kind})`)
    this.name = 'GoogleAuthError'
  }
}

export interface OAuthClient {
  clientId: string
  clientSecret: string
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function buildAuthUrl(p: {
  clientId: string
  redirectUri: string
  state: string
  challenge: string
}): string {
  const params = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
    // Jeton de renouvellement durable ; `consent` le garantit même lors d'une reconnexion.
    access_type: 'offline',
    prompt: 'consent'
  })
  return `${AUTH_URL}?${params}`
}

/** L'id_token vient directement du point de terminaison de Google (TLS) : pas besoin de vérifier la signature. */
export function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  id_token?: string
  error?: string
}

async function postToken(body: Record<string, string>, fetchFn: FetchFn): Promise<TokenResponse> {
  let res: Response
  try {
    res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString()
    })
  } catch (err) {
    throw new GoogleAuthError('network', err instanceof Error ? err.message : String(err))
  }
  const json = (await res.json().catch(() => ({}))) as TokenResponse
  if (res.ok && json.access_token) return json
  if (json.error === 'invalid_grant') throw new GoogleAuthError('revoked', json.error)
  if (json.error === 'invalid_client' || json.error === 'unauthorized_client') {
    throw new GoogleAuthError('invalid-client', json.error)
  }
  throw new GoogleAuthError('network', json.error ?? `HTTP ${res.status}`)
}

export async function exchangeCode(
  p: OAuthClient & { code: string; verifier: string; redirectUri: string },
  fetchFn: FetchFn,
  now = Date.now()
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number; email: string | null }> {
  const json = await postToken(
    {
      client_id: p.clientId,
      client_secret: p.clientSecret,
      code: p.code,
      code_verifier: p.verifier,
      grant_type: 'authorization_code',
      redirect_uri: p.redirectUri
    },
    fetchFn
  )
  if (!json.refresh_token) throw new GoogleAuthError('invalid-client', 'pas de refresh_token')
  return {
    accessToken: json.access_token!,
    refreshToken: json.refresh_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
    email: json.id_token ? emailFromIdToken(json.id_token) : null
  }
}

export async function refreshAccessToken(
  p: OAuthClient & { refreshToken: string },
  fetchFn: FetchFn,
  now = Date.now()
): Promise<{ accessToken: string; expiresAt: number }> {
  const json = await postToken(
    {
      client_id: p.clientId,
      client_secret: p.clientSecret,
      refresh_token: p.refreshToken,
      grant_type: 'refresh_token'
    },
    fetchFn
  )
  return { accessToken: json.access_token!, expiresAt: now + (json.expires_in ?? 3600) * 1000 }
}
