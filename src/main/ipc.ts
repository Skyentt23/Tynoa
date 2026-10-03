import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import {
  CHANNELS,
  type RendererEvent,
  type SaveResult,
  type SettingsInput,
  type SettingsView,
  type TestResult
} from '../shared/api'
import type { TynoaEvents } from '../shared/events'
import type { EventBus } from './events/eventBus'
import { createImapSession } from './modules/mail/imapSession'
import type { MailWatcher } from './modules/mail/mailWatcher'
import { testConnection } from './modules/mail/testConnection'
import { isAllowedMailLink, isPaused, isValidEmail, normalizeAppPassword } from './policy'
import { EncryptionUnavailableError, type CredentialStore } from './security/credentials'
import { buildSettingsPatch } from './settingsPatch'
import type { SettingsStore } from './store/settings'

export interface IpcDeps {
  settings: SettingsStore
  credentials: CredentialStore
  watcher: MailWatcher
  bus: EventBus<TynoaEvents>
  widget: BrowserWindow
  openSettings: () => void
  onWidgetReady: () => void
}

export function registerIpc(d: IpcDeps): void {
  const toWidget = (channel: string, payload?: unknown): void => {
    if (!d.widget.isDestroyed()) d.widget.webContents.send(channel, payload)
  }
  const send = (event: RendererEvent): void => toWidget(CHANNELS.event, event)
  const silent = (): boolean => isPaused(Date.now(), d.settings.load().pausedUntil)

  d.bus.on('mail.received', (payload) => send({ name: 'mail.received', payload, silent: silent() }))
  d.bus.on('mail.batch', (payload) => send({ name: 'mail.batch', payload, silent: silent() }))
  d.bus.on('mail.status', (payload) => send({ name: 'mail.status', payload, silent: false }))

  ipcMain.on(CHANNELS.ready, () => d.onWidgetReady())

  ipcMain.on(CHANNELS.interactive, (_e, interactive: unknown) => {
    if (!d.widget.isDestroyed()) d.widget.setIgnoreMouseEvents(interactive !== true, { forward: true })
  })

  ipcMain.on(CHANNELS.openMail, (_e, link: unknown) => {
    if (typeof link === 'string' && isAllowedMailLink(link)) void shell.openExternal(link)
  })

  ipcMain.on(CHANNELS.openSettings, () => d.openSettings())

  ipcMain.handle(CHANNELS.getSettings, (): SettingsView => {
    const s = d.settings.load()
    return {
      email: s.email,
      displaySeconds: s.displaySeconds,
      launchAtStartup: s.launchAtStartup,
      hasPassword: d.credentials.has()
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
    toWidget(CHANNELS.settingsChanged)
    void d.watcher.reconnectNow()
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
}
