import { createHash } from 'node:crypto'
import ICAL from 'ical.js'
import type { CalendarEvent } from '../../../shared/events'

const CALENDAR_HOME = 'https://calendar.google.com/'
/** Garde-fou contre une règle de récurrence sans fin. */
const MAX_OCCURRENCES = 20_000

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export type CalendarSourceErrorKind = 'invalid-url' | 'network'

export class CalendarSourceError extends Error {
  constructor(
    readonly kind: CalendarSourceErrorKind,
    detail?: string
  ) {
    super(detail ? `Agenda iCal (${kind}) : ${detail}` : `Agenda iCal (${kind})`)
    this.name = 'CalendarSourceError'
  }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Date seule AAAA-MM-JJ d'un événement « toute la journée » ; instant ISO (UTC) sinon. */
function toIso(time: ICAL.Time): string {
  return time.isDate ? `${time.year}-${pad(time.month)}-${pad(time.day)}` : time.toJSDate().toISOString()
}

function isDeclinedBy(event: ICAL.Event, selfEmail: string | undefined): boolean {
  if (!selfEmail) return false
  const me = `mailto:${selfEmail}`.toLowerCase()
  return event.component.getAllProperties('attendee').some(
    (a) =>
      String(a.getFirstValue()).toLowerCase() === me &&
      String(a.getParameter('partstat') ?? '').toUpperCase() === 'DECLINED'
  )
}

function overlaps(start: ICAL.Time, end: ICAL.Time, range: { start: Date; end: Date }): boolean {
  const s = start.isDate ? new Date(start.year, start.month - 1, start.day) : start.toJSDate()
  const e = end.isDate ? new Date(end.year, end.month - 1, end.day) : end.toJSDate()
  return s < range.end && e > range.start
}

/**
 * Événements d'un fichier iCal sur la plage demandée : récurrences développées
 * (exceptions et EXDATE compris), annulés et refusés exclus.
 */
export function parseIcs(
  text: string,
  calendarId: string,
  range: { start: Date; end: Date },
  selfEmail?: string
): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(text))
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(new ICAL.Timezone(tz))
  }
  const all = root.getAllSubcomponents('vevent').map((c) => new ICAL.Event(c))
  const masters = all.filter((e) => !e.isRecurrenceException())
  for (const exception of all.filter((e) => e.isRecurrenceException())) {
    masters.find((m) => m.uid === exception.uid)?.relateException(exception)
  }

  const out: CalendarEvent[] = []
  const push = (item: ICAL.Event, key: string, start: ICAL.Time, end: ICAL.Time): void => {
    const status = String(item.component.getFirstPropertyValue('status') ?? '').toUpperCase()
    if (status === 'CANCELLED' || isDeclinedBy(item, selfEmail) || !overlaps(start, end, range)) return
    out.push({
      key,
      title: item.summary?.trim() || '(sans titre)',
      start: toIso(start),
      end: toIso(end),
      allDay: start.isDate,
      link: CALENDAR_HOME
    })
  }

  for (const master of masters) {
    if (!master.startDate) continue
    if (!master.isRecurring()) {
      push(master, `${calendarId}:${master.uid}`, master.startDate, master.endDate ?? master.startDate)
      continue
    }
    const it = master.iterator()
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      const occ = master.getOccurrenceDetails(next)
      if (occ.startDate.toJSDate() >= range.end && next.toJSDate() >= range.end) break
      // Clé = occurrence d'origine (RECURRENCE-ID) : une occurrence déplacée garde sa clé.
      push(occ.item, `${calendarId}:${master.uid}#${toIso(occ.recurrenceId)}`, occ.startDate, occ.endDate)
    }
  }
  return out
}

const sourceId = (url: string): string => createHash('sha1').update(url).digest('hex').slice(0, 8)

/** Lit tous les liens iCal ; le moindre échec fait échouer la lecture (on garde alors les données précédentes). */
export async function fetchIcsEvents(
  urls: string[],
  range: { start: Date; end: Date },
  fetchFn: FetchFn,
  selfEmail?: string
): Promise<CalendarEvent[]> {
  const perSource = await Promise.all(
    urls.map(async (url) => {
      let res: Response
      try {
        res = await fetchFn(url)
      } catch (err) {
        throw new CalendarSourceError('network', err instanceof Error ? err.message : String(err))
      }
      if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
        throw new CalendarSourceError('invalid-url', `HTTP ${res.status}`)
      }
      if (!res.ok) throw new CalendarSourceError('network', `HTTP ${res.status}`)
      const text = await res.text()
      if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) {
        throw new CalendarSourceError('invalid-url', 'la réponse n’est pas un agenda iCal')
      }
      try {
        return parseIcs(text, sourceId(url), range, selfEmail)
      } catch (err) {
        throw new CalendarSourceError('invalid-url', err instanceof Error ? err.message : String(err))
      }
    })
  )
  return perSource.flat().sort((a, b) => startMs(a) - startMs(b))
}

/** Début en ms ; un événement « toute la journée » commence à minuit, heure locale. */
export function startMs(e: Pick<CalendarEvent, 'start' | 'allDay'>): number {
  return e.allDay ? new Date(`${e.start}T00:00:00`).getTime() : new Date(e.start).getTime()
}
