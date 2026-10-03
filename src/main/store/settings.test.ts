import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_SETTINGS, SettingsStore } from './settings'

let file: string

beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), 'tynoa-settings-')), 'sub', 'settings.json')
})

describe('SettingsStore', () => {
  it('renvoie les valeurs par défaut si le fichier est absent', () => {
    expect(new SettingsStore(file).load()).toEqual(DEFAULT_SETTINGS)
  })

  it('save fusionne le patch, crée le dossier et persiste', () => {
    new SettingsStore(file).save({ email: 'a@b.co', lastSeenUid: 12 })
    expect(new SettingsStore(file).load()).toEqual({ ...DEFAULT_SETTINGS, email: 'a@b.co', lastSeenUid: 12 })
  })

  it('JSON corrompu → valeurs par défaut', () => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '{oups', 'utf8')
    expect(new SettingsStore(file).load()).toEqual(DEFAULT_SETTINGS)
  })

  it('remplace champ par champ les valeurs de mauvais type', () => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      JSON.stringify({ email: 42, displaySeconds: 500, launchAtStartup: false, lastSeenUid: 12, uidValidity: '9', pausedUntil: 'x' }),
      'utf8'
    )
    expect(new SettingsStore(file).load()).toEqual({
      ...DEFAULT_SETTINGS,
      launchAtStartup: false,
      lastSeenUid: 12,
      uidValidity: '9'
    })
  })

  it('ne laisse pas de fichier temporaire', () => {
    new SettingsStore(file).save({ email: 'a@b.co' })
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })
})
