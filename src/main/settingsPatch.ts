import { clampDisplaySeconds } from './policy'
import type { Settings } from './store/settings'

export interface SettingsForm {
  email: string
  displaySeconds: number
  launchAtStartup: boolean
  googleClientId: string
  /** Vide = garder le secret enregistré. */
  googleClientSecret: string
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
    googleClientId: form.googleClientId.trim(),
    reminderMinutes: clampReminderMinutes(form.reminderMinutes)
  }
  const secret = form.googleClientSecret.trim()
  if (secret) patch.googleClientSecret = secret
  if (email.toLowerCase() !== prev.email.trim().toLowerCase()) {
    patch.lastSeenUid = null
    patch.uidValidity = null
  }
  return patch
}

/** Formulaire équivalent aux réglages actuels (secret vide = inchangé). */
export function formOf(s: Settings): SettingsForm {
  return {
    email: s.email,
    displaySeconds: s.displaySeconds,
    launchAtStartup: s.launchAtStartup,
    googleClientId: s.googleClientId,
    googleClientSecret: '',
    reminderMinutes: s.reminderMinutes
  }
}
