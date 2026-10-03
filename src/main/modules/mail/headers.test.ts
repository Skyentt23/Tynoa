import { describe, it, expect } from 'vitest'
import { buildGmailLink, toMailReceived } from './headers'

describe('buildGmailLink', () => {
  it("cible le message via X-GM-MSGID en hexadécimal et encode le compte", () => {
    expect(buildGmailLink('moi+test@gmail.com', '255')).toBe(
      'https://mail.google.com/mail/u/?authuser=moi%2Btest%40gmail.com#all/ff'
    )
  })

  it('retombe sur la boîte de réception sans identifiant exploitable', () => {
    const base = 'https://mail.google.com/mail/u/?authuser=moi%40gmail.com#inbox'
    expect(buildGmailLink('moi@gmail.com', undefined)).toBe(base)
    expect(buildGmailLink('moi@gmail.com', 'abc')).toBe(base)
  })
})

describe('toMailReceived', () => {
  const date = new Date('2026-10-03T08:00:00Z')

  it('mappe un en-tête complet', () => {
    expect(
      toMailReceived(
        { uid: 7, emailId: '255', envelope: { from: [{ name: 'Alice', address: 'a@ex.com' }], subject: ' Salut ', date } },
        'moi@gmail.com'
      )
    ).toEqual({
      uid: 7,
      from: { name: 'Alice', address: 'a@ex.com' },
      subject: 'Salut',
      date: '2026-10-03T08:00:00.000Z',
      gmailLink: 'https://mail.google.com/mail/u/?authuser=moi%40gmail.com#all/ff'
    })
  })

  it("utilise l'adresse quand le nom manque", () => {
    const m = toMailReceived({ uid: 1, envelope: { from: [{ address: 'a@ex.com' }], date } }, 'moi@gmail.com')
    expect(m.from).toEqual({ name: 'a@ex.com', address: 'a@ex.com' })
  })

  it('valeurs de repli sans expéditeur, sans objet, date invalide', () => {
    const m = toMailReceived({ uid: 1, envelope: { subject: '  ', date: new Date('x') } }, 'moi@gmail.com')
    expect(m.from).toEqual({ name: 'Expéditeur inconnu', address: '' })
    expect(m.subject).toBe('(sans objet)')
    expect(Number.isNaN(Date.parse(m.date))).toBe(false)
  })
})
