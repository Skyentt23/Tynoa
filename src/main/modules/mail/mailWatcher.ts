import type { EventBus } from '../../events/eventBus'
import type { TynoaEvents } from '../../../shared/events'
import type { Settings } from '../../store/settings'
import { reconnectDelay } from './backoff'
import { planSync, summarize } from './sync'
import {
  MailAuthError,
  type ImapSession,
  type ImapSessionFactory,
  type MailboxInfo,
  type MailCredentials
} from './types'

export interface MailWatcherDeps {
  bus: EventBus<TynoaEvents>
  settings: { load(): Settings; save(patch: Partial<Settings>): Settings }
  createSession: ImapSessionFactory
  /** Une erreur ici est traitée comme une coupure réseau (nouvel essai plus tard). */
  getCredentials: () => Promise<MailCredentials | null>
  log?: (message: string) => void
}

/**
 * Surveille la boîte de réception et publie `mail.*` sur le bus.
 * La « génération » invalide les rappels des sessions précédentes
 * (arrêt, reconnexion), pour qu'une ancienne connexion ne déclenche rien.
 */
export class MailWatcher {
  private session: ImapSession | null = null
  private box: MailboxInfo | null = null
  private account = ''
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private running = false
  private generation = 0
  private syncChain: Promise<void> = Promise.resolve()

  constructor(private readonly deps: MailWatcherDeps) {}

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    await this.connect()
  }

  async stop(): Promise<void> {
    this.running = false
    this.generation++
    this.clearRetry()
    await this.closeSession()
  }

  /** Reconnexion immédiate (sortie de veille, paramètres modifiés) ; réarme aussi après un refus. */
  async reconnectNow(): Promise<void> {
    this.running = true
    this.generation++
    this.clearRetry()
    this.attempt = 0
    await this.closeSession()
    await this.connect()
  }

  private async connect(): Promise<void> {
    if (!this.running) return
    const gen = this.generation
    let creds: MailCredentials | null
    try {
      creds = await this.deps.getCredentials()
    } catch (err) {
      if (gen !== this.generation) return
      this.deps.log?.(`Identifiants indisponibles : ${errorMessage(err)}`)
      this.handleDisconnect()
      return
    }
    if (gen !== this.generation) return
    if (!creds) {
      this.deps.bus.emit('mail.status', { state: 'error', reason: 'missing-credentials' })
      return
    }
    const session = this.deps.createSession(creds)
    try {
      await session.connect()
      const box = await session.openInbox()
      if (gen !== this.generation) {
        await session.close().catch(() => undefined)
        return
      }
      this.session = session
      this.box = box
      this.account = creds.user
      this.attempt = 0
      session.onClose(() => {
        if (gen === this.generation) this.handleDisconnect()
      })
      session.onNewMail(() => {
        if (gen === this.generation) void this.queueSync()
      })
      this.deps.bus.emit('mail.status', { state: 'connected' })
      await this.queueSync()
    } catch (err) {
      if (gen !== this.generation) return
      await session.close().catch(() => undefined)
      if (err instanceof MailAuthError) {
        // Pas de nouvel essai : insister ferait bloquer le compte par Google.
        this.deps.log?.(err.message)
        this.deps.bus.emit('mail.status', { state: 'error', reason: 'auth' })
        return
      }
      this.deps.log?.(`Connexion IMAP échouée : ${errorMessage(err)}`)
      this.handleDisconnect()
    }
  }

  private handleDisconnect(): void {
    if (!this.running || this.retryTimer) return
    this.generation++
    this.session = null
    this.box = null
    this.deps.bus.emit('mail.status', { state: 'reconnecting', reason: 'network' })
    const delay = reconnectDelay(this.attempt++)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, delay)
  }

  /** Les synchronisations s'exécutent l'une après l'autre : jamais deux lectures de la même position. */
  private queueSync(): Promise<void> {
    this.syncChain = this.syncChain
      .then(() => this.sync())
      .catch((err: unknown) => {
        this.deps.log?.(`Synchronisation échouée : ${errorMessage(err)}`)
      })
    return this.syncChain
  }

  private async sync(): Promise<void> {
    const { session, box } = this
    if (!session || !box) return
    const plan = planSync(this.deps.settings.load(), box)
    if (plan.kind === 'reset') {
      this.deps.settings.save(plan.save)
      return
    }
    const outcome = summarize(await session.fetchSince(plan.sinceUid), plan.sinceUid, this.account)
    if (outcome.kind === 'none') return
    // Position enregistrée avant l'émission : un abonné défaillant ne provoque pas de doublon.
    this.deps.settings.save({ lastSeenUid: outcome.lastSeenUid })
    if (outcome.kind === 'batch') {
      this.deps.bus.emit('mail.batch', { count: outcome.count })
    } else {
      for (const mail of outcome.mails) this.deps.bus.emit('mail.received', mail)
    }
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  private async closeSession(): Promise<void> {
    const session = this.session
    this.session = null
    this.box = null
    if (session) await session.close().catch(() => undefined)
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
