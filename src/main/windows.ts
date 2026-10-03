import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { isAllowedHelpLink } from './policy'

const WIDGET_WIDTH = 380
const WIDGET_HEIGHT = 420

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

/** Widget : sans cadre, transparent, au-dessus de tout, centré en haut, clics traversants. */
export function createWidgetWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    x: Math.round(workArea.x + (workArea.width - WIDGET_WIDTH) / 2),
    y: workArea.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
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
    height: 560,
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
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    settingsWindow = null
  })
  loadRenderer(win, 'settings')
  settingsWindow = win
}
