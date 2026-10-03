import { describe, it, expect } from 'vitest'
import { planSync, summarize } from './sync'
import type { MailHeader } from './types'

const h = (uid: number): MailHeader => ({ uid, envelope: { subject: `S${uid}` } })
const box = { uidValidity: '1', uidNext: 101 }

describe('planSync', () => {
  it('premier lancement → reset à uidNext - 1', () => {
    expect(planSync({ lastSeenUid: null, uidValidity: null }, box)).toEqual({
      kind: 'reset',
      save: { lastSeenUid: 100, uidValidity: '1' }
    })
  })

  it('uidValidity différent → reset', () => {
    expect(planSync({ lastSeenUid: 50, uidValidity: '0' }, box).kind).toBe('reset')
  })

  it('boîte vide → position 0', () => {
    expect(planSync({ lastSeenUid: null, uidValidity: null }, { uidValidity: '1', uidNext: 1 })).toEqual({
      kind: 'reset',
      save: { lastSeenUid: 0, uidValidity: '1' }
    })
  })

  it('état connu → fetch depuis la position', () => {
    expect(planSync({ lastSeenUid: 100, uidValidity: '1' }, box)).toEqual({ kind: 'fetch', sinceUid: 100 })
  })
})

describe('summarize', () => {
  it('rien de neuf → none', () => {
    expect(summarize([], 100, 'moi@gmail.com')).toEqual({ kind: 'none' })
  })

  it("ignore les UID déjà vus (Gmail renvoie le dernier message pour N:*)", () => {
    expect(summarize([h(100)], 100, 'moi@gmail.com')).toEqual({ kind: 'none' })
  })

  it('trie, dédoublonne et garde 5 mails en individuel', () => {
    const out = summarize([h(105), h(101), h(103), h(102), h(104), h(103)], 100, 'moi@gmail.com')
    expect(out.kind).toBe('individual')
    if (out.kind !== 'individual') return
    expect(out.mails.map((m) => m.uid)).toEqual([101, 102, 103, 104, 105])
    expect(out.lastSeenUid).toBe(105)
  })

  it('plus de 5 mails → un seul batch', () => {
    const headers = [101, 102, 103, 104, 105, 106].map(h)
    expect(summarize(headers, 100, 'moi@gmail.com')).toEqual({ kind: 'batch', count: 6, lastSeenUid: 106 })
  })
})
