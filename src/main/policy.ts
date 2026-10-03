/** Valeur de `pausedUntil` pour « Pause jusqu'à réactivation ». */
export const FOREVER = Number.MAX_SAFE_INTEGER

export function isPaused(now: number, pausedUntil: number | null): boolean {
  return pausedUntil !== null && now < pausedUntil
}

function isHttpsHost(link: string, hosts: string[]): boolean {
  try {
    const url = new URL(link)
    return url.protocol === 'https:' && hosts.includes(url.hostname)
  } catch {
    return false
  }
}

/** Seuls les liens Gmail peuvent être ouverts depuis le widget. */
export function isAllowedMailLink(link: string): boolean {
  return isHttpsHost(link, ['mail.google.com'])
}

/** Liens d'aide autorisés dans la fenêtre Paramètres. */
export function isAllowedHelpLink(link: string): boolean {
  return isHttpsHost(link, ['myaccount.google.com', 'support.google.com'])
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Google affiche le mot de passe d'application par groupes de 4 séparés d'espaces. */
export function normalizeAppPassword(raw: string): string {
  return raw.replace(/\s+/g, '')
}

export function clampDisplaySeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 8
  return Math.min(60, Math.max(2, Math.round(seconds)))
}

/**
 * États de SHQueryUserNotificationState : 2 = appli plein écran (QUNS_BUSY),
 * 3 = jeu Direct3D plein écran, 4 = mode présentation.
 */
export function isFullscreenState(state: number): boolean {
  return state === 2 || state === 3 || state === 4
}

export function runOnce(fn: () => void): () => void {
  let done = false
  return () => {
    if (done) return
    done = true
    fn()
  }
}
