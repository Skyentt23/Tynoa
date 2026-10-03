import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Sous-ensemble de `safeStorage` (Electron) utilisé ici. */
export interface Cipher {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

export class EncryptionUnavailableError extends Error {
  constructor() {
    super('Le chiffrement Windows (safeStorage) est indisponible.')
    this.name = 'EncryptionUnavailableError'
  }
}

/** Mot de passe chiffré par le coffre Windows ; jamais écrit en clair. */
export class CredentialStore {
  constructor(
    private readonly filePath: string,
    private readonly cipher: Cipher
  ) {}

  save(password: string): void {
    if (!this.cipher.isEncryptionAvailable()) throw new EncryptionUnavailableError()
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, this.cipher.encryptString(password))
  }

  load(): string | null {
    if (!existsSync(this.filePath) || !this.cipher.isEncryptionAvailable()) return null
    try {
      return this.cipher.decryptString(readFileSync(this.filePath))
    } catch {
      return null
    }
  }

  has(): boolean {
    return existsSync(this.filePath)
  }

  clear(): void {
    rmSync(this.filePath, { force: true })
  }
}
