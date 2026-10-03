import { describe, it, expect, vi } from 'vitest'
import {
  FOREVER,
  clampDisplaySeconds,
  isAllowedHelpLink,
  isAllowedMailLink,
  isAllowedOpenLink,
  isFullscreenState,
  isPaused,
  isValidEmail,
  normalizeAppPassword,
  placeWidget,
  runOnce
} from './policy'
import { buildSettingsPatch, googleClientPatch } from './settingsPatch'
import { DEFAULT_SETTINGS } from './store/settings'

describe('isPaused', () => {
  it('null → pas de pause', () => expect(isPaused(1_000, null)).toBe(false))
  it('pause en cours', () => expect(isPaused(1_000, 2_000)).toBe(true))
  it('pause expirée', () => expect(isPaused(3_000, 2_000)).toBe(false))
  it('jusqu’à réactivation', () => expect(isPaused(Date.now(), FOREVER)).toBe(true))
})

describe('isAllowedMailLink', () => {
  it('accepte Gmail en https', () => {
    expect(isAllowedMailLink('https://mail.google.com/mail/u/?authuser=a%40b.co#all/ff')).toBe(true)
  })
  it.each([
    'http://mail.google.com/mail/u/0/',
    'https://mail.google.com.evil.com/',
    'javascript:alert(1)',
    'pas une adresse'
  ])('refuse %s', (link) => expect(isAllowedMailLink(link)).toBe(false))
})

describe('isAllowedHelpLink', () => {
  it('accepte les pages d’aide Google', () => {
    expect(isAllowedHelpLink('https://myaccount.google.com/apppasswords')).toBe(true)
    expect(isAllowedHelpLink('https://support.google.com/accounts/answer/185833')).toBe(true)
  })
  it('refuse le reste', () => {
    expect(isAllowedHelpLink('https://example.com/')).toBe(false)
    expect(isAllowedHelpLink('http://myaccount.google.com/')).toBe(false)
  })
})

describe('isValidEmail', () => {
  it('valide', () => expect(isValidEmail('moi@gmail.com')).toBe(true))
  it.each(['', 'moi', 'moi@', 'moi@gmail', 'a b@gmail.com'])('invalide : %s', (e) =>
    expect(isValidEmail(e)).toBe(false)
  )
})

describe('normalizeAppPassword', () => {
  it('retire les espaces du mot de passe d’application collé', () => {
    expect(normalizeAppPassword('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop')
    expect(normalizeAppPassword(' abcd\tefgh\n')).toBe('abcdefgh')
  })
  it('vide reste vide', () => expect(normalizeAppPassword('  ')).toBe(''))
})

describe('clampDisplaySeconds', () => {
  it('borne entre 2 et 60, arrondit, 8 par défaut', () => {
    expect([1, 100, 7.6, Number.NaN, 8].map(clampDisplaySeconds)).toEqual([2, 60, 8, 8, 8])
  })
})

describe('isFullscreenState', () => {
  it('2, 3 et 4 = plein écran', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(isFullscreenState)).toEqual([
      false, true, true, true, false, false, false
    ])
  })
})

describe('runOnce', () => {
  it('n’exécute la fonction qu’une fois', () => {
    const fn = vi.fn()
    const once = runOnce(fn)
    once()
    once()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('buildSettingsPatch', () => {
  const prev = { ...DEFAULT_SETTINGS, email: 'Moi@Gmail.com', lastSeenUid: 100, uidValidity: '1' }
  const form = {
    email: ' moi@gmail.com ',
    displaySeconds: 100,
    launchAtStartup: false,
    googleClientId: ' id.apps.googleusercontent.com ',
    googleClientSecret: '',
    reminderMinutes: 500
  }

  it('même compte (casse et espaces ignorés) → garde la position', () => {
    expect(buildSettingsPatch(prev, form)).toEqual({
      email: 'moi@gmail.com',
      displaySeconds: 60,
      launchAtStartup: false,
      googleClientId: 'id.apps.googleusercontent.com',
      reminderMinutes: 120
    })
  })

  it('autre compte → remet la position à zéro (pas d’avalanche)', () => {
    expect(buildSettingsPatch(prev, { ...form, email: 'autre@gmail.com' })).toMatchObject({
      email: 'autre@gmail.com',
      lastSeenUid: null,
      uidValidity: null
    })
  })
})

describe('placeWidget', () => {
  const size = { width: 380, height: 420 }
  const primary = { x: 0, y: 0, width: 1920, height: 1040 }
  const second = { x: 1920, y: 0, width: 1280, height: 984 }

  it('sans position enregistrée → en haut au centre de l’écran principal', () => {
    expect(placeWidget(null, [primary], primary, size)).toEqual({ x: 770, y: 0 })
  })

  it('position visible → conservée', () => {
    expect(placeWidget({ x: 100, y: 200 }, [primary], primary, size)).toEqual({ x: 100, y: 200 })
  })

  it('trop bas ou trop à droite → remonté pour que les cartes restent visibles', () => {
    expect(placeWidget({ x: 1800, y: 900 }, [primary], primary, size)).toEqual({ x: 1540, y: 620 })
  })

  it('sur le second écran → reste sur le second écran', () => {
    expect(placeWidget({ x: 2500, y: 100 }, [primary, second], primary, size)).toEqual({ x: 2500, y: 100 })
  })

  it('à cheval sur deux écrans → rangé dans celui qui en contient le plus', () => {
    expect(placeWidget({ x: 1800, y: 100 }, [primary, second], primary, size)).toEqual({ x: 1920, y: 100 })
  })

  it('écran débranché → retour en haut au centre', () => {
    expect(placeWidget({ x: 2500, y: 100 }, [primary], primary, size)).toEqual({ x: 770, y: 0 })
  })
})

describe('isAllowedOpenLink', () => {
  it.each([
    'https://mail.google.com/mail/u/?authuser=a%40b.co#all/ff',
    'https://calendar.google.com/',
    'https://www.google.com/calendar/event?eid=abc'
  ])('accepte %s', (link) => expect(isAllowedOpenLink(link)).toBe(true))

  it.each(['https://www.google.com/search?q=x', 'http://calendar.google.com/', 'https://evil.com/calendar'])(
    'refuse %s',
    (link) => expect(isAllowedOpenLink(link)).toBe(false)
  )
})

describe('buildSettingsPatch — Google', () => {
  it('secret client vide → conservé ; rempli → remplacé (espaces retirés)', () => {
    const prev = { ...DEFAULT_SETTINGS, googleClientSecret: 'ancien' }
    const base = { email: 'a@b.co', displaySeconds: 8, launchAtStartup: true, googleClientId: 'id', reminderMinutes: 10 }
    expect(buildSettingsPatch(prev, { ...base, googleClientSecret: '' })).not.toHaveProperty('googleClientSecret')
    expect(buildSettingsPatch(prev, { ...base, googleClientSecret: ' nouveau ' })).toMatchObject({
      googleClientSecret: 'nouveau'
    })
  })
})

describe('googleClientPatch', () => {
  it('ne touche qu’à l’identifiant et au secret (jamais à l’email ni à la position du mail)', () => {
    expect(googleClientPatch({ clientId: ' id ', clientSecret: ' s ' })).toEqual({
      googleClientId: 'id',
      googleClientSecret: 's'
    })
    expect(googleClientPatch({ clientId: 'id', clientSecret: '' })).toEqual({ googleClientId: 'id' })
  })
})
