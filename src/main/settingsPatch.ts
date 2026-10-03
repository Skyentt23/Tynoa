import { clampDisplaySeconds } from './policy'
import type { Settings } from './store/settings'

export interface SettingsForm {
  email: string
  displaySeconds: number
  launchAtStartup: boolean
  reminderMinutes: number
}

const clampReminderMinutes = (minutes: number): number =>
  Number.isFinite(minutes) ? Math.min(120, Math.max(1, Math.round(minutes))) : 10

/** Changement de compte : on oublie la position, sinon tout l'historique du nouveau compte serait notifié. */
export function buildSettingsPatch(prev: Settings, form: SettingsForm): Partial<Settings> {
  const email = form.email.trim()
  const patch: Partial<Settings> = {
    email,
    displaySeconds: clampDisplaySeconds(form.displaySeconds),
    launchAtStartup: form.launchAtStartup,
    reminderMinutes: clampReminderMinutes(form.reminderMinutes)
  }
  if (email.toLowerCase() !== prev.email.trim().toLowerCase()) {
    patch.lastSeenUid = null
    patch.uidValidity = null
  }
  return patch
}

