import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CalendarEvent, TynoaEvents } from '../../../shared/events'
import { EventBus } from '../../events/eventBus'
import { DEFAULT_SETTINGS, type Settings } from '../../store/settings'
import { CalendarSourceError } from './icsSource'
import { CalendarWatcher } from './calendarWatcher'

const at = (h: number, m = 0, day = 3): Date => new Date(2026, 9, day, h, m)

function timed(id: string, start: Date): CalendarEvent {
  return {
    key: `cal:${id}`,
    title: id,
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * 60_000).toISOString(),
    allDay: false,
    link: 'https://calendar.google.com/'
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r))
}

function setup(opts: { now: Date; events?: CalendarEvent[]; settings?: Partial<Settings>; sources?: string[] } = { now: at(8) }) {
  let stored: Settings = { ...DEFAULT_SETTINGS, ...opts.settings }
  const settings = {
    load: (): Settings => ({ ...stored, remindedKeys: [...stored.remindedKeys] }),
    save: (p: Partial<Settings>): Settings => (stored = { ...stored, ...p })
  }
  const server = { events: opts.events ?? [], error: null as Error | null }
  const clock = { now: opts.now }
  const sourcesRef = { value: opts.sources ?? ['https://calendar.google.com/calendar/ical/x/private-y/basic.ics'] }
  const bus = new EventBus<TynoaEvents>()
  const seen: { name: string; payload: unknown }[] = []
  for (const name of ['calendar.reminder', 'calendar.next', 'calendar.summary', 'calendar.changed', 'calendar.status'] as const) {
    bus.on(name, (payload) => seen.push({ name, payload }))
  }
  const fetchEvents = vi.fn(async () => {
    if (server.error) throw server.error
    return server.events
  })
  const make = (): CalendarWatcher =>
    new CalendarWatcher({
      bus,
      settings,
      getSources: () => sourcesRef.value,
      fetchEvents,
      now: () => clock.now
    })
  return {
    watcher: make(),
    make,
    server,
    clock,
    sourcesRef,
    settings,
    fetchEvents,
    of: (name: string) => seen.filter((s) => s.name === name).map((s) => s.payload)
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CalendarWatcher', () => {
  it('résumé du jour à la première lecture, une seule fois par jour', async () => {
    const dentiste = timed('dentiste', at(14))
    const t = setup({ now: at(8), events: [dentiste, timed('demain', at(9, 0, 4))] })
    await t.watcher.start()
    expect(t.of('calendar.summary')).toEqual([{ events: [dentiste] }])
    expect(t.settings.load().lastSummaryDate).toBe('2026-10-03')
    await t.watcher.refreshNow()
    const again = t.make()
    await again.start()
    expect(t.of('calendar.summary')).toHaveLength(1)
  })

  it('pas de résumé en pleine nuit (avant 5 h) : il viendra à la lecture suivante après 5 h', async () => {
    const t = setup({ now: at(0, 10), events: [] })
    await t.watcher.start()
    expect(t.of('calendar.summary')).toEqual([])
    t.clock.now = at(5, 2)
    await t.watcher.refreshNow()
    expect(t.of('calendar.summary')).toEqual([{ events: [] }])
  })

  it('rappel dû → émis une fois ; un redémarrage ne le répète pas', async () => {
    const dentiste = timed('dentiste', at(14))
    const t = setup({ now: at(13, 55), events: [dentiste], settings: { lastSummaryDate: '2026-10-03' } })
    await t.watcher.start()
    expect(t.of('calendar.reminder')).toEqual([{ event: dentiste, minutes: 10 }])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(t.of('calendar.reminder')).toHaveLength(1)
    const restarted = t.make()
    await restarted.start()
    expect(t.of('calendar.reminder')).toHaveLength(1)
  })

  it('l’horloge de 30 s déclenche le rappel entre deux lectures', async () => {
    const t = setup({ now: at(13, 40), events: [timed('dentiste', at(14))], settings: { lastSummaryDate: '2026-10-03' } })
    await t.watcher.start()
    expect(t.of('calendar.reminder')).toEqual([])
    t.clock.now = at(13, 50)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(t.of('calendar.reminder')).toHaveLength(1)
  })

  it('pastille : prochain événement dans l’heure, puis null une fois commencé', async () => {
    const dentiste = timed('dentiste', at(14))
    const t = setup({ now: at(13, 30), events: [dentiste], settings: { lastSummaryDate: '2026-10-03' } })
    await t.watcher.start()
    expect(t.of('calendar.next').at(-1)).toEqual({ event: dentiste })
    t.clock.now = at(14, 1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(t.of('calendar.next').at(-1)).toEqual({ event: null })
  })

  it('changements : rien à la première lecture, puis ajout du jour notifié', async () => {
    const t = setup({ now: at(8), events: [timed('a', at(10))], settings: { lastSummaryDate: '2026-10-03' } })
    await t.watcher.start()
    expect(t.of('calendar.changed')).toEqual([])
    const added = timed('b', at(16))
    t.server.events = [...t.server.events, added]
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    await flush()
    expect(t.of('calendar.changed')).toEqual([{ kind: 'added', event: added }])
  })

  it('panne réseau : garde les derniers événements, rien de notifié', async () => {
    const t = setup({ now: at(8), events: [timed('a', at(10))], settings: { lastSummaryDate: '2026-10-03' } })
    await t.watcher.start()
    t.server.error = new CalendarSourceError('network')
    t.server.events = []
    await t.watcher.refreshNow()
    expect(t.of('calendar.changed')).toEqual([])
    expect(t.of('calendar.status')).toEqual([])
  })

  it('lien invalide → calendar.status error/invalid-url', async () => {
    const t = setup({ now: at(8) })
    t.server.error = new CalendarSourceError('invalid-url')
    await t.watcher.start()
    expect(t.of('calendar.status')).toEqual([{ state: 'error', reason: 'invalid-url' }])
  })

  it('aucun lien enregistré → aucune lecture', async () => {
    const t = setup({ now: at(8), sources: [] })
    await t.watcher.start()
    expect(t.fetchEvents).not.toHaveBeenCalled()
  })

  it('purge les rappels mémorisés de plus de 2 jours', async () => {
    const old = `cal:x@${at(9, 0, 1).toISOString()}`
    const recent = `cal:y@${at(9, 0, 2).toISOString()}`
    const t = setup({
      now: at(13, 55),
      events: [timed('dentiste', at(14))],
      settings: { lastSummaryDate: '2026-10-03', remindedKeys: [old, recent] }
    })
    await t.watcher.start()
    expect(t.settings.load().remindedKeys).not.toContain(old)
    expect(t.settings.load().remindedKeys).toContain(recent)
  })

  it('stop() arrête lectures et horloge', async () => {
    const t = setup({ now: at(8), settings: { lastSummaryDate: '2026-10-03' } })
    await t.watcher.start()
    t.watcher.stop()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(t.fetchEvents).toHaveBeenCalledTimes(1)
  })
})

describe('CalendarWatcher — déconnexion, changement de compte, rétablissement', () => {
  it('liens retirés : oublie les événements, plus de rappel ni de pastille', async () => {
    const dentiste = timed('dentiste', at(14))
    const t = setup({ now: at(13, 30), events: [dentiste], settings: { lastSummaryDate: '2026-10-03' } })
    await t.watcher.start()
    expect(t.of('calendar.next').at(-1)).toEqual({ event: dentiste })
    t.sourcesRef.value = []
    await t.watcher.refreshNow()
    expect(t.of('calendar.next').at(-1)).toEqual({ event: null })
    t.clock.now = at(13, 55)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(t.of('calendar.reminder')).toEqual([])
  })

  it('reset() (liens changés) : la lecture suivante sert de référence, aucun faux changement', async () => {
    const t = setup({ now: at(8), events: [timed('a', at(10))], settings: { lastSummaryDate: '2026-10-03' } })
    await t.watcher.start()
    t.watcher.reset()
    t.server.events = [timed('b', at(11))]
    await t.watcher.refreshNow()
    expect(t.of('calendar.changed')).toEqual([])
  })

  it('lien invalide puis corrigé : statut ok réémis', async () => {
    const t = setup({ now: at(8), settings: { lastSummaryDate: '2026-10-03' } })
    t.server.error = new CalendarSourceError('invalid-url')
    await t.watcher.start()
    t.server.error = null
    await t.watcher.refreshNow()
    expect(t.of('calendar.status')).toEqual([{ state: 'error', reason: 'invalid-url' }, { state: 'ok' }])
    await t.watcher.refreshNow()
    expect(t.of('calendar.status')).toHaveLength(2)
  })

})
