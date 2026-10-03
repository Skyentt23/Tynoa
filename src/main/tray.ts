import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron'
import icon from '../../resources/icon.png?asset'

export interface TrayActions {
  openSettings(): void
  isPaused(): boolean
  pause(duration: number | 'forever'): void
  resume(): void
  quit(): void
}

export function createTray(actions: TrayActions): Tray {
  const tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('Tynoa')

  const refresh = (): void => {
    const pauseItems: MenuItemConstructorOptions[] = actions.isPaused()
      ? [{ label: 'Reprendre les notifications', click: () => run(actions.resume) }]
      : [
          { label: 'Pause 1 h', click: () => run(() => actions.pause(60 * 60 * 1000)) },
          { label: "Pause jusqu'à réactivation", click: () => run(() => actions.pause('forever')) }
        ]
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Paramètres…', click: () => actions.openSettings() },
        { type: 'separator' },
        ...pauseItems,
        { type: 'separator' },
        { label: 'Quitter Tynoa', click: () => actions.quit() }
      ])
    )
  }
  const run = (action: () => void): void => {
    action()
    refresh()
  }

  refresh()
  // Une pause d'une heure expire toute seule : le menu doit suivre.
  setInterval(refresh, 60_000)
  tray.on('click', () => actions.openSettings())
  return tray
}
