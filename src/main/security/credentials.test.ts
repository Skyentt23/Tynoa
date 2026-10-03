import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CredentialStore, EncryptionUnavailableError, type Cipher } from './credentials'

const xor = (b: Uint8Array): Buffer => Buffer.from(b.map((x) => x ^ 0x5a))

function fakeCipher(available = true): Cipher {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => xor(Buffer.from(plain, 'utf8')),
    decryptString: (encrypted) => xor(encrypted).toString('utf8')
  }
}

let file: string

beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), 'tynoa-cred-')), 'sub', 'credentials.bin')
})

describe('CredentialStore', () => {
  it('aller-retour chiffré', () => {
    const store = new CredentialStore(file, fakeCipher())
    store.save('motdepasse123')
    expect(new CredentialStore(file, fakeCipher()).load()).toBe('motdepasse123')
  })

  it("n'écrit jamais le mot de passe en clair", () => {
    new CredentialStore(file, fakeCipher()).save('motdepasse123')
    expect(readFileSync(file).toString('utf8')).not.toContain('motdepasse123')
  })

  it('has() et clear()', () => {
    const store = new CredentialStore(file, fakeCipher())
    expect(store.has()).toBe(false)
    store.save('x')
    expect(store.has()).toBe(true)
    store.clear()
    expect(store.has()).toBe(false)
    expect(store.load()).toBeNull()
  })

  it("refuse d'enregistrer si le chiffrement est indisponible", () => {
    const store = new CredentialStore(file, fakeCipher(false))
    expect(() => store.save('x')).toThrow(EncryptionUnavailableError)
    expect(existsSync(file)).toBe(false)
  })

  it('fichier illisible → null', () => {
    const store = new CredentialStore(file, {
      ...fakeCipher(),
      decryptString: () => {
        throw new Error('corrompu')
      }
    })
    store.save('x')
    writeFileSync(file, 'nimportequoi')
    expect(store.load()).toBeNull()
  })
})
