import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventBus } from '../../events/eventBus'
import { DEFAULT_SETTINGS, type Settings } from '../../store/settings'
import type { MailStatus, TynoaEvents } from '../../../shared/events'
import { MailWatcher } from './mailWatcher'
import {
  MailAuthError,
  type ImapSession,
  type MailCredentials,
  type MailHeader,
  type MailboxInfo
} from './types'

interface Server {
  box: MailboxInfo
  mails: MailHeader[]
  connectErrors: (Error | null)[]
}

class FakeSession implements ImapSession {
  closed = false
  private newMailCb: (() => void) | null = null
  private closeCb: (() => void) | null = null

  constructor(
    private readonly server: Server,
    private readonly connectError: Error | null
  ) {}

  async connect(): Promise<void> {
    if (this.connectError) throw this.connectError
  }
  async openInbox(): Promise<MailboxInfo> {
    return { ...this.server.box }
  }
  async fetchSince(uid: number): Promise<MailHeader[]> {
    await Promise.resolve()
    return this.server.mails.filter((m) => m.uid > uid)
  }
  onNewMail(cb: () => void): void {
    this.newMailCb = cb
  }
  onClose(cb: () => void): void {
    this.closeCb = cb
  }
  async close(): Promise<void> {
    this.closed = true
    this.closeCb?.()
  }
  notifyNewMail(): void {
    this.newMailCb?.()
  }
  drop(): void {
    this.closeCb?.()
  }
}

const header = (uid: number): MailHeader => ({
  uid,
  envelope: {
    from: [{ name: `Expéditeur ${uid}`, address: `e${uid}@ex.com` }],
    subject: `Sujet ${uid}`,
    date: new Date('2026-10-03T08:00:00Z')
  }
})

const KNOWN: Partial<Settings> = { lastSeenUid: 100, uidValidity: '1' }

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r))
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await flush()
}

