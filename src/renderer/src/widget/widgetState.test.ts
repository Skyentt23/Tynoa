import { describe, it, expect } from 'vitest'
import type { MailReceived } from '../../../shared/events'
import { initialWidgetState, visibleCards, widgetReducer, type WidgetState } from './widgetState'

const mail = (uid: number): MailReceived => ({
  uid,
  from: { name: `Exp ${uid}`, address: `e${uid}@ex.com` },
  subject: `Sujet ${uid}`,
  date: '2026-10-03T08:00:00.000Z',
  gmailLink: `https://mail.google.com/mail/u/#all/${uid}`
})

const receive = (state: WidgetState, uid: number, silent = false): WidgetState =>
  widgetReducer(state, { type: 'mail', mail: mail(uid), silent })

describe('widgetReducer', () => {
  it('un mail ajoute une carte, la liste et le compteur', () => {
    const s = receive(initialWidgetState, 1)
    expect(s.cards).toEqual([{ id: 'mail-1', kind: 'mail', mail: mail(1) }])
    expect(s.recent).toEqual([mail(1)])
    expect(s.unseen).toBe(1)
  })

  it('pendant une pause : pas de carte, mais compteur et liste', () => {
    const s = receive(initialWidgetState, 1, true)
    expect(s.cards).toEqual([])
    expect(s.recent).toHaveLength(1)
    expect(s.unseen).toBe(1)
  })

  it('ignore un UID déjà reçu', () => {
    const s = receive(receive(initialWidgetState, 1), 1)
    expect(s.cards).toHaveLength(1)
    expect(s.unseen).toBe(1)
  })

  it('la liste garde les 10 plus récents, le plus récent en premier', () => {
    let s = initialWidgetState
    for (let uid = 1; uid <= 12; uid++) s = receive(s, uid)
    expect(s.recent.map((m) => m.uid)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3])
  })

  it('batch : une carte et le compteur augmente du nombre de mails', () => {
    const s = widgetReducer(initialWidgetState, { type: 'batch', count: 7, silent: false, id: 'b1' })
    expect(s.cards).toEqual([{ id: 'b1', kind: 'batch', count: 7 }])
    expect(s.unseen).toBe(7)
    const silent = widgetReducer(initialWidgetState, { type: 'batch', count: 7, silent: true, id: 'b2' })
    expect(silent.cards).toEqual([])
    expect(silent.unseen).toBe(7)
  })

  it('dismiss retire la carte', () => {
    const s = widgetReducer(receive(initialWidgetState, 1), { type: 'dismiss', id: 'mail-1' })
    expect(s.cards).toEqual([])
  })

  it('ouvrir la liste remet le compteur à zéro, refermer la ferme', () => {
    const opened = widgetReducer(receive(initialWidgetState, 1), { type: 'toggleList' })
    expect(opened.listOpen).toBe(true)
    expect(opened.unseen).toBe(0)
    expect(widgetReducer(opened, { type: 'toggleList' }).listOpen).toBe(false)
  })

  it('statut', () => {
    const s = widgetReducer(initialWidgetState, { type: 'status', status: { state: 'connected' } })
    expect(s.status).toEqual({ state: 'connected' })
  })
})

describe('visibleCards', () => {
  it('3 cartes visibles et le nombre de cartes en attente', () => {
    let s = initialWidgetState
    for (let uid = 1; uid <= 5; uid++) s = receive(s, uid)
    const { shown, overflow } = visibleCards(s)
    expect(shown.map((c) => c.id)).toEqual(['mail-1', 'mail-2', 'mail-3'])
    expect(overflow).toBe(2)
  })
})

const event = (title: string): import('../../../shared/events').CalendarEvent => ({
  key: `cal:${title}`,
  title,
  start: '2026-10-03T12:00:00.000Z',
  end: '2026-10-03T12:30:00.000Z',
  allDay: false,
  link: 'https://www.google.com/calendar/event?eid=x'
})

describe('widgetReducer — agenda', () => {
  it('rappel : une carte, sans toucher au compteur de mails', () => {
    const s = widgetReducer(initialWidgetState, { type: 'reminder', event: event('Dentiste'), minutes: 10, silent: false })
    expect(s.cards).toEqual([{ id: 'reminder-cal:Dentiste@2026-10-03T12:00:00.000Z', kind: 'reminder', event: event('Dentiste'), minutes: 10 }])
    expect(s.unseen).toBe(0)
  })

  it('rappel en double ignoré ; en pause pas de carte', () => {
    const once = widgetReducer(initialWidgetState, { type: 'reminder', event: event('A'), minutes: 10, silent: false })
    expect(widgetReducer(once, { type: 'reminder', event: event('A'), minutes: 10, silent: false }).cards).toHaveLength(1)
    expect(widgetReducer(initialWidgetState, { type: 'reminder', event: event('A'), minutes: 10, silent: true }).cards).toEqual([])
  })

  it('résumé et changement : une carte chacun', () => {
    let s = widgetReducer(initialWidgetState, { type: 'summary', events: [event('A')], silent: false, id: 's1' })
    s = widgetReducer(s, { type: 'change', change: { kind: 'added', event: event('B') }, silent: false, id: 'c1' })
    expect(s.cards.map((c) => c.kind)).toEqual(['summary', 'change'])
  })

  it('prochain événement et statut agenda', () => {
    let s = widgetReducer(initialWidgetState, { type: 'next', event: event('A') })
    expect(s.next?.title).toBe('A')
    s = widgetReducer(s, { type: 'calendarStatus', status: { state: 'error', reason: 'invalid-url' } })
    expect(s.calendarStatus).toEqual({ state: 'error', reason: 'invalid-url' })
  })
})
