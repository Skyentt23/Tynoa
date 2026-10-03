/** Les liens iCal secrets donnent accès à l'agenda : ils sont rangés chiffrés (CredentialStore). */
export interface SecretStore {
  load(): string | null
  save(value: string): void
  clear(): void
}

export function readCalendarUrls(store: Pick<SecretStore, 'load'>): string[] {
  try {
    const parsed: unknown = JSON.parse(store.load() ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : []
  } catch {
    return []
  }
}

export function writeCalendarUrls(store: SecretStore, urls: string[]): void {
  if (urls.length === 0) store.clear()
  else store.save(JSON.stringify(urls))
}
