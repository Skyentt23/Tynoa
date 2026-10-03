import { describe, it, expect } from 'vitest'
import type { CalendarEvent } from '../../../shared/events'
import { dayKey, diffChanges, dueReminders, nextEvent, reminderKey, todayEvents } from './agenda'

// Heures locales : 3 octobre 2026.
const at = (h: number, m = 0, day = 3): Date => new Date(2026, 9, day, h, m)

function timed(id: string, start: Date, minutes = 30): CalendarEvent {
  return {
    key: `cal:${id}`,
    title: id,
    start: start.toISOString(),
    end: new Date(start.getTime() + minutes * 60_000).toISOString(),
    allDay: false,
    link: 'https://calendar.google.com/'
  }
}

function allDay(id: string, start: string, end: string): CalendarEvent {
  return { key: `cal:${id}`, title: id, start, end, allDay: true, link: 'https://calendar.google.com/' }
}

describe('dayKey', () => {
  it('date locale AAAA-MM-JJ', () => expect(dayKey(at(0, 5))).toBe('2026-10-03'))
})

describe('dueReminders', () => {
  const dentiste = timed('dentiste', at(14))

  it('dans la fenêtre de rappel → dû', () => {
    expect(dueReminders([dentiste], at(13, 50), 10, new Set())).toEqual([dentiste])
  })

  it('PC allumé à 13:55 pour 14:00 → rappel immédiat', () => {
    expect(dueReminders([dentiste], at(13, 55), 10, new Set())).toEqual([dentiste])
  })

  it('trop tôt, ou déjà commencé → rien', () => {
    expect(dueReminders([dentiste], at(13, 49), 10, new Set())).toEqual([])
    expect(dueReminders([dentiste], at(14, 0), 10, new Set())).toEqual([])
  })

  it('déjà rappelé → rien', () => {
    expect(dueReminders([dentiste], at(13, 55), 10, new Set([reminderKey(dentiste)]))).toEqual([])
  })

  it('jamais pour un événement « toute la journée »', () => {
    expect(dueReminders([allDay('fete', '2026-10-04', '2026-10-05')], at(23, 55), 10, new Set())).toEqual([])
  })

  it('déplacé après rappel → nouveau rappel (clé = événement + début)', () => {
    const moved = { ...dentiste, start: at(16).toISOString() }
    expect(dueReminders([moved], at(15, 55), 10, new Set([reminderKey(dentiste)]))).toEqual([moved])
  })
})

describe('nextEvent', () => {
  it('premier événement avec heure commençant dans l’heure', () => {
    const a = timed('a', at(14, 30))
    const b = timed('b', at(14, 45))
    expect(nextEvent([b, a], at(14))).toEqual(a)
  })

  it('rien dans l’heure, ou déjà commencé → null', () => {
    expect(nextEvent([timed('loin', at(15, 1))], at(14))).toBeNull()
    expect(nextEvent([timed('encours', at(13, 50))], at(14))).toBeNull()
    expect(nextEvent([allDay('fete', '2026-10-03', '2026-10-04')], at(14))).toBeNull()
  })
})

describe('todayEvents', () => {
  it('événements avec heure du jour + journées couvrant aujourd’hui, triés', () => {
    const matin = timed('matin', at(9))
    const demain = timed('demain', at(9, 0, 4))
    const conge = allDay('conge', '2026-10-02', '2026-10-05')
    const hier = allDay('hier', '2026-10-02', '2026-10-03')
    expect(todayEvents([demain, matin, hier, conge], at(8)).map((e) => e.title)).toEqual(['conge', 'matin'])
  })
})

describe('diffChanges', () => {
  const now = at(8)

  it('première lecture (pas de référence) → aucun changement', () => {
    expect(diffChanges(null, [timed('a', at(10))], now)).toEqual([])
  })

  it('ajouté / déplacé / annulé aujourd’hui', () => {
    const a = timed('a', at(10))
    const b = timed('b', at(11))
    const c = timed('c', at(12))
    const bMoved = { ...b, start: at(15).toISOString() }
    expect(diffChanges([a, b], [bMoved, c], now)).toEqual([
      { kind: 'moved', event: bMoved, previousStart: b.start },
      { kind: 'added', event: c },
      { kind: 'cancelled', event: a }
    ])
  })

  it('déplacé de demain à aujourd’hui, ou d’aujourd’hui à demain → notifié', () => {
    const fromTomorrow = timed('x', at(10, 0, 4))
    const toToday = { ...fromTomorrow, start: at(17).toISOString() }
    expect(diffChanges([fromTomorrow], [toToday], now)).toHaveLength(1)
    expect(diffChanges([toToday], [fromTomorrow], now)).toHaveLength(1)
  })

  it('changement entièrement hors d’aujourd’hui → ignoré', () => {
    const t1 = timed('t', at(10, 0, 4))
    const t2 = { ...t1, start: at(11, 0, 4).toISOString() }
    expect(diffChanges([t1], [t2, timed('n', at(9, 0, 4))], now)).toEqual([])
  })

  it('titre modifié sans changement d’heure → pas une notification', () => {
    const a = timed('a', at(10))
    expect(diffChanges([a], [{ ...a, title: 'Autre titre' }], now)).toEqual([])
  })
})
