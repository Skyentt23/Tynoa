import koffi from 'koffi'
import { isFullscreenState } from '../policy'

/**
 * Surveille si une application est en plein écran (jeu, vidéo, présentation)
 * via SHQueryUserNotificationState. Hors Windows ou en cas d'échec : ne fait rien.
 */
export function watchFullscreen(
  onChange: (fullscreen: boolean) => void,
  intervalMs = 2_000
): () => void {
  let query: (out: number[]) => number
  try {
    query = koffi
      .load('shell32.dll')
      .func('long __stdcall SHQueryUserNotificationState(_Out_ int *pquns)')
  } catch {
    return () => undefined
  }
  let last = false
  const timer = setInterval(() => {
    const out = [0]
    if (query(out) !== 0) return
    const fullscreen = isFullscreenState(out[0])
    if (fullscreen !== last) {
      last = fullscreen
      onChange(fullscreen)
    }
  }, intervalMs)
  return () => clearInterval(timer)
}
