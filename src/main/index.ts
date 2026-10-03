import { app, powerMonitor, safeStorage, screen, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import type { TynoaEvents } from '../shared/events'
import { EventBus } from './events/eventBus'
import { GoogleAccount } from './google/googleAccount'
import { registerIpc } from './ipc'
import { fetchEvents } from './modules/calendar/calendarApi'
import { CalendarWatcher } from './modules/calendar/calendarWatcher'
import { createImapSession } from './modules/mail/imapSession'
import { MailWatcher } from './modules/mail/mailWatcher'
import { FOREVER, isPaused, runOnce } from './policy'
import { CredentialStore } from './security/credentials'
import { buildSettingsPatch, formOf } from './settingsPatch'
import { SettingsStore } from './store/settings'
import { watchFullscreen } from './system/fullscreen'
import { createTray } from './tray'
import { createWidgetDrag } from './widgetDrag'
import { createWidgetWindow, openSettingsWindow, widgetPosition } from './windows'

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
  const google = new GoogleAccount({
    getClient: () => {
      const { googleClientId, googleClientSecret } = settings.load()
      return googleClientId && googleClientSecret
        ? { clientId: googleClientId, clientSecret: googleClientSecret }
        : null
    },
    tokenStore: new CredentialStore(join(dataDir, 'google-token.bin'), safeStorage),
    fetchFn: fetch,
    openBrowser: (url) => void shell.openExternal(url),
    onStatus: (status) => {
      if (status.state === 'error') log.warn(`Google : ${status.reason}`)
      bus.emit('google.status', status)
    },
    // Le compte Google devient le compte surveillé ; changement de compte → pas d'avalanche.
    onConnected: (email) => {
      if (email) settings.save(buildSettingsPatch(settings.load(), { ...formOf(settings.load()), email }))
    }
  })

  const watcher = new MailWatcher({
    bus,
    settings,
    createSession: createImapSession,
    getCredentials: async () => {
      const { email } = settings.load()
      if (!email) return null
      // Compte Google en priorité ; le mot de passe d'application reste un secours.
      if (google.isConnected()) {
        const accessToken = await google.getAccessToken()
        if (accessToken) return { user: email, accessToken }
      }
      const pass = credentials.load()
      return pass ? { user: email, pass } : null
    },
    log: (message) => log.warn(message)
  })

  const calendar = new CalendarWatcher({
    bus,
    settings,
    getAccessToken: () => google.getAccessToken(),
    fetchEvents: (accessToken, range) => fetchEvents(accessToken, range, fetch),
    log: (message) => log.warn(message)
  })

  const savedPosition = (): { x: number; y: number } | null => {
    const { widgetX, widgetY } = settings.load()
    return widgetX === null || widgetY === null ? null : { x: widgetX, y: widgetY }
  }
  const widget = createWidgetWindow(widgetPosition(savedPosition()))
  const moveWidget = (position: { x: number; y: number }): void => {
    if (!widget.isDestroyed()) widget.setPosition(position.x, position.y)
  }
  const drag = createWidgetDrag({
    getCursor: () => screen.getCursorScreenPoint(),
    getPosition: () => {
      const [x, y] = widget.getPosition()
      return { x, y }
    },
    setPosition: moveWidget,
    // Fin du glissement : on garde le widget entièrement visible, puis on mémorise.
    onEnd: (position) => {
      const placed = widgetPosition(position)
      moveWidget(placed)
      settings.save({ widgetX: placed.x, widgetY: placed.y })
    }
  })
  // Écran débranché ou résolution changée : le widget revient dans une zone visible.
  const replace = (): void => moveWidget(widgetPosition(savedPosition()))
  screen.on('display-removed', replace)
  screen.on('display-metrics-changed', replace)
  registerIpc({
    settings,
    credentials,
    watcher,
    calendar,
    google,
    bus,
    widget,
    openSettings: openSettingsWindow,
    // Démarrage au signal du widget : aucun événement n'est émis avant qu'il écoute.
    onWidgetReady: runOnce(() => {
      if (google.isConnected()) bus.emit('google.status', { state: 'connected' })
      void watcher.start()
      void calendar.start()
    }),
    onDragStart: drag.start,
    onDragEnd: drag.end
  })

  keepAlive.push(
    createTray({
      openSettings: openSettingsWindow,
      isPaused: () => isPaused(Date.now(), settings.load().pausedUntil),
      pause: (duration) =>
        settings.save({ pausedUntil: duration === 'forever' ? FOREVER : Date.now() + duration }),
      resume: () => settings.save({ pausedUntil: null }),
      resetWidget: () => {
        settings.save({ widgetX: null, widgetY: null })
        replace()
      },
      quit: () => {
        calendar.stop()
        void watcher.stop().finally(() => app.quit())
      }
    })
  )

  powerMonitor.on('resume', () => {
    void watcher.reconnectNow()
    void calendar.refreshNow()
  })

  watchFullscreen((fullscreen) => {
    if (widget.isDestroyed()) return
    if (fullscreen) widget.hide()
    else widget.showInactive()
  })

  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.load().launchAtStartup })
  if (!settings.load().email || !credentials.has()) openSettingsWindow()
  log.info('Tynoa démarré')
}
