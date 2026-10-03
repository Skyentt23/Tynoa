import type { CalendarEvent, TynoaEvents } from '../../../shared/events'
import type { EventBus } from '../../events/eventBus'
import type { Settings } from '../../store/settings'
import { dayKey, diffChanges, dueReminders, nextEvent, reminderKey, todayEvents } from './agenda'
import { CalendarApiError } from './calendarApi'

export const POLL_MS = 5 * 60 * 1000
export const TICK_MS = 30 * 1000
/** Le résumé n'est pas montré en pleine nuit (PC resté allumé) : il attend la première lecture après 5 h. */
const SUMMARY_EARLIEST_HOUR = 5
const REMINDED_TTL_MS = 2 * 24 * 60 * 60 * 1000

export interface CalendarWatcherDeps {
  bus: EventBus<TynoaEvents>
  settings: { load(): Settings; save(patch: Partial<Settings>): Settings }
  /** null = pas connecté à Google (ou révoqué) ; lève une erreur si Google est injoignable. */
  getAccessToken: () => Promise<string | null>
  fetchEvents: (accessToken: string, range: { timeMin: string; timeMax: string }) => Promise<CalendarEvent[]>
  now?: () => Date
  log?: (message: string) => void
}

/** Lit l'agenda toutes les 5 min et publie rappels, prochain événement, résumé et changements du jour. */
export class CalendarWatcher {
  private events: CalendarEvent[] | null = null
  private lastNextKey: string | undefined
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private polling: Promise<void> | null = null

  constructor(private readonly deps: CalendarWatcherDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  async start(): Promise<void> {
    this.stop()
    this.pollTimer = setInterval(() => void this.refreshNow(), POLL_MS)
    this.tickTimer = setInterval(() => this.tick(), TICK_MS)
    await this.refreshNow()
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.pollTimer = null
    this.tickTimer = null
  }

  /** Relecture immédiate (sortie de veille, connexion Google). Jamais deux lectures en parallèle. */
  refreshNow(): Promise<void> {
    if (!this.polling) {
      this.polling = this.poll().finally(() => {
        this.polling = null
      })
    }
    return this.polling
  }

  private async poll(): Promise<void> {
    let fresh: CalendarEvent[]
    try {
      const token = await this.deps.getAccessToken()
      if (!token) return
      fresh = await this.deps.fetchEvents(token, readRange(this.now()))
    } catch (err) {
      if (err instanceof CalendarApiError && err.kind !== 'network') {
        this.deps.bus.emit('google.status', { state: 'error', reason: err.kind })
      } else {
        // Réseau : on garde les derniers événements connus et on réessaiera.
        this.deps.log?.(`Lecture de l'agenda impossible : ${err instanceof Error ? err.message : String(err)}`)
      }
      return
    }
    const now = this.now()
    for (const change of diffChanges(this.events, fresh, now)) {
      this.deps.bus.emit('calendar.changed', change)
    }
    this.events = fresh
    const today = dayKey(now)
    if (this.deps.settings.load().lastSummaryDate !== today && now.getHours() >= SUMMARY_EARLIEST_HOUR) {
      this.deps.settings.save({ lastSummaryDate: today })
      this.deps.bus.emit('calendar.summary', { events: todayEvents(fresh, now) })
    }
    this.tick()
  }

  private tick(): void {
    if (!this.events) return
    const now = this.now()
    const settings = this.deps.settings.load()
    const due = dueReminders(this.events, now, settings.reminderMinutes, new Set(settings.remindedKeys))
    const kept = settings.remindedKeys.filter((k) => !isExpired(k, now))
    if (due.length > 0 || kept.length !== settings.remindedKeys.length) {
      // Mémorisé avant l'émission : un redémarrage ne répète jamais un rappel.
      this.deps.settings.save({ remindedKeys: [...kept, ...due.map(reminderKey)] })
    }
    for (const event of due) {
      this.deps.bus.emit('calendar.reminder', { event, minutes: settings.reminderMinutes })
    }
    const next = nextEvent(this.events, now)
    const nextKey = next ? reminderKey(next) : ''
    if (nextKey !== this.lastNextKey) {
      this.lastNextKey = nextKey
      this.deps.bus.emit('calendar.next', { event: next })
    }
  }
}

/** Du début d'aujourd'hui à la fin de demain (heure locale). */
function readRange(now: Date): { timeMin: string; timeMax: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
  return { timeMin: start.toISOString(), timeMax: end.toISOString() }
}

function isExpired(key: string, now: Date): boolean {
  const start = Date.parse(key.slice(key.lastIndexOf('@') + 1))
  return Number.isNaN(start) || now.getTime() - start > REMINDED_TTL_MS
}
