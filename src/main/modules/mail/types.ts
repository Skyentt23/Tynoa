export interface MailEnvelope {
  from?: { name?: string; address?: string }[]
  subject?: string
  date?: Date
}

export interface MailHeader {
  uid: number
  /** X-GM-MSGID (décimal) sur Gmail. */
  emailId?: string
  envelope?: MailEnvelope
}

export interface MailboxInfo {
  uidValidity: string
  uidNext: number
}

/** Session IMAP minimale dont Tynoa a besoin (lecture seule). */
export interface ImapSession {
  connect(): Promise<void>
  openInbox(): Promise<MailboxInfo>
  /** En-têtes des messages dont l'UID est strictement supérieur à `uid`. */
  fetchSince(uid: number): Promise<MailHeader[]>
  onNewMail(cb: () => void): void
  onClose(cb: () => void): void
  close(): Promise<void>
}

/** Adresse Gmail et mot de passe d'application. */
export interface MailCredentials {
  user: string
  pass: string
}

export type ImapSessionFactory = (creds: MailCredentials) => ImapSession

export class MailAuthError extends Error {
  constructor(serverResponse?: string) {
    super(serverResponse ? `Authentification IMAP refusée : ${serverResponse}` : 'Authentification IMAP refusée')
    this.name = 'MailAuthError'
  }
}
