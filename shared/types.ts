export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
export type Rank = (typeof RANKS)[number]

export const SUITS = ['S', 'H', 'D', 'C'] as const
export type Suit = (typeof SUITS)[number]

export interface Card {
  rank: Rank
  suit: Suit
}

export type Gender = 'boy' | 'girl'

export interface Player {
  id: string
  name: string
  gender: Gender
  connected: boolean
}

export type MasterKey = 'floor' | 'heaven' | 'thumb' | 'question'

/** Someone who has to drink. `viaMateOf` is set when they're only drinking because a mate is. */
export interface Drinker {
  id: string
  viaMateOf?: string
}

export interface Draw {
  card: Card
  slot: number
  playerId: string
  ruleId: string
  /** True while the drawer still has to pick someone / write a rule before they can finish. */
  awaitingChoice: boolean
  /** Who was picked, for rules where the drawer chooses a player. */
  targetId?: string
  /** The rule text written for a "make a rule" card. */
  ruleText?: string
  drinkers: Drinker[]
  /** For King's Cup: which cup card this was (1-based), and whether it's the last one. */
  cupNumber?: number
  finalCup?: boolean
  /** For timer rules: when the countdown ends (server clock, ms). Unset until the drawer starts it. */
  timerEndsAt?: number
}

export interface HouseRule {
  id: string
  text: string
  by: string
}

export interface HistoryEntry {
  card: Card
  slot: number
  playerId: string
  ruleId: string
  targetId?: string
  drinkers: Drinker[]
}

export type Phase = 'lobby' | 'playing' | 'finished'

export type RuleConfig = Record<Rank, string>

export const DECK_SIZE = 52

/** Everything every phone in the room is allowed to see. */
export interface GameState {
  code: string
  gameId: number
  phase: Phase
  hostId: string
  /** Seat order, clockwise. */
  players: Player[]
  rules: RuleConfig
  /** Which of the 52 ring positions have been drawn. */
  taken: boolean[]
  cardsLeft: number
  starterId: string | null
  turnId: string | null
  current: Draw | null
  mateGroups: string[][]
  houseRules: HouseRule[]
  cup: { drawn: number; total: number }
  history: HistoryEntry[]
  /** Why the game finished: the deck ran out, the host ended it, or too few players were left. */
  endReason: 'deck' | 'host' | 'players' | null
}

export type ClientMessage =
  | { type: 'create'; token: string; name: string; gender: Gender }
  | { type: 'join'; token: string; code: string; name: string; gender: Gender }
  | { type: 'resume'; token: string; code: string }
  | { type: 'leave' }
  | { type: 'setRule'; rank: Rank; ruleId: string }
  | { type: 'resetRules' }
  | { type: 'swapSeats'; a: string; b: string }
  | { type: 'kick'; playerId: string }
  | { type: 'start' }
  | { type: 'draw'; slot: number }
  | { type: 'choose'; targetId: string }
  | { type: 'writeRule'; text: string }
  | { type: 'removeHouseRule'; id: string }
  | { type: 'done' }
  | { type: 'startTimer' }
  | { type: 'skip' }
  | { type: 'endGame' }
  | { type: 'newGame' }

export type ServerMessage =
  /** `now` is the server's clock, so phones can line up shared countdowns. */
  | { type: 'state'; state: GameState; you: string; now: number }
  | { type: 'error'; message: string; fatal?: boolean }
  | { type: 'left' }
