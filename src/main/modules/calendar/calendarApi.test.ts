import { describe, it, expect, vi } from 'vitest'
import { CalendarApiError, fetchEvents } from './calendarApi'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const range = { timeMin: '2026-10-03T00:00:00.000Z', timeMax: '2026-10-05T00:00:00.000Z' }

function fakeGoogle(calendars: unknown[], eventsByCalendar: Record<string, unknown[]>) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const u = new URL(url)
    if (u.pathname.endsWith('/users/me/calendarList')) return jsonResponse(200, { items: calendars })
    const id = decodeURIComponent(u.pathname.split('/calendars/')[1].split('/events')[0])
    return jsonResponse(200, { items: eventsByCalendar[id] ?? [] })
  })
}

describe('fetchEvents', () => {
  it('lit les agendas cochés et mappe les événements, triés par début', async () => {
    const fetchFn = fakeGoogle(
      [
        { id: 'moi@gmail.com', selected: true },
        { id: 'fr#holiday@group.v.calendar.google.com', selected: true },
        { id: 'masque', selected: false }
      ],
      {
        'moi@gmail.com': [
          {
            id: 'e2',
            summary: 'Dentiste',
            start: { dateTime: '2026-10-03T14:00:00+02:00' },
            end: { dateTime: '2026-10-03T14:30:00+02:00' },
            htmlLink: 'https://www.google.com/calendar/event?eid=abc'
          }
        ],
        'fr#holiday@group.v.calendar.google.com': [
          { id: 'e1', summary: 'Fête', start: { date: '2026-10-03' }, end: { date: '2026-10-04' } }
        ],
        masque: [{ id: 'x', summary: 'Ne doit pas apparaître', start: { date: '2026-10-03' }, end: { date: '2026-10-04' } }]
      }
    )
    expect(await fetchEvents('at', range, fetchFn)).toEqual([
      {
        key: 'fr#holiday@group.v.calendar.google.com:e1',
        title: 'Fête',
        start: '2026-10-03',
        end: '2026-10-04',
        allDay: true,
        link: 'https://calendar.google.com/'
      },
      {
        key: 'moi@gmail.com:e2',
        title: 'Dentiste',
        start: '2026-10-03T14:00:00+02:00',
        end: '2026-10-03T14:30:00+02:00',
        allDay: false,
        link: 'https://www.google.com/calendar/event?eid=abc'
      }
    ])
    const eventsCall = new URL(fetchFn.mock.calls[1][0])
    expect(Object.fromEntries(eventsCall.searchParams)).toMatchObject({
      timeMin: range.timeMin,
      timeMax: range.timeMax,
      singleEvents: 'true',
      orderBy: 'startTime'
    })
  })

  it('envoie le jeton en Bearer', async () => {
    const fetchFn = fakeGoogle([], {})
    await fetchEvents('at', range, fetchFn)
    const init = fetchFn.mock.calls[0][1] as unknown as RequestInit
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer at')
  })

  it('ignore les événements annulés et ceux que j’ai refusés ; titre par défaut', async () => {
    const fetchFn = fakeGoogle([{ id: 'c', selected: true }], {
      c: [
        { id: 'a', status: 'cancelled', start: { dateTime: '2026-10-03T09:00:00Z' }, end: { dateTime: '2026-10-03T10:00:00Z' } },
        {
          id: 'b',
          summary: 'Refusé',
          start: { dateTime: '2026-10-03T09:00:00Z' },
          end: { dateTime: '2026-10-03T10:00:00Z' },
          attendees: [{ self: true, responseStatus: 'declined' }]
        },
        { id: 'c', start: { dateTime: '2026-10-03T11:00:00Z' }, end: { dateTime: '2026-10-03T12:00:00Z' } }
      ]
    })
    const events = await fetchEvents('at', range, fetchFn)
    expect(events.map((e) => [e.key, e.title])).toEqual([['c:c', '(sans titre)']])
  })

  it('401 → revoked', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(401, { error: { code: 401 } }))
    await expect(fetchEvents('at', range, fetchFn)).rejects.toMatchObject({ kind: 'revoked' })
  })

  it('API désactivée (403 accessNotConfigured) → api-disabled', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(403, { error: { code: 403, errors: [{ reason: 'accessNotConfigured' }] } })
    )
    await expect(fetchEvents('at', range, fetchFn)).rejects.toMatchObject({ kind: 'api-disabled' })
  })

  it('panne réseau → network', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const err = await fetchEvents('at', range, fetchFn).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CalendarApiError)
    expect(err).toMatchObject({ kind: 'network' })
  })
})

describe('fetchEvents — autorisation', () => {
  it('agenda non coché lors du consentement (403 insufficientPermissions) → missing-scope', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(403, { error: { code: 403, status: 'PERMISSION_DENIED', errors: [{ reason: 'insufficientPermissions' }] } })
    )
    await expect(fetchEvents('at', range, fetchFn)).rejects.toMatchObject({ kind: 'missing-scope' })
  })
})
