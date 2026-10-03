import type { MailReceived, MailStatus } from '../../../shared/events'

export const MAX_VISIBLE_CARDS = 3
export const MAX_RECENT = 10

export type Card =
  | { id: string; kind: 'mail'; mail: MailReceived }
  | { id: string; kind: 'batch'; count: number }

export interface WidgetState {
  /** File d'attente des cartes : les plus anciennes s'affichent d'abord. */
  cards: Card[]
  /** Derniers mails de la session, le plus récent en premier. */
  recent: MailReceived[]
  /** Mails reçus depuis le dernier coup d'œil à la liste. */
  unseen: number
  status: MailStatus | null
  listOpen: boolean
}

export const initialWidgetState: WidgetState = {
  cards: [],
  recent: [],
  unseen: 0,
  status: null,
  listOpen: false
}

export type WidgetAction =
  | { type: 'mail'; mail: MailReceived; silent: boolean }
  | { type: 'batch'; count: number; silent: boolean; id: string }
  | { type: 'status'; status: MailStatus }
  | { type: 'dismiss'; id: string }
  | { type: 'toggleList' }

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
  }
}

export function visibleCards(state: WidgetState): { shown: Card[]; overflow: number } {
  return {
    shown: state.cards.slice(0, MAX_VISIBLE_CARDS),
    overflow: Math.max(0, state.cards.length - MAX_VISIBLE_CARDS)
  }
}
