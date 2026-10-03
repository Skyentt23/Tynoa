import type { CalendarEvent } from '../../../shared/events'
import type { FetchFn } from '../../google/oauth'

const API = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_HOME = 'https://calendar.google.com/'

export type CalendarApiErrorKind = 'revoked' | 'api-disabled' | 'network'

export class CalendarApiError extends Error {
  constructor(
    readonly kind: CalendarApiErrorKind,
    detail?: string
  ) {
    super(detail ? `Google Agenda (${kind}) : ${detail}` : `Google Agenda (${kind})`)
    this.name = 'CalendarApiError'
  }
}

interface ApiEvent {
  id: string
  status?: string
  summary?: string
  htmlLink?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  attendees?: { self?: boolean; responseStatus?: string }[]
}

async function get<T>(url: string, accessToken: string, fetchFn: FetchFn): Promise<T> {
  let res: Response
  try {
    res = await fetchFn(url, { headers: { authorization: `Bearer ${accessToken}` } })
  } catch (err) {
    throw new CalendarApiError('network', err instanceof Error ? err.message : String(err))
  }
  if (res.ok) return (await res.json()) as T
  const body = (await res.json().catch(() => ({}))) as {
    error?: { errors?: { reason?: string }[]; status?: string }
  }
  if (res.status === 401) throw new CalendarApiError('revoked', 'HTTP 401')
  const reasons = (body.error?.errors ?? []).map((e) => e.reason)
  if (
    res.status === 403 &&
    (reasons.includes('accessNotConfigured') || body.error?.status === 'PERMISSION_DENIED')
  ) {
    throw new CalendarApiError('api-disabled', reasons.join(',') || 'HTTP 403')
  }
  throw new CalendarApiError('network', `HTTP ${res.status}`)
}

function toCalendarEvent(calendarId: string, e: ApiEvent): CalendarEvent | null {
  if (e.status === 'cancelled') return null
  if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return null
  const start = e.start?.dateTime ?? e.start?.date
  const end = e.end?.dateTime ?? e.end?.date ?? start
  if (!start || !end) return null
  return {
    key: `${calendarId}:${e.id}`,
    title: e.summary?.trim() || '(sans titre)',
    start,
    end,
    allDay: !e.start?.dateTime,
    link: e.htmlLink ?? CALENDAR_HOME
  }
}

/** Événements des agendas cochés dans Google Agenda, sur la plage demandée, triés par début. */
export async function fetchEvents(
  accessToken: string,
  range: { timeMin: string; timeMax: string },
  fetchFn: FetchFn
): Promise<CalendarEvent[]> {
  const list = await get<{ items?: { id: string; selected?: boolean }[] }>(
    `${API}/users/me/calendarList`,
    accessToken,
    fetchFn
  )
  const calendars = (list.items ?? []).filter((c) => c.selected)
  const params = new URLSearchParams({
    timeMin: range.timeMin,
    timeMax: range.timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250'
  })
  const perCalendar = await Promise.all(
    calendars.map(async (c) => {
      const res = await get<{ items?: ApiEvent[] }>(
        `${API}/calendars/${encodeURIComponent(c.id)}/events?${params}`,
        accessToken,
        fetchFn
      )
      return (res.items ?? []).map((e) => toCalendarEvent(c.id, e))
    })
  )
  return perCalendar
    .flat()
    .filter((e): e is CalendarEvent => e !== null)
    .sort((a, b) => startMs(a) - startMs(b))
}

/** Début en ms ; un événement « toute la journée » commence à minuit, heure locale. */
export function startMs(e: Pick<CalendarEvent, 'start' | 'allDay'>): number {
  return e.allDay ? new Date(`${e.start}T00:00:00`).getTime() : new Date(e.start).getTime()
}
