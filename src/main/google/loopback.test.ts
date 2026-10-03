import { describe, it, expect } from 'vitest'
import { waitForAuthCode } from './loopback'

describe('waitForAuthCode', () => {
  it('écoute sur 127.0.0.1 et renvoie le code quand state correspond', async () => {
    const { redirectUri, code } = await waitForAuthCode({ state: 'st', timeoutMs: 5_000 })
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const res = await fetch(`${redirectUri}/?code=abc&state=st`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('fermer cet onglet')
    expect(await code).toBe('abc')
  })

  it('state différent → rejet', async () => {
    const { redirectUri, code } = await waitForAuthCode({ state: 'st', timeoutMs: 5_000 })
    const settled = code.catch((err: Error) => err)
    await fetch(`${redirectUri}/?code=abc&state=autre`)
    expect(await settled).toBeInstanceOf(Error)
  })

  it('refus de l’utilisateur (error=access_denied) → rejet', async () => {
    const { redirectUri, code } = await waitForAuthCode({ state: 'st', timeoutMs: 5_000 })
    const settled = code.catch((err: Error) => err.message)
    await fetch(`${redirectUri}/?error=access_denied&state=st`)
    expect(await settled).toContain('access_denied')
  })

  it('délai dépassé → rejet', async () => {
    const { code } = await waitForAuthCode({ state: 'st', timeoutMs: 50 })
    await expect(code).rejects.toThrow(/délai/i)
  })

  it('ignore les requêtes parasites (favicon) sans conclure', async () => {
    const { redirectUri, code } = await waitForAuthCode({ state: 'st', timeoutMs: 5_000 })
    const fav = await fetch(`${redirectUri}/favicon.ico`)
    expect(fav.status).toBe(404)
    await fetch(`${redirectUri}/?code=xyz&state=st`)
    expect(await code).toBe('xyz')
  })
})
