import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { lockNavigation } from './navigation'

describe('lockNavigation', () => {
  it("empêche la fenêtre de quitter l'application (fichier glissé, lien)", () => {
    const contents = new EventEmitter()
    lockNavigation(contents as unknown as WebContents)
    const event = { preventDefault: vi.fn() }
    contents.emit('will-navigate', event, 'file:///C:/Users/moi/photo.png')
    expect(event.preventDefault).toHaveBeenCalled()
  })
})
