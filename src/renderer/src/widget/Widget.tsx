import { useEffect, useReducer, useState, type JSX } from 'react'
import type { MailStatusReason } from '../../../shared/events'
import { CardView, formatTime } from './CardView'
import { initialWidgetState, visibleCards, widgetReducer } from './widgetState'

const ERROR_TEXT: Record<MailStatusReason, string> = {
  auth: 'Connexion Gmail refusée — vérifier les paramètres',
  'missing-credentials': 'Compte Gmail à configurer — ouvrir les paramètres',
  network: 'Connexion à Gmail impossible'
}

let nextCardId = 0
const cardId = (prefix: string): string => `${prefix}-${++nextCardId}`

/**
 * La fenêtre laisse passer les clics, sauf au-dessus des éléments `data-interactive`.
 * Le survol est suivi au `mousemove` (relayé même quand les clics traversent).
 */
function useClickThrough(): void {
  useEffect(() => {
    let interactive = false
    const update = (next: boolean): void => {
      if (next === interactive) return
      interactive = next
      window.tynoa.setInteractive(next)
    }
    const onMove = (e: MouseEvent): void =>
      update(e.target instanceof Element && e.target.closest('[data-interactive]') !== null)
    const onLeave = (): void => update(false)
    document.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [])
}

export function Widget(): JSX.Element {
  const [state, dispatch] = useReducer(widgetReducer, initialWidgetState)
  const [displaySeconds, setDisplaySeconds] = useState(8)
  useClickThrough()

  useEffect(() => {
    const loadSettings = (): void => {
      void window.tynoa.getSettings().then((s) => setDisplaySeconds(s.displaySeconds))
    }
    loadSettings()
    const offSettings = window.tynoa.onSettingsChanged(loadSettings)
    const offEvents = window.tynoa.onEvent((event) => {
      switch (event.name) {
        case 'mail.received':
          dispatch({ type: 'mail', mail: event.payload, silent: event.silent })
          break
        case 'mail.batch':
          dispatch({
            type: 'batch',
            count: event.payload.count,
            silent: event.silent,
            id: cardId('batch')
          })
          break
        case 'mail.status':
          dispatch({ type: 'status', status: event.payload })
          break
        case 'calendar.reminder':
          dispatch({ type: 'reminder', ...event.payload, silent: event.silent })
          break
        case 'calendar.summary':
          dispatch({ type: 'summary', events: event.payload.events, silent: event.silent, id: cardId('summary') })
          break
        case 'calendar.changed':
          dispatch({ type: 'change', change: event.payload, silent: event.silent, id: cardId('change') })
          break
        case 'calendar.next':
          dispatch({ type: 'next', event: event.payload.event })
          break
        case 'calendar.status':
          dispatch({ type: 'calendarStatus', status: event.payload })
          break
      }
    })
    // Abonné : le process principal peut démarrer la surveillance sans perdre d'événements.
    window.tynoa.ready()
    return () => {
      offEvents()
      offSettings()
    }
  }, [])

  const { shown, overflow } = visibleCards(state)
  const status = state.status
  const calendarError =
    state.calendarStatus?.state === 'error' ? 'Lien d’agenda invalide — vérifier les paramètres' : undefined
  const errorText = (status?.state === 'error' ? ERROR_TEXT[status.reason ?? 'network'] : undefined) ?? calendarError
  const hasError = errorText !== undefined
  const label = state.next ? `${formatTime(state.next.start)} ${state.next.title}` : 'Tynoa'

  return (
    <div className="widget">
      <button
        type="button"
        data-interactive
        className={`pill${state.unseen > 0 ? ' has-news' : ''}`}
        title={hasError ? 'Ouvrir les paramètres' : 'Derniers mails'}
        onClick={() => (hasError ? window.tynoa.openSettings() : dispatch({ type: 'toggleList' }))}
      >
        {/* Poignée : le process principal fait suivre la souris au widget tant que le bouton est enfoncé. */}
        <span
          className="handle"
          title="Déplacer"
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            window.tynoa.startDrag()
          }}
          onPointerUp={() => window.tynoa.endDrag()}
          onLostPointerCapture={() => window.tynoa.endDrag()}
          onClick={(e) => e.stopPropagation()}
        >
          ⋮⋮
        </span>
        <span
          key={state.unseen}
          className={`mascot${state.unseen > 0 ? ' bounce' : ''}`}
          aria-hidden="true"
        >
          ✦
        </span>
        <span className={`count${state.next ? ' next' : ''}`} title={label}>
          {label}
        </span>
        {state.unseen > 0 && <span className="badge">{state.unseen}</span>}
        <span className={`dot dot-${hasError ? 'error' : (status?.state ?? 'reconnecting')}`} />
      </button>

      {hasError && (
        <button
          type="button"
          data-interactive
          className="card error"
          onClick={() => window.tynoa.openSettings()}
        >
          {errorText}
        </button>
      )}

      {state.listOpen ? (
        <div className="list" data-interactive>
          {state.recent.length === 0 ? (
            <p className="empty">Aucun mail reçu depuis le lancement</p>
          ) : (
            state.recent.map((mail) => (
              <button
                type="button"
                key={mail.uid}
                className="list-item"
                onClick={() => window.tynoa.openMail(mail.gmailLink)}
              >
                <span className="from">{mail.from.name}</span>
                <span className="subject">{mail.subject}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          {shown.map((card) => (
            <CardView key={card.id} card={card} seconds={displaySeconds} dispatch={dispatch} />
          ))}
          {overflow > 0 && (
            <div className="more">
              + {overflow} autre{overflow > 1 ? 's' : ''}
            </div>
          )}
        </>
      )}
    </div>
  )
}
