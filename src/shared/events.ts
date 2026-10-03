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

export interface CalendarEvent {
  /** `calendarId:eventId`, stable entre deux lectures. */
  key: string
  title: string
  /** ISO 8601 ; date seule (AAAA-MM-JJ) pour un événement « toute la journée ». */
  start: string
  end: string
  allDay: boolean
  link: string
}

export type CalendarChangeKind = 'added' | 'moved' | 'cancelled'

export interface CalendarChange {
  kind: CalendarChangeKind
  event: CalendarEvent
  /** Début avant déplacement (kind = 'moved'). */
  previousStart?: string
}

/** État de la lecture des liens iCal (une panne réseau passagère n'est pas une erreur affichée). */
export interface CalendarStatus {
  state: 'ok' | 'error'
  reason?: 'invalid-url'
}

export interface TynoaEvents {
  'mail.received': MailReceived
  'mail.batch': { count: number }
  'mail.status': MailStatus
  'calendar.reminder': { event: CalendarEvent; minutes: number }
  'calendar.next': { event: CalendarEvent | null }
  'calendar.summary': { events: CalendarEvent[] }
  'calendar.changed': CalendarChange
  'calendar.status': CalendarStatus
}

export type TynoaEventName = keyof TynoaEvents
