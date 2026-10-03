import { useEffect, useState, type FormEvent, type JSX } from 'react'
import type { GoogleConnectResult, SaveResult, TestResult } from '../../../shared/api'

type FailedTest = Extract<TestResult, { ok: false }>['reason']
type FailedSave = Extract<SaveResult, { ok: false }>['reason']
type FailedConnect = Extract<GoogleConnectResult, { ok: false }>['reason']

const TEST_ERRORS: Record<FailedTest, string> = {
  auth: "Gmail a refusé la connexion. Vérifier l'adresse et le mot de passe d'application.",
  network: 'Impossible de joindre Gmail. Vérifier la connexion Internet.',
  'missing-credentials': "Renseigner l'adresse et le mot de passe d'application."
}

const SAVE_ERRORS: Record<FailedSave, string> = {
  'invalid-email': 'Adresse e-mail invalide.',
  'no-encryption': "Le coffre de Windows est indisponible : le mot de passe n'a pas été enregistré."
}

const CONNECT_ERRORS: Record<FailedConnect, string> = {
  'not-configured': "Renseigner d'abord l'identifiant et le secret client Google.",
  'invalid-client': 'Google a refusé l’identifiant ou le secret client. Les vérifier dans Google Cloud.',
  cancelled: 'Connexion annulée ou délai dépassé (5 min).',
  network: 'Impossible de joindre Google. Vérifier la connexion Internet.'
}

type Message = { kind: 'ok' | 'error' | 'info'; text: string }

export function Settings(): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [displaySeconds, setDisplaySeconds] = useState(8)
  const [launchAtStartup, setLaunchAtStartup] = useState(true)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleClientSecret, setGoogleClientSecret] = useState('')
  const [hasGoogleSecret, setHasGoogleSecret] = useState(false)
  const [reminderMinutes, setReminderMinutes] = useState(10)
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)

  const load = (): void => {
    void window.tynoa.getSettings().then((s) => {
      setEmail(s.email)
      setHasPassword(s.hasPassword)
      setDisplaySeconds(s.displaySeconds)
      setLaunchAtStartup(s.launchAtStartup)
      setGoogleConnected(s.googleConnected)
      setGoogleClientId(s.googleClientId)
      setHasGoogleSecret(s.hasGoogleSecret)
      setReminderMinutes(s.reminderMinutes)
    })
  }
  useEffect(load, [])

  const input = (): Parameters<typeof window.tynoa.saveSettings>[0] => ({
    email,
    password,
    displaySeconds,
    launchAtStartup,
    googleClientId,
    googleClientSecret,
    reminderMinutes
  })

  /** Exécute une action en bloquant les boutons, même si elle échoue. */
  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    try {
      await action()
    } catch {
      setMessage({ kind: 'error', text: 'Une erreur inattendue est survenue.' })
    } finally {
      setBusy(false)
    }
  }

  const onTest = (): Promise<void> =>
    run(async () => {
      setMessage({ kind: 'info', text: 'Test en cours…' })
      const result = await window.tynoa.testConnection({ email, password })
      setMessage(
        result.ok ? { kind: 'ok', text: 'Connexion réussie ✔' } : { kind: 'error', text: TEST_ERRORS[result.reason] }
      )
    })

  const onSave = (e: FormEvent): Promise<void> => {
    e.preventDefault()
    return run(async () => {
      const result = await window.tynoa.saveSettings(input())
      if (!result.ok) {
        setMessage({ kind: 'error', text: SAVE_ERRORS[result.reason] })
        return
      }
      if (password) setHasPassword(true)
      if (googleClientSecret) setHasGoogleSecret(true)
      setPassword('')
      setGoogleClientSecret('')
      setMessage({ kind: 'ok', text: 'Enregistré. Tynoa se reconnecte…' })
    })
  }

  const onConnectGoogle = (): Promise<void> =>
    run(async () => {
      // L'identifiant et le secret doivent être enregistrés avant d'ouvrir la page Google.
      const saved = await window.tynoa.saveSettings({ ...input(), email: email || 'compte@gmail.com' })
      if (!saved.ok) {
        setMessage({ kind: 'error', text: SAVE_ERRORS[saved.reason] })
        return
      }
      setMessage({ kind: 'info', text: 'Une page Google s’est ouverte dans le navigateur : accepter l’accès, puis revenir ici.' })
      const result = await window.tynoa.connectGoogle()
      if (result.ok) {
        load()
        setMessage({ kind: 'ok', text: `Connecté à Google${result.email ? ` (${result.email})` : ''} ✔` })
      } else {
        setMessage({ kind: 'error', text: CONNECT_ERRORS[result.reason] })
      }
    })

  const onDisconnectGoogle = (): Promise<void> =>
    run(async () => {
      await window.tynoa.disconnectGoogle()
      setGoogleConnected(false)
      setMessage({ kind: 'info', text: 'Déconnecté de Google.' })
    })

  return (
    <form className="settings" onSubmit={(e) => void onSave(e)}>
      <h1>
        <span className="mascot" aria-hidden="true">
          ✦
        </span>{' '}
        Tynoa
      </h1>

      <section className="group">
        <h2>Compte Google (mail et agenda)</h2>
        {googleConnected ? (
          <>
            <p className="connected">✓ Connecté : {email}</p>
            <div className="actions start">
              <button type="button" disabled={busy} onClick={() => void onDisconnectGoogle()}>
                Se déconnecter
              </button>
            </div>
          </>
        ) : (
          <>
            <label>
              Identifiant client
              <input
                type="text"
                value={googleClientId}
                placeholder="xxxx.apps.googleusercontent.com"
                autoComplete="off"
                onChange={(e) => setGoogleClientId(e.target.value)}
              />
            </label>
            <label>
              Secret client
              <input
                type="password"
                value={googleClientSecret}
                placeholder={hasGoogleSecret ? 'Enregistré — laisser vide pour le garder' : 'GOCSPX-…'}
                autoComplete="off"
                onChange={(e) => setGoogleClientSecret(e.target.value)}
              />
              <small>
                À créer une seule fois dans Google Cloud : voir le guide pas à pas du README de Tynoa.
              </small>
            </label>
            <div className="actions start">
              <button type="button" className="primary" disabled={busy} onClick={() => void onConnectGoogle()}>
                Se connecter avec Google
              </button>
            </div>
          </>
        )}
        <label>
          Rappel avant un événement (minutes)
          <input
            type="number"
            min={1}
            max={120}
            value={reminderMinutes}
            onChange={(e) => setReminderMinutes(Number(e.target.value))}
          />
        </label>
      </section>

      <details className="group" open={!googleConnected}>
        <summary>Sans compte Google (secours : mot de passe d&apos;application)</summary>
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
          {hasPassword && (
            <small className="saved">
              ✓ Mot de passe enregistré dans le coffre Windows : rien à ressaisir. Le champ reste vide par
              sécurité ; ne le remplir que pour le changer.
            </small>
          )}
          <small>
            Il se crée sur{' '}
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
              la page des mots de passe d&apos;application
            </a>{' '}
            (validation en deux étapes requise).
          </small>
        </label>
        <div className="actions start">
          <button type="button" disabled={busy} onClick={() => void onTest()}>
            Tester la connexion
          </button>
        </div>
      </details>

      <section className="group">
        <h2>Affichage</h2>
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
      </section>

      <div className="actions">
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
