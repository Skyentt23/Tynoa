import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createWidgetDrag, type Point } from './widgetDrag'

function setup() {
  let cursor: Point = { x: 500, y: 20 }
  let position: Point = { x: 400, y: 0 }
  const setPosition = vi.fn((p: Point) => (position = p))
  const onEnd = vi.fn()
  const drag = createWidgetDrag({
    getCursor: () => cursor,
    getPosition: () => position,
    setPosition,
    onEnd,
    intervalMs: 16,
    maxMs: 60_000
  })
  return { drag, setPosition, onEnd, moveCursor: (p: Point) => (cursor = p) }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createWidgetDrag', () => {
  it('le widget suit la souris en gardant le point de prise', () => {
    const t = setup()
    t.drag.start()
    t.moveCursor({ x: 900, y: 320 })
    vi.advanceTimersByTime(16)
    expect(t.setPosition).toHaveBeenLastCalledWith({ x: 800, y: 300 })
  })

  it('à la fin, cesse de suivre et signale la position finale une seule fois', () => {
    const t = setup()
    t.drag.start()
    t.moveCursor({ x: 900, y: 320 })
    vi.advanceTimersByTime(16)
    t.drag.end()
    t.drag.end()
    expect(t.onEnd).toHaveBeenCalledTimes(1)
    expect(t.onEnd).toHaveBeenCalledWith({ x: 800, y: 300 })
    t.setPosition.mockClear()
    t.moveCursor({ x: 0, y: 0 })
    vi.advanceTimersByTime(100)
    expect(t.setPosition).not.toHaveBeenCalled()
  })

  it('end() sans start() ne fait rien', () => {
    const t = setup()
    t.drag.end()
    expect(t.onEnd).not.toHaveBeenCalled()
  })

  it("s'arrête tout seul si la fin n'arrive jamais", () => {
    const t = setup()
    t.drag.start()
    vi.advanceTimersByTime(60_016)
    expect(t.onEnd).toHaveBeenCalledTimes(1)
  })
})
