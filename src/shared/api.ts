import type { TynoaEventName, TynoaEvents } from './events'

export const CHANNELS = {
  event: 'tynoa:event',
  settingsChanged: 'tynoa:settings-changed',
  ready: 'widget:ready',
  interactive: 'widget:interactive',
  dragStart: 'widget:drag-start',
  dragEnd: 'widget:drag-end',
  openMail: 'mail:open',
  openSettings: 'settings:open',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  testConnection: 'settings:test',
  googleConnect: 'google:connect',
  googleDisconnect: 'google:disconnect',
  saveGoogleClient: 'google:save-client'
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
  googleConnected: boolean
  googleClientId: string
  hasGoogleSecret: boolean
  reminderMinutes: number
}

export interface SettingsInput {
  email: string
  /** Vide = garder le mot de passe enregistré. */
  password: string
  displaySeconds: number
  launchAtStartup: boolean
  googleClientId: string
  /** Vide = garder le secret enregistré. */
  googleClientSecret: string
  reminderMinutes: number
}

export type GoogleConnectResult =
  | { ok: true; email: string | null }
  | { ok: false; reason: 'not-configured' | 'invalid-client' | 'cancelled' | 'network' }

export type TestResult = { ok: true } | { ok: false; reason: 'auth' | 'network' | 'missing-credentials' }

export type SaveResult = { ok: true } | { ok: false; reason: 'invalid-email' | 'no-encryption' }

export interface TynoaApi {
  onEvent(cb: (event: RendererEvent) => void): () => void
  onSettingsChanged(cb: () => void): () => void
  ready(): void
  setInteractive(interactive: boolean): void
  startDrag(): void
  endDrag(): void
  openMail(link: string): void
  openSettings(): void
  getSettings(): Promise<SettingsView>
  saveSettings(input: SettingsInput): Promise<SaveResult>
  testConnection(input: { email: string; password: string }): Promise<TestResult>
  saveGoogleClient(input: { clientId: string; clientSecret: string }): Promise<void>
  connectGoogle(): Promise<GoogleConnectResult>
  disconnectGoogle(): Promise<void>
}

export const INBOX_LINK = 'https://mail.google.com/mail/u/0/#inbox'
export const CALENDAR_LINK = 'https://calendar.google.com/'
