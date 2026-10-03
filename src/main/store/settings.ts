import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Settings {
  email: string
  displaySeconds: number
  launchAtStartup: boolean
  /** Dernier UID IMAP déjà vu (null = jamais connecté). */
  lastSeenUid: number | null
  uidValidity: string | null
  /** Horodatage (ms) de fin de pause, null = pas de pause. */
  pausedUntil: number | null
  /** Position du widget choisie par l'utilisateur (null = en haut au centre). */
  widgetX: number | null
  widgetY: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  email: '',
  displaySeconds: 8,
  launchAtStartup: true,
  lastSeenUid: null,
  uidValidity: null,
  pausedUntil: null,
  widgetX: null,
  widgetY: null
}

export class SettingsStore {
  constructor(private readonly filePath: string) {}

  load(): Settings {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(this.filePath, 'utf8'))
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_SETTINGS }
    return sanitize(raw as Record<string, unknown>)
  }

  save(patch: Partial<Settings>): Settings {
    const next = { ...this.load(), ...patch }
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
    renameSync(tmp, this.filePath)
    return next
  }
}

function sanitize(r: Record<string, unknown>): Settings {
  const d = DEFAULT_SETTINGS
  const seconds = r.displaySeconds
  return {
    email: typeof r.email === 'string' ? r.email : d.email,
    displaySeconds:
      typeof seconds === 'number' && seconds >= 2 && seconds <= 60 ? seconds : d.displaySeconds,
    launchAtStartup: typeof r.launchAtStartup === 'boolean' ? r.launchAtStartup : d.launchAtStartup,
    lastSeenUid: Number.isInteger(r.lastSeenUid) ? (r.lastSeenUid as number) : null,
    uidValidity: typeof r.uidValidity === 'string' ? r.uidValidity : null,
    pausedUntil: typeof r.pausedUntil === 'number' ? r.pausedUntil : null,
    widgetX: Number.isFinite(r.widgetX) ? (r.widgetX as number) : null,
    widgetY: Number.isFinite(r.widgetY) ? (r.widgetY as number) : null
  }
}
