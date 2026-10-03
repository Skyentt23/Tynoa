import type {
  CalendarChange,
  CalendarEvent,
  GoogleStatus,
  MailReceived,
  MailStatus
} from '../../../shared/events'

export const MAX_VISIBLE_CARDS = 3
export const MAX_RECENT = 10

export type Card =
  | { id: string; kind: 'mail'; mail: MailReceived }
  | { id: string; kind: 'batch'; count: number }
  | { id: string; kind: 'reminder'; event: CalendarEvent; minutes: number }
  | { id: string; kind: 'summary'; events: CalendarEvent[] }
  | { id: string; kind: 'change'; change: CalendarChange }

export interface WidgetState {
  /** File d'attente des cartes : les plus anciennes s'affichent d'abord. */
  cards: Card[]
  /** Derniers mails de la session, le plus récent en premier. */
  recent: MailReceived[]
  /** Mails reçus depuis le dernier coup d'œil à la liste. */
  unseen: number
  status: MailStatus | null
  listOpen: boolean
  /** Prochain événement (dans l'heure), affiché dans la pastille. */
  next: CalendarEvent | null
  google: GoogleStatus | null
}

export const initialWidgetState: WidgetState = {
  cards: [],
  recent: [],
  unseen: 0,
  status: null,
  listOpen: false,
  next: null,
  google: null
}

/** Ajoute une carte, sauf pendant une pause ou si elle est déjà dans la pile. */
function pushCard(state: WidgetState, card: Card, silent: boolean): WidgetState {
  if (silent || state.cards.some((c) => c.id === card.id)) return state
  return { ...state, cards: [...state.cards, card] }
}

export type WidgetAction =
  | { type: 'mail'; mail: MailReceived; silent: boolean }
  | { type: 'batch'; count: number; silent: boolean; id: string }
  | { type: 'status'; status: MailStatus }
  | { type: 'dismiss'; id: string }
  | { type: 'toggleList' }
  | { type: 'reminder'; event: CalendarEvent; minutes: number; silent: boolean }
  | { type: 'summary'; events: CalendarEvent[]; silent: boolean; id: string }
  | { type: 'change'; change: CalendarChange; silent: boolean; id: string }
  | { type: 'next'; event: CalendarEvent | null }
  | { type: 'google'; status: GoogleStatus }

export function widgetReducer(state: WidgetState, action: WidgetAction): WidgetState {
  switch (action.type) {
    case 'mail': {
      if (state.recent.some((m) => m.uid === action.mail.uid)) return state
      const card: Card = { id: `mail-${action.mail.uid}`, kind: 'mail', mail: action.mail }
      return {
        ...state,
        recent: [action.mail, ...state.recent].slice(0, MAX_RECENT),
        cards: action.silent ? state.cards : [...state.cards, card],
        unseen: state.unseen + 1
      }
    }
    case 'batch': {
      const card: Card = { id: action.id, kind: 'batch', count: action.count }
      return {
        ...state,
        cards: action.silent ? state.cards : [...state.cards, card],
        unseen: state.unseen + action.count
      }
    }
    case 'status':
      return { ...state, status: action.status }
    case 'dismiss':
      return { ...state, cards: state.cards.filter((c) => c.id !== action.id) }
    case 'toggleList':
      return state.listOpen ? { ...state, listOpen: false } : { ...state, listOpen: true, unseen: 0 }
    case 'reminder': {
      const id = `reminder-${action.event.key}@${action.event.start}`
      return pushCard(state, { id, kind: 'reminder', event: action.event, minutes: action.minutes }, action.silent)
    }
    case 'summary':
      return pushCard(state, { id: action.id, kind: 'summary', events: action.events }, action.silent)
    case 'change':
      return pushCard(state, { id: action.id, kind: 'change', change: action.change }, action.silent)
    case 'next':
      return { ...state, next: action.event }
    case 'google':
      return { ...state, google: action.status }
  }
}

export function visibleCards(state: WidgetState): { shown: Card[]; overflow: number } {
  return {
    shown: state.cards.slice(0, MAX_VISIBLE_CARDS),
    overflow: Math.max(0, state.cards.length - MAX_VISIBLE_CARDS)
  }
}
