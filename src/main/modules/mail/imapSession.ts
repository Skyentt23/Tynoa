import { ImapFlow } from 'imapflow'
import {
  MailAuthError,
  type ImapSession,
  type MailCredentials,
  type MailHeader,
  type MailboxInfo
} from './types'

const LOGOUT_TIMEOUT_MS = 2_000

/** Session Gmail réelle, en lecture seule : en-têtes uniquement, aucun drapeau modifié. */
export function createImapSession(creds: MailCredentials): ImapSession {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth:
      'accessToken' in creds
        ? { user: creds.user, accessToken: creds.accessToken }
        : { user: creds.user, pass: creds.pass },
    logger: false,
    // Gmail coupe l'IDLE vers 29 min : on le relance avant.
    maxIdleTime: 25 * 60 * 1000
  })
  // Sans écouteur, un 'error' ferait planter le process ; la coupure arrive ensuite via 'close'.
  client.on('error', () => undefined)

  return {
    async connect() {
      try {
        await client.connect()
      } catch (err) {
        const e = err as { authenticationFailed?: boolean; responseText?: string }
        if (e.authenticationFailed) throw new MailAuthError(e.responseText)
        throw err
      }
    },

    async openInbox(): Promise<MailboxInfo> {
      const box = await client.mailboxOpen('INBOX', { readOnly: true })
      return { uidValidity: String(box.uidValidity), uidNext: box.uidNext }
    },

    async fetchSince(uid: number): Promise<MailHeader[]> {
      const headers: MailHeader[] = []
      // imapflow demande de lui-même X-GM-MSGID (Gmail), renvoyé dans `emailId`.
      const messages = client.fetch(`${uid + 1}:*`, { uid: true, envelope: true }, { uid: true })
      for await (const msg of messages) {
        // Gmail renvoie toujours au moins le dernier message pour « N:* », même si N le dépasse.
        if (msg.uid <= uid) continue
        const env = msg.envelope
        headers.push({
          uid: msg.uid,
          emailId: msg.emailId,
          envelope: env && {
            from: env.from?.map((a) => ({ name: a.name, address: a.address })),
            subject: env.subject,
            date: env.date === undefined ? undefined : new Date(env.date)
          }
        })
      }
      return headers
    },

    onNewMail(cb) {
      client.on('exists', () => cb())
    },

    onClose(cb) {
      client.on('close', () => cb())
    },

    // Après une veille, la connexion est souvent à moitié morte : LOGOUT resterait sans réponse
    // pendant des minutes et bloquerait la reconnexion. On n'attend pas plus de 2 s.
    async close() {
      let timer: ReturnType<typeof setTimeout> | undefined
      const gaveUp = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), LOGOUT_TIMEOUT_MS)
      })
      try {
        const outcome = await Promise.race([client.logout().then(() => 'done' as const), gaveUp])
        if (outcome === 'timeout') client.close()
      } catch {
        client.close()
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
