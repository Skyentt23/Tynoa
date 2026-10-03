import type { MailReceived } from '../../../shared/events'
import { toMailReceived } from './headers'
import type { MailHeader, MailboxInfo } from './types'

/** Au-delà de ce nombre, les mails rattrapés sont regroupés en une seule notification. */
export const BATCH_THRESHOLD = 5

export type SyncPlan =
  | { kind: 'reset'; save: { lastSeenUid: number; uidValidity: string } }
  | { kind: 'fetch'; sinceUid: number }

export function planSync(
  saved: { lastSeenUid: number | null; uidValidity: string | null },
  box: MailboxInfo
): SyncPlan {
  if (saved.lastSeenUid === null || saved.uidValidity !== box.uidValidity) {
    return {
      kind: 'reset',
      save: { lastSeenUid: Math.max(0, box.uidNext - 1), uidValidity: box.uidValidity }
    }
  }
  return { kind: 'fetch', sinceUid: saved.lastSeenUid }
}

export type SyncOutcome =
  | { kind: 'none' }
  | { kind: 'individual'; mails: MailReceived[]; lastSeenUid: number }
  | { kind: 'batch'; count: number; lastSeenUid: number }

export function summarize(headers: MailHeader[], sinceUid: number, account: string): SyncOutcome {
  const seen = new Set<number>()
  const fresh = headers
    .filter((h) => h.uid > sinceUid && !seen.has(h.uid) && seen.add(h.uid))
    .sort((a, b) => a.uid - b.uid)
  if (fresh.length === 0) return { kind: 'none' }
  const lastSeenUid = fresh[fresh.length - 1].uid
  if (fresh.length > BATCH_THRESHOLD) return { kind: 'batch', count: fresh.length, lastSeenUid }
  return { kind: 'individual', mails: fresh.map((h) => toMailReceived(h, account)), lastSeenUid }
}
