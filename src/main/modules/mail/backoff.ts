const DELAYS_MS = [5_000, 10_000, 30_000, 60_000]
export const MAX_DELAY_MS = 300_000

/** Délai avant la tentative de reconnexion numéro `attempt` (0 = première). */
export function reconnectDelay(attempt: number): number {
  return DELAYS_MS[attempt] ?? MAX_DELAY_MS
}
