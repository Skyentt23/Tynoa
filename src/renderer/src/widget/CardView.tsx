import { useEffect, useState, type Dispatch, type JSX } from 'react'
import { CALENDAR_LINK, INBOX_LINK } from '../../../shared/api'
import type { CalendarChange, CalendarEvent } from '../../../shared/events'
import type { Card, WidgetAction } from './widgetState'

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

export const formatTime = (iso: string): string => timeFormat.format(new Date(iso))

const eventTime = (e: CalendarEvent): string => (e.allDay ? 'Journée' : formatTime(e.start))

interface Props {
  card: Card
  seconds: number
  dispatch: Dispatch<WidgetAction>
}

/** Durée d'affichage : un rappel reste jusqu'au début de l'événement, un résumé plus longtemps. */
function lifetimeMs(card: Card, seconds: number): number {
  if (card.kind === 'reminder') return Math.max(seconds * 1000, new Date(card.event.start).getTime() - Date.now())
  if (card.kind === 'summary') return seconds * 3000
  return seconds * 1000
}

function linkOf(card: Card): string {
  switch (card.kind) {
    case 'mail':
      return card.mail.gmailLink
    case 'batch':
      return INBOX_LINK
    case 'reminder':
      return card.event.link
    case 'change':
      return card.change.event.link
    case 'summary':
      return CALENDAR_LINK
  }
}

function ChangeText({ change }: { change: CalendarChange }): JSX.Element {
  const { event } = change
  if (change.kind === 'moved') {
    return (
      <>
        <div className="card-head">
          <span className="from">↪ Déplacé : {event.title}</span>
        </div>
        <div className="subject">
          {change.previousStart ? `${formatTime(change.previousStart)} → ` : ''}
          {eventTime(event)}
        </div>
      </>
    )
  }
  return (
    <>
      <div className="card-head">
        <span className="from">
          {change.kind === 'added' ? '＋ Ajouté' : '✕ Annulé'} : {event.title}
        </span>
      </div>
      <div className="subject">Aujourd&apos;hui · {eventTime(event)}</div>
    </>
  )
}

function CardBody({ card }: { card: Card }): JSX.Element {
  switch (card.kind) {
    case 'mail':
      return (
        <>
          <div className="card-head">
            <span className="from">{card.mail.from.name}</span>
            <span className="time">{formatTime(card.mail.date)}</span>
          </div>
          <div className="subject">{card.mail.subject}</div>
        </>
      )
    case 'batch':
      return (
        <div className="card-head">
          <span className="from">{card.count} nouveaux mails</span>
        </div>
      )
    case 'reminder':
      return (
        <>
          <div className="card-head">
            <span className="from">📅 {card.event.title}</span>
            <span className="time">{formatTime(card.event.start)}</span>
          </div>
          <div className="subject">Dans {card.minutes} min</div>
        </>
      )
    case 'summary':
      return (
        <>
          <div className="card-head">
            <span className="from">
              📅{' '}
              {card.events.length === 0
                ? 'Journée libre'
                : `Aujourd'hui : ${card.events.length} événement${card.events.length > 1 ? 's' : ''}`}
            </span>
          </div>
          {card.events.slice(0, 6).map((e) => (
            <div className="subject agenda-line" key={e.key}>
              <span className="agenda-time">{eventTime(e)}</span> {e.title}
            </div>
          ))}
          {card.events.length > 6 && <div className="subject">+ {card.events.length - 6} autres</div>}
        </>
      )
    case 'change':
      return <ChangeText change={card.change} />
  }
}

/** Carte qui se ferme seule (sauf tant que la souris est dessus) ; un clic ouvre Gmail ou Google Agenda. */
export function CardView({ card, seconds, dispatch }: Props): JSX.Element {
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (hovered) return
    const timer = setTimeout(() => dispatch({ type: 'dismiss', id: card.id }), lifetimeMs(card, seconds))
    return () => clearTimeout(timer)
  }, [hovered, seconds, card, dispatch])

  const dismiss = (): void => dispatch({ type: 'dismiss', id: card.id })
  const open = (): void => {
    window.tynoa.openMail(linkOf(card))
    dismiss()
  }

  return (
    <div
      className={`card card-${card.kind}`}
      data-interactive
      role="button"
      tabIndex={-1}
      onClick={open}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CardBody card={card} />
      <button
        type="button"
        className="close"
        aria-label="Fermer"
        onClick={(e) => {
          e.stopPropagation()
          dismiss()
        }}
      >
        ✕
      </button>
    </div>
  )
}
