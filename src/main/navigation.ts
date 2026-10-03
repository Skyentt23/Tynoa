import type { WebContents } from 'electron'

/** Les fenêtres de Tynoa ne naviguent jamais ailleurs (fichier glissé dessus, lien cliqué). */
export function lockNavigation(contents: WebContents): void {
  contents.on('will-navigate', (event) => event.preventDefault())
}
