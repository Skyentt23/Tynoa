import { randomBytes } from 'node:crypto'
import type { GoogleStatus } from '../../shared/events'
import { waitForAuthCode as realWaitForAuthCode } from './loopback'
import {
  GoogleAuthError,
  buildAuthUrl,
  createPkce,
  exchangeCode,
  refreshAccessToken,
  type FetchFn,
  type OAuthClient
} from './oauth'

const CONNECT_TIMEOUT_MS = 5 * 60 * 1000
const EXPIRY_MARGIN_MS = 60 * 1000

export interface TokenStore {
  save(token: string): void
  load(): string | null
  has(): boolean
  clear(): void
}

export interface GoogleAccountDeps {
  /** null si l'identifiant client n'est pas encore renseigné. */
  getClient(): OAuthClient | null
  /** Jeton de renouvellement, chiffré (CredentialStore). */
  tokenStore: TokenStore
  fetchFn: FetchFn
  openBrowser(url: string): void
  onStatus(status: GoogleStatus): void
  onConnected(email: string | null): void
  waitForAuthCode?: typeof realWaitForAuthCode
  now?: () => number
}

export type ConnectResult =
  | { ok: true; email: string | null }
  | { ok: false; reason: 'not-configured' | 'invalid-client' | 'cancelled' | 'network' }

/** Connexion Google de l'utilisateur : flux OAuth, jeton d'accès en cache, révocation. */
export class GoogleAccount {
  private cache: { accessToken: string; expiresAt: number } | null = null
  private refreshing: Promise<string | null> | null = null

  constructor(private readonly deps: GoogleAccountDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  isConnected(): boolean {
    return this.deps.tokenStore.has()
  }

  async connect(): Promise<ConnectResult> {
    const client = this.deps.getClient()
    if (!client) return { ok: false, reason: 'not-configured' }
    const { verifier, challenge } = createPkce()
    const state = randomBytes(16).toString('hex')
    try {
      const wait = this.deps.waitForAuthCode ?? realWaitForAuthCode
      const { redirectUri, code } = await wait({ state, timeoutMs: CONNECT_TIMEOUT_MS })
      this.deps.openBrowser(buildAuthUrl({ clientId: client.clientId, redirectUri, state, challenge }))
      const tokens = await exchangeCode(
        { ...client, code: await code, verifier, redirectUri },
        this.deps.fetchFn,
        this.now()
      )
      this.deps.tokenStore.save(tokens.refreshToken)
      this.cache = { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt }
      this.deps.onConnected(tokens.email)
      this.deps.onStatus({ state: 'connected', ...(tokens.email ? { email: tokens.email } : {}) })
      return { ok: true, email: tokens.email }
    } catch (err) {
      if (err instanceof GoogleAuthError) {
        return { ok: false, reason: err.kind === 'invalid-client' ? 'invalid-client' : 'network' }
      }
      return { ok: false, reason: 'cancelled' }
    }
  }

  /** Jeton d'accès refusé par une API : le prochain appel en demandera un neuf. */
  invalidate(): void {
    this.cache = null
  }

  disconnect(): void {
    this.deps.tokenStore.clear()
    this.cache = null
    this.deps.onStatus({ state: 'disconnected' })
  }

  /**
   * Jeton d'accès valide, ou null si non connecté / révoqué / client refusé.
   * Lève une GoogleAuthError 'network' si Google est injoignable (on réessaiera plus tard).
   */
  getAccessToken(): Promise<string | null> {
    if (this.cache && this.cache.expiresAt - EXPIRY_MARGIN_MS > this.now()) {
      return Promise.resolve(this.cache.accessToken)
    }
    if (!this.refreshing) {
      this.refreshing = this.refresh().finally(() => {
        this.refreshing = null
      })
    }
    return this.refreshing
  }

  private async refresh(): Promise<string | null> {
    const refreshToken = this.deps.tokenStore.load()
    const client = this.deps.getClient()
    if (!refreshToken || !client) return null
    try {
      const fresh = await refreshAccessToken({ ...client, refreshToken }, this.deps.fetchFn, this.now())
      this.cache = fresh
      return fresh.accessToken
    } catch (err) {
      if (!(err instanceof GoogleAuthError) || err.kind === 'network') throw err
      this.cache = null
      if (err.kind === 'revoked') {
        // Jeton mort : on l'oublie pour ne plus jamais réessayer avec.
        this.deps.tokenStore.clear()
      }
      this.deps.onStatus({ state: 'error', reason: err.kind })
      return null
    }
  }
}
