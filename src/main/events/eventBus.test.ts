import { describe, it, expect, vi } from 'vitest'
import { EventBus } from './eventBus'

interface TestEvents {
  ping: { n: number }
  other: string
}

describe('EventBus', () => {
  it("livre la charge aux abonnés de cet événement uniquement", () => {
    const bus = new EventBus<TestEvents>()
    const ping = vi.fn()
    const other = vi.fn()
    bus.on('ping', ping)
    bus.on('other', other)
    bus.emit('ping', { n: 1 })
    expect(ping).toHaveBeenCalledWith({ n: 1 })
    expect(other).not.toHaveBeenCalled()
  })

  it('le désabonnement arrête la livraison', () => {
    const bus = new EventBus<TestEvents>()
    const ping = vi.fn()
    const off = bus.on('ping', ping)
    off()
    bus.emit('ping', { n: 2 })
    expect(ping).not.toHaveBeenCalled()
  })

  it("un abonné qui lève une erreur n'empêche pas les autres", () => {
    const onError = vi.fn()
    const bus = new EventBus<TestEvents>(onError)
    const ok = vi.fn()
    bus.on('ping', () => {
      throw new Error('boom')
    })
    bus.on('ping', ok)
    bus.emit('ping', { n: 3 })
    expect(ok).toHaveBeenCalledWith({ n: 3 })
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('émettre sans abonné ne fait rien', () => {
    const bus = new EventBus<TestEvents>()
    expect(() => bus.emit('other', 'x')).not.toThrow()
  })
})
