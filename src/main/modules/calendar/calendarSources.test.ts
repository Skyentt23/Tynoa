import { describe, it, expect, vi } from 'vitest'
import { readCalendarUrls, writeCalendarUrls } from './calendarSources'

function store(initial: string | null = null) {
  let value = initial
  return {
    load: () => value,
    save: vi.fn((v: string) => {
      value = v
    }),
    clear: vi.fn(() => {
      value = null
    })
  }
}

describe('calendarSources', () => {
  it('aller-retour chiffré (via le store) et liste vide = effacer', () => {
    const s = store()
    writeCalendarUrls(s, ['https://a/x.ics', 'https://b/y.ics'])
    expect(readCalendarUrls(s)).toEqual(['https://a/x.ics', 'https://b/y.ics'])
    writeCalendarUrls(s, [])
    expect(s.clear).toHaveBeenCalled()
    expect(readCalendarUrls(s)).toEqual([])
  })

  it('contenu illisible → aucune source', () => {
    expect(readCalendarUrls(store('pas du json'))).toEqual([])
    expect(readCalendarUrls(store('{"a":1}'))).toEqual([])
    expect(readCalendarUrls(store('["https://a/x.ics", 3]'))).toEqual(['https://a/x.ics'])
  })
})
