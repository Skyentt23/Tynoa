import { useEffect, useState, type FormEvent, type JSX } from 'react'
import type { SaveResult, TestResult } from '../../../shared/api'

type FailedTest = Extract<TestResult, { ok: false }>['reason']

const TEST_ERRORS: Record<FailedTest, string> = {
  auth: "Gmail a refusé la connexion. Vérifier l'adresse et le mot de passe d'application.",
  network: 'Impossible de joindre Gmail. Vérifier la connexion Internet.',
  'missing-credentials': "Renseigner l'adresse et le mot de passe d'application."
}

function saveError(result: Extract<SaveResult, { ok: false }>): string {
  switch (result.reason) {
    case 'invalid-email':
      return 'Adresse e-mail invalide.'
    case 'no-encryption':
      return "Le coffre de Windows est indisponible : rien n'a été enregistré."
    case 'invalid-calendar-url':
      return `Lien d'agenda invalide (ligne ${result.line}) : il doit commencer par https://`
  }
}

type Message = { kind: 'ok' | 'error' | 'info'; text: string }

export function Settings(): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [displaySeconds, setDisplaySeconds] = useState(8)
  const [launchAtStartup, setLaunchAtStartup] = useState(true)
  const [calendarCount, setCalendarCount] = useState(0)
  /** null = garder les liens enregistrés (jamais réaffichés, car secrets). */
  const [calendarUrls, setCalendarUrls] = useState<string | null>(null)
  const [reminderMinutes, setReminderMinutes] = useState(10)
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.tynoa.getSettings().then((s) => {
      setEmail(s.email)
      setHasPassword(s.hasPassword)
      setDisplaySeconds(s.displaySeconds)
      setLaunchAtStartup(s.launchAtStartup)
      setCalendarCount(s.calendarCount)
      // Aucun agenda : le champ (et le lien d'aide) est affiché d'emblée.
      if (s.calendarCount === 0) setCalendarUrls('')
      setReminderMinutes(s.reminderMinutes)
    })
  }, [])

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
      const result = await window.tynoa.saveSettings({
        email,
        password,
        displaySeconds,
        launchAtStartup,
        calendarUrls,
        reminderMinutes
      })
      if (!result.ok) {
        setMessage({ kind: 'error', text: saveError(result) })
        return
      }
      if (password) setHasPassword(true)
      setPassword('')
      if (calendarUrls !== null) {
        setCalendarCount(calendarUrls.split(/\r?\n/).filter((l) => l.trim()).length)
        setCalendarUrls(null)
      }
      setMessage({ kind: 'ok', text: 'Enregistré. Tynoa se reconnecte…' })
    })
  }

  return (
    <form className="settings" onSubmit={(e) => void onSave(e)}>
      <h1>
        <span className="mascot" aria-hidden="true">
          ✦
        </span>{' '}
        Tynoa
      </h1>

      <section className="group">
        <h2>Mail (Gmail)</h2>
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
      </section>

      <section className="group">
        <h2>Agenda</h2>
        {calendarUrls === null ? (
          <>
            <p className={calendarCount > 0 ? 'connected' : 'hint'}>
              {calendarCount > 0
                ? `✓ ${calendarCount} agenda${calendarCount > 1 ? 's' : ''} enregistré${calendarCount > 1 ? 's' : ''} (liens gardés secrets)`
                : 'Aucun agenda pour l’instant.'}
            </p>
            <div className="actions start">
              <button type="button" disabled={busy} onClick={() => setCalendarUrls('')}>
                {calendarCount > 0 ? 'Remplacer les liens' : 'Ajouter des agendas'}
              </button>
            </div>
          </>
        ) : (
          <label>
            Liens iCal secrets (un par ligne)
            <textarea
              rows={3}
              value={calendarUrls}
              placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCalendarUrls(e.target.value)}
            />
            <small>
              Ouvrir{' '}
              <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer">
                les paramètres de Google Agenda
              </a>
              , cliquer sur l&apos;agenda à gauche (sous « Paramètres de mes agendas ») →{' '}
              <strong>Adresse secrète au format iCal</strong> → copier. Laisser vide puis Enregistrer pour
              retirer tous les agendas.
            </small>
          </label>
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