function setup(
  opts: {
    settings?: Partial<Settings>
    creds?: MailCredentials | null
    connectErrors?: (Error | null)[]
    credsError?: Error
  } = {}
) {
  const server: Server = {
    box: { uidValidity: '1', uidNext: 101 },
    mails: [],
    connectErrors: [...(opts.connectErrors ?? [])]
  }
  let stored: Settings = { ...DEFAULT_SETTINGS, email: 'moi@gmail.com', ...opts.settings }
  const settings = {
    load: (): Settings => ({ ...stored }),
    save: (patch: Partial<Settings>): Settings => (stored = { ...stored, ...patch })
  }
  const bus = new EventBus<TynoaEvents>()
  const events: { name: keyof TynoaEvents; payload: unknown }[] = []
  for (const name of ['mail.received', 'mail.batch', 'mail.status'] as const) {
    bus.on(name, (payload) => events.push({ name, payload }))
  }
  const sessions: FakeSession[] = []
  const createSession = vi.fn(() => {
    const s = new FakeSession(server, server.connectErrors.shift() ?? null)
    sessions.push(s)
    return s
  })
  const creds = opts.creds === undefined ? { user: 'moi@gmail.com', pass: 'secret' } : opts.creds
  const watcher = new MailWatcher({ bus, settings, createSession, getCredentials: async () => {
      if (opts.credsError) throw opts.credsError
      return creds
    }
  })
  return {
    server,
    settings,
    sessions,
    createSession,
    watcher,
    received: () =>
      events
        .filter((e) => e.name === 'mail.received')
        .map((e) => (e.payload as { uid: number }).uid),
    batches: () => events.filter((e) => e.name === 'mail.batch').map((e) => e.payload),
    statuses: () =>
      events.filter((e) => e.name === 'mail.status').map((e) => e.payload as MailStatus)
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MailWatcher', () => {
  it("premier lancement : mémorise la position sans notifier l'historique", async () => {
    const t = setup()
    t.server.mails = [header(99), header(100)]
    await t.watcher.start()
    expect(t.received()).toEqual([])
    expect(t.settings.load()).toMatchObject({ lastSeenUid: 100, uidValidity: '1' })
    expect(t.statuses()).toEqual([{ state: 'connected' }])
  })

  it('notifie un mail arrivé pendant la session', async () => {
    const t = setup({ settings: KNOWN })
    await t.watcher.start()
    t.server.mails.push(header(101))
    t.sessions[0].notifyNewMail()
    await flush()
    expect(t.received()).toEqual([101])
    expect(t.settings.load().lastSeenUid).toBe(101)
  })

  it('rattrape individuellement 5 mails ou moins au démarrage', async () => {
    const t = setup({ settings: KNOWN })
    t.server.mails = [101, 102, 103, 104, 105].map(header)
    await t.watcher.start()
    expect(t.received()).toEqual([101, 102, 103, 104, 105])
  })

  it('regroupe plus de 5 mails rattrapés en un seul mail.batch', async () => {
    const t = setup({ settings: KNOWN })
    t.server.mails = [101, 102, 103, 104, 105, 106, 107].map(header)
    await t.watcher.start()
    expect(t.received()).toEqual([])
    expect(t.batches()).toEqual([{ count: 7 }])
    expect(t.settings.load().lastSeenUid).toBe(107)
  })

  it('uidValidity différent : remise à zéro sans notification', async () => {
    const t = setup({ settings: { lastSeenUid: 100, uidValidity: '0' } })
    t.server.mails = [header(101)]
    await t.watcher.start()
    expect(t.received()).toEqual([])
    expect(t.settings.load()).toMatchObject({ lastSeenUid: 100, uidValidity: '1' })
  })

  it('deux signaux rapprochés : chaque mail notifié une seule fois', async () => {
    const t = setup({ settings: KNOWN })
    await t.watcher.start()
    t.server.mails.push(header(101))
    t.sessions[0].notifyNewMail()
    t.sessions[0].notifyNewMail()
    await flush()
    expect(t.received()).toEqual([101])
  })

  it("refus d'authentification : statut error/auth et aucun nouvel essai", async () => {
    const t = setup({ settings: KNOWN, connectErrors: [new MailAuthError()] })
    await t.watcher.start()
    await advance(600_000)
    expect(t.createSession).toHaveBeenCalledTimes(1)
    expect(t.statuses()).toEqual([{ state: 'error', reason: 'auth' }])
  })

  it('identifiants absents : statut error sans créer de session', async () => {
    const t = setup({ creds: null })
    await t.watcher.start()
    expect(t.createSession).not.toHaveBeenCalled()
    expect(t.statuses()).toEqual([{ state: 'error', reason: 'missing-credentials' }])
  })

  it('coupure : reconnexion après 5 s et rattrapage du mail manqué', async () => {
    const t = setup({ settings: KNOWN })
    await t.watcher.start()
    t.sessions[0].drop()
    expect(t.statuses().at(-1)).toEqual({ state: 'reconnecting', reason: 'network' })
    t.server.mails.push(header(101))
    await advance(4_999)
    expect(t.createSession).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(t.createSession).toHaveBeenCalledTimes(2)
    expect(t.received()).toEqual([101])
    expect(t.statuses().at(-1)).toEqual({ state: 'connected' })
  })

  it('délais croissants entre les échecs réseau', async () => {
    const err = new Error('ECONNRESET')
    const t = setup({ settings: KNOWN, connectErrors: [err, err, err] })
    await t.watcher.start()
    expect(t.createSession).toHaveBeenCalledTimes(1)
    await advance(5_000)
    expect(t.createSession).toHaveBeenCalledTimes(2)
    await advance(9_999)
    expect(t.createSession).toHaveBeenCalledTimes(2)
    await advance(1)
    expect(t.createSession).toHaveBeenCalledTimes(3)
    await advance(30_000)
    expect(t.createSession).toHaveBeenCalledTimes(4)
    expect(t.statuses().at(-1)).toEqual({ state: 'connected' })
  })

  it("reconnectNow réarme après un refus d'authentification", async () => {
    const t = setup({ settings: KNOWN, connectErrors: [new MailAuthError()] })
    await t.watcher.start()
    await t.watcher.reconnectNow()
    expect(t.createSession).toHaveBeenCalledTimes(2)
    expect(t.statuses().at(-1)).toEqual({ state: 'connected' })
  })

  it('stop() ferme la session sans déclencher de reconnexion', async () => {
    const t = setup({ settings: KNOWN })
    await t.watcher.start()
    await t.watcher.stop()
    expect(t.sessions[0].closed).toBe(true)
    await advance(600_000)
    expect(t.createSession).toHaveBeenCalledTimes(1)
  })
})

describe('MailWatcher — identifiants asynchrones', () => {
  it('jeton Google injoignable : reconnexion plus tard, sans erreur définitive', async () => {
    const t = setup({ settings: KNOWN, credsError: new Error('fetch failed') })
    await t.watcher.start()
    expect(t.createSession).not.toHaveBeenCalled()
    expect(t.statuses()).toEqual([{ state: 'reconnecting', reason: 'network' }])
  })
})
