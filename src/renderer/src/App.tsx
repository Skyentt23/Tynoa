import type { JSX } from 'react'
import { Widget } from './widget/Widget'

export default function App(): JSX.Element {
  const view = window.location.hash === '#settings' ? 'settings' : 'widget'
  document.body.dataset.view = view
  // La fenêtre Paramètres est construite à la tâche 10.
  return view === 'settings' ? <main className="settings">Paramètres</main> : <Widget />
}
