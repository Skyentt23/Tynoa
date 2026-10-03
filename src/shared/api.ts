import type { TynoaEventName, TynoaEvents } from './events'

export const CHANNELS = {
  event: 'tynoa:event',
  settingsChanged: 'tynoa:settings-changed',
  ready: 'widget:ready',
  interactive: 'widget:interactive',
  openMail: 'mail:open',
  openSettings: 'settings:open',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  testConnection: 'settings:test'
} as const

/** Événement du bus relayé au widget ; `silent` = pendant une pause (compter sans afficher de carte). */
export type RendererEvent = {
  [K in TynoaEventName]: { name: K; payload: TynoaEvents[K]; silent: boolean }
}[TynoaEventName]

export interface SettingsView {
  email: string
  displaySeconds: number
  launchAtStartup: boolean
  hasPassword: boolean
}

export interface SettingsInput {
  email: string
  /** Vide = garder le mot de passe enregistré. */
  password: string
  displaySeconds: number
  launchAtStartup: boolean
}

export type TestResult = { ok: true } | { ok: false; reason: 'auth' | 'network' | 'missing-credentials' }

export type SaveResult = { ok: true } | { ok: false; reason: 'invalid-email' | 'no-encryption' }

export interface TynoaApi {
  onEvent(cb: (event: RendererEvent) => void): () => void
  onSettingsChanged(cb: () => void): () => void
  ready(): void
  setInteractive(interactive: boolean): void
  openMail(link: string): void
  openSettings(): void
  getSettings(): Promise<SettingsView>
  saveSettings(input: SettingsInput): Promise<SaveResult>
  testConnection(input: { email: string; password: string }): Promise<TestResult>
}

export const INBOX_LINK = 'https://mail.google.com/mail/u/0/#inbox'
