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

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Position du widget : celle choisie par l'utilisateur, ramenée entièrement
 * dans l'écran qui en contient le plus (cartes comprises) ; en haut au centre
 * de l'écran principal si aucune position n'est enregistrée ou si l'écran a disparu.
 */
export function placeWidget(
  saved: { x: number; y: number } | null,
  workAreas: Rect[],
  primary: Rect,
  size: { width: number; height: number }
): { x: number; y: number } {
  const topCenter = { x: Math.round(primary.x + (primary.width - size.width) / 2), y: primary.y }
  if (!saved) return topCenter
  const bounds = { ...saved, ...size }
  let best: Rect | null = null
  let bestOverlap = 0
  for (const area of workAreas) {
    const o = overlap(bounds, area)
    if (o > bestOverlap) {
      best = area
      bestOverlap = o
    }
  }
  if (!best) return topCenter
  return {
    x: Math.round(clamp(saved.x, best.x, best.x + best.width - size.width)),
    y: Math.round(clamp(saved.y, best.y, best.y + best.height - size.height))
  }
}
