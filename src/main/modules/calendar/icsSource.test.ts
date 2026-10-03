import { describe, it, expect, vi } from 'vitest'
import { CalendarSourceError, fetchIcsEvents, parseIcs } from './icsSource'

const range = { start: new Date('2026-10-03T00:00:00+02:00'), end: new Date('2026-10-05T00:00:00+02:00') }

const ics = (...events: string[]): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Paris',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events,
    'END:VCALENDAR'
  ].join('\r\n')

const vevent = (lines: string[]): string => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')

describe('parseIcs', () => {
  it('événement simple avec fuseau horaire', () => {
    const events = parseIcs(
      ics(vevent(['UID:dentiste@google.com', 'SUMMARY:Dentiste', 'DTSTART;TZID=Europe/Paris:20261003T140000', 'DTEND;TZID=Europe/Paris:20261003T143000'])),
      'c1',
      range
    )
    expect(events).toEqual([
      {
        key: 'c1:dentiste@google.com',
        title: 'Dentiste',
        start: '2026-10-03T12:00:00.000Z',
        end: '2026-10-03T12:30:00.000Z',
        allDay: false,
        link: 'https://calendar.google.com/'
      }
    ])
  })

  it('journée entière : dates seules, fin exclusive', () => {
    const [e] = parseIcs(
      ics(vevent(['UID:conge', 'SUMMARY:Congé', 'DTSTART;VALUE=DATE:20261003', 'DTEND;VALUE=DATE:20261004'])),
      'c1',
      range
    )
    expect(e).toMatchObject({ start: '2026-10-03', end: '2026-10-04', allDay: true })
  })

  it('hors plage → ignoré', () => {
    expect(
      parseIcs(ics(vevent(['UID:loin', 'DTSTART:20261010T080000Z', 'DTEND:20261010T090000Z'])), 'c1', range)
    ).toEqual([])
  })

  it('récurrence : une occurrence par jour, clé stable par occurrence, exception déplacée et occurrence annulée', () => {
    const events = parseIcs(
      ics(
        vevent([
          'UID:standup',
          'SUMMARY:Point quotidien',
          'DTSTART;TZID=Europe/Paris:20260101T090000',
          'DTEND;TZID=Europe/Paris:20260101T091500',
          'RRULE:FREQ=DAILY',
          'EXDATE;TZID=Europe/Paris:20261005T090000'
        ]),
        vevent([
          'UID:standup',
          'RECURRENCE-ID;TZID=Europe/Paris:20261004T090000',
          'SUMMARY:Point quotidien (décalé)',
          'DTSTART;TZID=Europe/Paris:20261004T110000',
          'DTEND;TZID=Europe/Paris:20261004T111500'
        ])
      ),
      'c1',
      range
    )
    expect(events.map((e) => [e.key, e.title, e.start])).toEqual([
      ['c1:standup#2026-10-03T07:00:00.000Z', 'Point quotidien', '2026-10-03T07:00:00.000Z'],
      ['c1:standup#2026-10-04T07:00:00.000Z', 'Point quotidien (décalé)', '2026-10-04T09:00:00.000Z']
    ])
  })

  it('ignore les événements annulés et ceux que j’ai refusés ; titre par défaut', () => {
    const events = parseIcs(
      ics(
        vevent(['UID:a', 'STATUS:CANCELLED', 'SUMMARY:Annulé', 'DTSTART:20261003T080000Z', 'DTEND:20261003T090000Z']),
        vevent([
          'UID:b',
          'SUMMARY:Refusé',
          'DTSTART:20261003T080000Z',
          'DTEND:20261003T090000Z',
          'ATTENDEE;PARTSTAT=DECLINED:mailto:Moi@Gmail.com'
        ]),
        vevent(['UID:c', 'DTSTART:20261003T100000Z', 'DTEND:20261003T110000Z'])
      ),
      'c1',
      range,
      'moi@gmail.com'
    )
    expect(events.map((e) => [e.key, e.title])).toEqual([['c1:c', '(sans titre)']])
  })
})

describe('fetchIcsEvents', () => {
  const body = ics(vevent(['UID:x', 'SUMMARY:X', 'DTSTART:20261003T100000Z', 'DTEND:20261003T110000Z']))

  it('lit plusieurs liens et trie les événements', async () => {
    const fetchFn = vi.fn(async (url: string) => new Response(url.includes('b') ? body.replace('UID:x', 'UID:y').replace('100000Z', '080000Z') : body))
    const events = await fetchIcsEvents(['https://cal/a.ics', 'https://cal/b.ics'], range, fetchFn)
    expect(events.map((e) => e.title)).toEqual(['X', 'X'])
    expect(events[0].start).toBe('2026-10-03T08:00:00.000Z')
    expect(new Set(events.map((e) => e.key.split(':')[0])).size).toBe(2)
  })

  it('lien refusé (404) → invalid-url ; réponse qui n’est pas de l’iCal → invalid-url', async () => {
    await expect(fetchIcsEvents(['https://cal/a.ics'], range, vi.fn(async () => new Response('', { status: 404 })))).rejects.toMatchObject({ kind: 'invalid-url' })
    await expect(fetchIcsEvents(['https://cal/a.ics'], range, vi.fn(async () => new Response('<html>connexion</html>')))).rejects.toMatchObject({ kind: 'invalid-url' })
  })

  it('panne réseau → network', async () => {
    const err = await fetchIcsEvents(['https://cal/a.ics'], range, vi.fn(async () => {
      throw new TypeError('fetch failed')
    })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CalendarSourceError)
    expect(err).toMatchObject({ kind: 'network' })
  })
})
