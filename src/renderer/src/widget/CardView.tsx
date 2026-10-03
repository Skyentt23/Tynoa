import { useEffect, useState, type Dispatch, type JSX } from 'react'
import { INBOX_LINK } from '../../../shared/api'
import type { Card, WidgetAction } from './widgetState'

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

interface Props {
  card: Card
  seconds: number
  dispatch: Dispatch<WidgetAction>
}

/** Carte qui se ferme seule après `seconds`, sauf tant que la souris est dessus. */
export function CardView({ card, seconds, dispatch }: Props): JSX.Element {
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (hovered) return
    const timer = setTimeout(() => dispatch({ type: 'dismiss', id: card.id }), seconds * 1000)
    return () => clearTimeout(timer)
  }, [hovered, seconds, card.id, dispatch])

  const dismiss = (): void => dispatch({ type: 'dismiss', id: card.id })
  const open = (): void => {
    window.tynoa.openMail(card.kind === 'mail' ? card.mail.gmailLink : INBOX_LINK)
    dismiss()
  }

  return (
    <div
      className="card"
      data-interactive
      role="button"
      tabIndex={-1}
      onClick={open}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {card.kind === 'mail' ? (
        <>
          <div className="card-head">
            <span className="from">{card.mail.from.name}</span>
            <span className="time">{timeFormat.format(new Date(card.mail.date))}</span>
          </div>
          <div className="subject">{card.mail.subject}</div>
        </>
      ) : (
        <div className="card-head">
          <span className="from">{card.count} nouveaux mails</span>
        </div>
      )}
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
