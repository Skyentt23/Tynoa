export interface Point {
  x: number
  y: number
}

export interface WidgetDragDeps {
  getCursor(): Point
  getPosition(): Point
  setPosition(position: Point): void
  /** Appelé une fois, avec la position finale, à la fin du glissement. */
  onEnd(position: Point): void
  intervalMs?: number
  /** Filet de sécurité si la fin du glissement n'arrive jamais. */
  maxMs?: number
}

/**
 * Glissement du widget piloté par le process principal : on suit le curseur
 * de l'écran, car la zone de glissement native (`-webkit-app-region`) ne marche pas
 * sur une fenêtre non focalisable qui laisse passer les clics.
 */
export function createWidgetDrag(deps: WidgetDragDeps): { start(): void; end(): void } {
  const intervalMs = deps.intervalMs ?? 16
  const maxMs = deps.maxMs ?? 60_000
  let timer: ReturnType<typeof setInterval> | null = null

  const end = (): void => {
    if (!timer) return
    clearInterval(timer)
    timer = null
    deps.onEnd(deps.getPosition())
  }

  const start = (): void => {
    if (timer) clearInterval(timer)
    const cursor = deps.getCursor()
    const position = deps.getPosition()
    const grab = { x: cursor.x - position.x, y: cursor.y - position.y }
    let elapsed = 0
    timer = setInterval(() => {
      elapsed += intervalMs
      if (elapsed > maxMs) return end()
      const c = deps.getCursor()
      deps.setPosition({ x: c.x - grab.x, y: c.y - grab.y })
    }, intervalMs)
  }

  return { start, end }
}
