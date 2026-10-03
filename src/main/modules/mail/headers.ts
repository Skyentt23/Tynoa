import type { MailReceived } from '../../../shared/events'
import type { MailHeader } from './types'

/** Lien Gmail web vers le message (X-GM-MSGID en hexadécimal), sinon vers la boîte de réception. */
export function buildGmailLink(account: string, emailId: string | undefined): string {
  const base = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}`
  if (!emailId || !/^\d+$/.test(emailId)) return `${base}#inbox`
  return `${base}#all/${BigInt(emailId).toString(16)}`
}

export function toMailReceived(header: MailHeader, account: string): MailReceived {
  const sender = header.envelope?.from?.[0]
  const address = sender?.address ?? ''
  const name = sender?.name?.trim() || address || 'Expéditeur inconnu'
  const subject = header.envelope?.subject?.trim() || '(sans objet)'
  const rawDate = header.envelope?.date
  const date = rawDate && !Number.isNaN(rawDate.getTime()) ? rawDate : new Date()
  return {
    uid: header.uid,
    from: { name, address },
    subject,
    date: date.toISOString(),
    gmailLink: buildGmailLink(account, header.emailId)
  }
}
