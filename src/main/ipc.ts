import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import {
  CHANNELS,
  type GoogleConnectResult,
  type RendererEvent,
  type SaveResult,
  type SettingsInput,
  type SettingsView,
  type TestResult
} from '../shared/api'
import type { TynoaEventName, TynoaEvents } from '../shared/events'
import type { EventBus } from './events/eventBus'
import type { GoogleAccount } from './google/googleAccount'
import type { CalendarWatcher } from './modules/calendar/calendarWatcher'
import { createImapSession } from './modules/mail/imapSession'
import type { MailWatcher } from './modules/mail/mailWatcher'
import { testConnection } from './modules/mail/testConnection'
import { isAllowedOpenLink, isPaused, isValidEmail, normalizeAppPassword } from './policy'
import { EncryptionUnavailableError, type CredentialStore } from './security/credentials'
import { buildSettingsPatch, googleClientPatch } from './settingsPatch'
import type { SettingsStore } from './store/settings'

export interface IpcDeps {
  settings: SettingsStore
  credentials: CredentialStore
  watcher: MailWatcher
  calendar: CalendarWatcher
  google: GoogleAccount
  bus: EventBus<TynoaEvents>
  widget: BrowserWindow
  openSettings: () => void
  onWidgetReady: () => void
  onDragStart: () => void
  onDragEnd: () => void
}

/** Pendant une pause, les cartes sont en sourdine ; la pastille et les statuts restent affichés. */
const PAUSABLE: ReadonlySet<TynoaEventName> = new Set<TynoaEventName>([
  'mail.received',
  'mail.batch',
  'calendar.reminder',
  'calendar.summary',
  'calendar.changed'
])

const RELAYED: TynoaEventName[] = [
  'mail.received',
  'mail.batch',
  'mail.status',
  'calendar.reminder',
  'calendar.next',
  'calendar.summary',
  'calendar.changed',
  'google.status'
]

export function registerIpc(d: IpcDeps): void {
  const toWidget = (channel: string, payload?: unknown): void => {
    if (!d.widget.isDestroyed()) d.widget.webContents.send(channel, payload)
  }
  const paused = (): boolean => isPaused(Date.now(), d.settings.load().pausedUntil)

  for (const name of RELAYED) {
    d.bus.on(name, (payload) =>
      toWidget(CHANNELS.event, {
        name,
        payload,
        silent: PAUSABLE.has(name) && paused()
      } as RendererEvent)
    )
  }

  /** Après un changement de compte : nouvelle connexion du mail et relecture de l'agenda. */
  const reconnectAll = (): void => {
    toWidget(CHANNELS.settingsChanged)
    void d.watcher.reconnectNow()
    void d.calendar.refreshNow()
  }

  ipcMain.on(CHANNELS.ready, () => d.onWidgetReady())
  ipcMain.on(CHANNELS.dragStart, () => d.onDragStart())
  ipcMain.on(CHANNELS.dragEnd, () => d.onDragEnd())

  ipcMain.on(CHANNELS.interactive, (_e, interactive: unknown) => {
    if (!d.widget.isDestroyed()) d.widget.setIgnoreMouseEvents(interactive !== true, { forward: true })
  })

  ipcMain.on(CHANNELS.openMail, (_e, link: unknown) => {
    if (typeof link === 'string' && isAllowedOpenLink(link)) void shell.openExternal(link)
  })

  ipcMain.on(CHANNELS.openSettings, () => d.openSettings())

  ipcMain.handle(CHANNELS.getSettings, (): SettingsView => {
    const s = d.settings.load()
    return {
      email: s.email,
      displaySeconds: s.displaySeconds,
      launchAtStartup: s.launchAtStartup,
      hasPassword: d.credentials.has(),
      googleConnected: d.google.isConnected(),
      googleClientId: s.googleClientId,
      hasGoogleSecret: s.googleClientSecret !== '',
      reminderMinutes: s.reminderMinutes
    }
  })

  ipcMain.handle(CHANNELS.saveSettings, (_e, input: SettingsInput): SaveResult => {
    if (!isValidEmail(input.email.trim())) return { ok: false, reason: 'invalid-email' }
    const password = normalizeAppPassword(input.password)
    if (password) {
      try {
        d.credentials.save(password)
      } catch (err) {
        if (err instanceof EncryptionUnavailableError) return { ok: false, reason: 'no-encryption' }
        throw err
      }
    }
    const saved = d.settings.save(buildSettingsPatch(d.settings.load(), input))
    // En développement, ce serait electron.exe qui serait inscrit au démarrage de Windows.
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: saved.launchAtStartup })
    reconnectAll()
    return { ok: true }
  })

  ipcMain.handle(
    CHANNELS.testConnection,
    (_e, input: { email: string; password: string }): TestResult | Promise<TestResult> => {
      const email = input.email.trim()
      const pass = normalizeAppPassword(input.password) || d.credentials.load()
      if (!isValidEmail(email) || !pass) return { ok: false, reason: 'missing-credentials' }
      return testConnection(createImapSession, { user: email, pass })
    }
  )

  ipcMain.handle(CHANNELS.saveGoogleClient, (_e, input: { clientId: string; clientSecret: string }): void => {
    d.settings.save(googleClientPatch(input))
  })

  ipcMain.handle(CHANNELS.googleConnect, async (): Promise<GoogleConnectResult> => {
    const result = await d.google.connect()
    if (result.ok) {
      // Peut-être un autre compte : l'agenda repart d'une référence neuve (aucun faux changement).
      d.calendar.reset()
      reconnectAll()
    }
    return result
  })

  ipcMain.handle(CHANNELS.googleDisconnect, (): void => {
    d.google.disconnect()
    d.calendar.reset()
    reconnectAll()
  })
}
