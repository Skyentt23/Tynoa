import { app, powerMonitor, safeStorage } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import type { TynoaEvents } from '../shared/events'
import { EventBus } from './events/eventBus'
import { registerIpc } from './ipc'
import { createImapSession } from './modules/mail/imapSession'
import { MailWatcher } from './modules/mail/mailWatcher'
import { FOREVER, isPaused, runOnce } from './policy'
import { CredentialStore } from './security/credentials'
import { SettingsStore } from './store/settings'
import { watchFullscreen } from './system/fullscreen'
import { createTray } from './tray'
import { createWidgetWindow, openSettingsWindow } from './windows'

// Données dans %APPDATA%\Tynoa, en développement comme une fois installé.
app.setName('Tynoa')
app.setPath('userData', join(app.getPath('appData'), 'Tynoa'))

// Gardé en référence : sinon le ramasse-miettes ferait disparaître l'icône.
const keepAlive: unknown[] = []

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => openSettingsWindow())
  // Application de zone de notification : fermer les fenêtres ne quitte pas Tynoa.
  app.on('window-all-closed', () => undefined)
  void app.whenReady().then(bootstrap)
}

function bootstrap(): void {
  electronApp.setAppUserModelId('fr.tynoa.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const dataDir = app.getPath('userData')
  log.transports.file.resolvePathFn = () => join(dataDir, 'logs', 'main.log')
  log.transports.file.maxSize = 1024 * 1024

  const settings = new SettingsStore(join(dataDir, 'settings.json'))
  const credentials = new CredentialStore(join(dataDir, 'credentials.bin'), safeStorage)
  const bus = new EventBus<TynoaEvents>((err) =>
    log.error('Erreur dans un abonné du bus :', err instanceof Error ? err.message : String(err))
  )
  const watcher = new MailWatcher({
    bus,
    settings,
    createSession: createImapSession,
    getCredentials: () => {
      const { email } = settings.load()
      const pass = credentials.load()
      return email && pass ? { user: email, pass } : null
    },
    log: (message) => log.warn(message)
  })

  const widget = createWidgetWindow()
  registerIpc({
    settings,
    credentials,
    watcher,
    bus,
    widget,
    openSettings: openSettingsWindow,
    // Démarrage au signal du widget : aucun mail rattrapé n'est émis avant qu'il écoute.
    onWidgetReady: runOnce(() => void watcher.start())
  })

  keepAlive.push(
    createTray({
      openSettings: openSettingsWindow,
      isPaused: () => isPaused(Date.now(), settings.load().pausedUntil),
      pause: (duration) =>
        settings.save({ pausedUntil: duration === 'forever' ? FOREVER : Date.now() + duration }),
      resume: () => settings.save({ pausedUntil: null }),
      quit: () => void watcher.stop().finally(() => app.quit())
    })
  )

  powerMonitor.on('resume', () => void watcher.reconnectNow())

  watchFullscreen((fullscreen) => {
    if (widget.isDestroyed()) return
    if (fullscreen) widget.hide()
    else widget.showInactive()
  })

  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.load().launchAtStartup })
  if (!settings.load().email || !credentials.has()) openSettingsWindow()
  log.info('Tynoa démarré')
}
