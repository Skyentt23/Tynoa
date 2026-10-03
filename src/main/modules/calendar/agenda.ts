import type { CalendarChange, CalendarEvent } from '../../../shared/events'
import { startMs } from './calendarApi'

/** Fenêtre pendant laquelle la pastille annonce le prochain événement. */
export const SOON_MS = 60 * 60 * 1000

const pad = (n: number): string => String(n).padStart(2, '0')

/** Jour local AAAA-MM-JJ. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Un rappel par événement et par horaire : un événement déplacé est rappelé à nouveau. */
export function reminderKey(e: CalendarEvent): string {
  return `${e.key}@${e.start}`
}

/** L'événement concerne-t-il ce jour (début ce jour-là, ou journée entière qui le couvre) ? */
function touchesDay(e: Pick<CalendarEvent, 'start' | 'end' | 'allDay'>, day: string): boolean {
  if (e.allDay) return e.start <= day && day < e.end
  return dayKey(new Date(e.start)) === day
}

export function dueReminders(
  events: CalendarEvent[],
  now: Date,
  minutes: number,
  reminded: Set<string>
): CalendarEvent[] {
  const t = now.getTime()
  return events.filter((e) => {
    if (e.allDay || reminded.has(reminderKey(e))) return false
    const start = startMs(e)
    return start - minutes * 60_000 <= t && t < start
  })
}

export function nextEvent(events: CalendarEvent[], now: Date): CalendarEvent | null {
  const t = now.getTime()
  const soon = events
    .filter((e) => !e.allDay && startMs(e) > t && startMs(e) - t <= SOON_MS)
    .sort((a, b) => startMs(a) - startMs(b))
  return soon[0] ?? null
}

export function todayEvents(events: CalendarEvent[], now: Date): CalendarEvent[] {
  const day = dayKey(now)
  return events.filter((e) => touchesDay(e, day)).sort((a, b) => startMs(a) - startMs(b))
}

/**
 * Changements entre deux lectures, seulement s'ils concernent aujourd'hui (avant ou après).
 * `previous = null` (première lecture de la session) : référence, aucun changement.
 */
export function diffChanges(
  previous: CalendarEvent[] | null,
  next: CalendarEvent[],
  now: Date
): CalendarChange[] {
  if (!previous) return []
  const day = dayKey(now)
  const before = new Map(previous.map((e) => [e.key, e]))
  const after = new Map(next.map((e) => [e.key, e]))
  const changes: CalendarChange[] = []
  for (const e of next) {
    const old = before.get(e.key)
    if (!old) {
      if (touchesDay(e, day)) changes.push({ kind: 'added', event: e })
    } else if (old.start !== e.start && (touchesDay(old, day) || touchesDay(e, day))) {
      changes.push({ kind: 'moved', event: e, previousStart: old.start })
    }
  }
  for (const e of previous) {
    if (!after.has(e.key) && touchesDay(e, day)) changes.push({ kind: 'cancelled', event: e })
  }
  return changes
}
