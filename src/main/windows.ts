import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { lockNavigation } from './navigation'
import { isAllowedHelpLink, placeWidget } from './policy'

export const WIDGET_SIZE = { width: 380, height: 420 }

const webPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: false,
  contextIsolation: true,
  nodeIntegration: false
}

function loadRenderer(win: BrowserWindow, view: 'widget' | 'settings'): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${view}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: view })
  }
}

/** Position du widget, ramenée dans un écran existant (voir `placeWidget`). */
export function widgetPosition(saved: { x: number; y: number } | null): { x: number; y: number } {
  return placeWidget(
    saved,
    screen.getAllDisplays().map((d) => d.workArea),
    screen.getPrimaryDisplay().workArea,
    WIDGET_SIZE
  )
}

/** Widget : sans cadre, transparent, au-dessus de tout, clics traversants, déplaçable par sa poignée. */
export function createWidgetWindow(position: { x: number; y: number }): BrowserWindow {
  const win = new BrowserWindow({
    ...WIDGET_SIZE,
    ...position,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  lockNavigation(win.webContents)
  win.once('ready-to-show', () => win.showInactive())
  loadRenderer(win, 'widget')
  return win
}

let settingsWindow: BrowserWindow | null = null

export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: 460,
    height: 740,
    title: 'Tynoa — Paramètres',
    resizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedHelpLink(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  lockNavigation(win.webContents)
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    settingsWindow = null
  })
  loadRenderer(win, 'settings')
  settingsWindow = win
}
