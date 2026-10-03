import { useEffect, useState, type FormEvent, type JSX } from 'react'
import type { SaveResult, TestResult } from '../../../shared/api'

type FailedTest = Extract<TestResult, { ok: false }>['reason']
type FailedSave = Extract<SaveResult, { ok: false }>['reason']

const TEST_ERRORS: Record<FailedTest, string> = {
  auth: "Gmail a refusé la connexion. Vérifier l'adresse et le mot de passe d'application.",
  network: 'Impossible de joindre Gmail. Vérifier la connexion Internet.',
  'missing-credentials': "Renseigner l'adresse et le mot de passe d'application."
}

const SAVE_ERRORS: Record<FailedSave, string> = {
  'invalid-email': 'Adresse e-mail invalide.',
  'no-encryption': "Le coffre de Windows est indisponible : le mot de passe n'a pas été enregistré."
}

type Message = { kind: 'ok' | 'error' | 'info'; text: string }

export function Settings(): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [displaySeconds, setDisplaySeconds] = useState(8)
  const [launchAtStartup, setLaunchAtStartup] = useState(true)
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.tynoa.getSettings().then((s) => {
      setEmail(s.email)
      setHasPassword(s.hasPassword)
      setDisplaySeconds(s.displaySeconds)
      setLaunchAtStartup(s.launchAtStartup)
    })
  }, [])

  async function onTest(): Promise<void> {
    setBusy(true)
    setMessage({ kind: 'info', text: 'Test en cours…' })
    const result = await window.tynoa.testConnection({ email, password })
    setBusy(false)
    setMessage(
      result.ok
        ? { kind: 'ok', text: 'Connexion réussie ✔' }
        : { kind: 'error', text: TEST_ERRORS[result.reason] }
    )
  }

  async function onSave(e: FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    const result = await window.tynoa.saveSettings({ email, password, displaySeconds, launchAtStartup })
    setBusy(false)
    if (!result.ok) {
      setMessage({ kind: 'error', text: SAVE_ERRORS[result.reason] })
      return
    }
    if (password) setHasPassword(true)
    setPassword('')
    setMessage({ kind: 'ok', text: 'Enregistré. Tynoa se reconnecte…' })
  }

  return (
    <form className="settings" onSubmit={(e) => void onSave(e)}>
      <h1>
        <span className="mascot" aria-hidden="true">
          ✦
        </span>{' '}
        Tynoa
      </h1>

      <label>
        Adresse Gmail
        <input
          type="email"
          value={email}
          placeholder="prenom.nom@gmail.com"
          autoComplete="off"
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label>
        Mot de passe d&apos;application
        <input
          type="password"
          value={password}
          placeholder={hasPassword ? 'Enregistré — laisser vide pour le garder' : 'abcd efgh ijkl mnop'}
          autoComplete="off"
          onChange={(e) => setPassword(e.target.value)}
        />
        <small>
          Ce n&apos;est pas le mot de passe Google habituel : il se crée sur{' '}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
            la page des mots de passe d&apos;application
          </a>{' '}
          (validation en deux étapes requise).
        </small>
      </label>

      <label>
        Durée d&apos;affichage des cartes (secondes)
        <input
          type="number"
          min={2}
          max={60}
          value={displaySeconds}
          onChange={(e) => setDisplaySeconds(Number(e.target.value))}
        />
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={launchAtStartup}
          onChange={(e) => setLaunchAtStartup(e.target.checked)}
        />
        Lancer Tynoa au démarrage de Windows
      </label>

      <div className="actions">
        <button type="button" disabled={busy} onClick={() => void onTest()}>
          Tester la connexion
        </button>
        <button type="submit" className="primary" disabled={busy}>
          Enregistrer
        </button>
      </div>

      {message && (
        <p className={`message ${message.kind}`} role="status">
          {message.text}
        </p>
      )}
    </form>
  )
}
