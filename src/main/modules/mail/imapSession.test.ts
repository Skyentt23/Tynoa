import { describe, it, expect, vi, beforeEach } from 'vitest'

interface FakeFlowLike {
  options: Record<string, unknown>
  openCalls: unknown[][]
  emit(event: string, ...args: unknown[]): boolean
}

const h = vi.hoisted(() => ({
  instances: [] as FakeFlowLike[],
  connectError: null as unknown,
  messages: [] as unknown[]
}))

vi.mock('imapflow', async () => {
  const { EventEmitter } = await import('node:events')
  class ImapFlow extends EventEmitter {
    readonly options: Record<string, unknown>
    readonly openCalls: unknown[][] = []
    constructor(options: Record<string, unknown>) {
      super()
      this.options = options
      h.instances.push(this)
    }
    async connect(): Promise<void> {
      if (h.connectError) throw h.connectError
    }
    async mailboxOpen(...args: unknown[]): Promise<{ uidValidity: bigint; uidNext: number }> {
      this.openCalls.push(args)
      return { uidValidity: BigInt(7), uidNext: 42 }
    }
    async *fetch(): AsyncGenerator<unknown> {
      yield* h.messages
    }
    async logout(): Promise<void> {}
    close(): void {}
  }
  return { ImapFlow }
})

import { createImapSession } from './imapSession'
import { MailAuthError } from './types'

const creds = { user: 'moi@gmail.com', pass: 'pw' }

beforeEach(() => {
  h.instances.length = 0
  h.connectError = null
  h.messages = []
})

describe('createImapSession', () => {
  it('se connecte à imap.gmail.com:993 en TLS', () => {
    createImapSession(creds)
    expect(h.instances[0].options).toMatchObject({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: 'moi@gmail.com', pass: 'pw' },
      logger: false
    })
  })

  it('traduit un refus d’authentification en MailAuthError', async () => {
    h.connectError = Object.assign(new Error('Invalid credentials'), { authenticationFailed: true })
    await expect(createImapSession(creds).connect()).rejects.toBeInstanceOf(MailAuthError)
  })

  it('laisse passer les autres erreurs telles quelles', async () => {
    h.connectError = new Error('ECONNREFUSED')
    const promise = createImapSession(creds).connect()
    await expect(promise).rejects.toThrow('ECONNREFUSED')
    await expect(promise).rejects.not.toBeInstanceOf(MailAuthError)
  })

  it('ouvre INBOX en lecture seule et convertit uidValidity en texte', async () => {
    const s = createImapSession(creds)
    expect(await s.openInbox()).toEqual({ uidValidity: '7', uidNext: 42 })
    expect(h.instances[0].openCalls[0]).toEqual(['INBOX', { readOnly: true }])
  })

  it('fetchSince ignore les UID déjà vus (Gmail renvoie le dernier pour N:*)', async () => {
    h.messages = [
      { uid: 100, envelope: {} },
      { uid: 101, emailId: '5', envelope: { subject: 'x' } }
    ]
    expect(await createImapSession(creds).fetchSince(100)).toEqual([
      { uid: 101, emailId: '5', envelope: { subject: 'x' } }
    ])
  })

  it('relaie exists → onNewMail et close → onClose', () => {
    const s = createImapSession(creds)
    const onNew = vi.fn()
    const onClose = vi.fn()
    s.onNewMail(onNew)
    s.onClose(onClose)
    h.instances[0].emit('exists', { count: 3 })
    h.instances[0].emit('close')
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('un événement error ne fait pas planter le process', () => {
    createImapSession(creds)
    expect(() => h.instances[0].emit('error', new Error('socket'))).not.toThrow()
  })
})
