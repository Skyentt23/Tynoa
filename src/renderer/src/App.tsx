import type { JSX } from 'react'
import { Settings } from './settings/Settings'
import { Widget } from './widget/Widget'

export default function App(): JSX.Element {
  const view = window.location.hash === '#settings' ? 'settings' : 'widget'
  document.body.dataset.view = view
  return view === 'settings' ? <Settings /> : <Widget />
}
