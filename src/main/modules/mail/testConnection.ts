import { MailAuthError, type ImapSessionFactory, type MailCredentials } from './types'

export type ConnectionTestResult = { ok: true } | { ok: false; reason: 'auth' | 'network' }

/** Bouton « Tester la connexion » : connexion + ouverture de la boîte, puis fermeture. */
export async function testConnection(
  createSession: ImapSessionFactory,
  creds: MailCredentials,
  timeoutMs = 15_000
): Promise<ConnectionTestResult> {
  const session = createSession(creds)
  try {
    await withTimeout(
      (async () => {
        await session.connect()
        await session.openInbox()
      })(),
      timeoutMs
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof MailAuthError ? 'auth' : 'network' }
  } finally {
    await session.close().catch(() => undefined)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Délai dépassé')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}
