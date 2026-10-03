export interface MailAddress {
  name: string
  address: string
}

export interface MailReceived {
  uid: number
  from: MailAddress
  subject: string
  /** Date ISO 8601 */
  date: string
  gmailLink: string
}

export type MailStatusState = 'connected' | 'reconnecting' | 'error'

export type MailStatusReason = 'auth' | 'missing-credentials' | 'network'

export interface MailStatus {
  state: MailStatusState
  reason?: MailStatusReason
}

export interface TynoaEvents {
  'mail.received': MailReceived
  'mail.batch': { count: number }
  'mail.status': MailStatus
}

export type TynoaEventName = keyof TynoaEvents
