import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CHANNELS, type RendererEvent, type TynoaApi } from '../shared/api'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: TynoaApi = {
  onEvent: (cb) => subscribe<RendererEvent>(CHANNELS.event, cb),
  onSettingsChanged: (cb) => subscribe<void>(CHANNELS.settingsChanged, () => cb()),
  ready: () => ipcRenderer.send(CHANNELS.ready),
  setInteractive: (interactive) => ipcRenderer.send(CHANNELS.interactive, interactive),
  startDrag: () => ipcRenderer.send(CHANNELS.dragStart),
  endDrag: () => ipcRenderer.send(CHANNELS.dragEnd),
  openMail: (link) => ipcRenderer.send(CHANNELS.openMail, link),
  openSettings: () => ipcRenderer.send(CHANNELS.openSettings),
  getSettings: () => ipcRenderer.invoke(CHANNELS.getSettings),
  saveSettings: (input) => ipcRenderer.invoke(CHANNELS.saveSettings, input),
  testConnection: (input) => ipcRenderer.invoke(CHANNELS.testConnection, input),
  saveGoogleClient: (input) => ipcRenderer.invoke(CHANNELS.saveGoogleClient, input),
  connectGoogle: () => ipcRenderer.invoke(CHANNELS.googleConnect),
  disconnectGoogle: () => ipcRenderer.invoke(CHANNELS.googleDisconnect)
}

contextBridge.exposeInMainWorld('tynoa', api)
