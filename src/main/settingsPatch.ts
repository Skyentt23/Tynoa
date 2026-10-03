import { clampDisplaySeconds } from './policy'
import type { Settings } from './store/settings'

export interface SettingsForm {
  email: string
  displaySeconds: number
  launchAtStartup: boolean
}

/** Changement de compte : on oublie la position, sinon tout l'historique du nouveau compte serait notifié. */
export function buildSettingsPatch(prev: Settings, form: SettingsForm): Partial<Settings> {
  const email = form.email.trim()
  const patch: Partial<Settings> = {
    email,
    displaySeconds: clampDisplaySeconds(form.displaySeconds),
    launchAtStartup: form.launchAtStartup
  }
  if (email.toLowerCase() !== prev.email.trim().toLowerCase()) {
    patch.lastSeenUid = null
    patch.uidValidity = null
  }
  return patch
}
