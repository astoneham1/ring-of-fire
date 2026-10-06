import { DEFAULT_RULES, getRule, isRuleId } from '../shared/rules.ts'
import {
  DECK_SIZE,
  RANKS,
  SUITS,
  type Card,
  type Drinker,
  type GameState,
  type Gender,
  type Player,
  type Rank,
} from '../shared/types.ts'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 16
const MAX_NAME = 20
const MAX_RULE_TEXT = 140
const HISTORY_LIMIT = 20

/** A rule violation the player should be told about. */
export class GameError extends Error {}

function fail(message: string): never {
  throw new GameError(message)
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function freshDeck(): Card[] {
  return shuffle(RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit }))))
}

export function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  if (!name) fail('Enter your name')
  return name
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Everything needed to rebuild a room after the server has been asleep. */
export interface RoomSnapshot {
  state: GameState
  deck: Card[]
  tokens: [string, string][]
}

export class Room {
  readonly state: GameState
  /** The face-down card at each ring position. Never sent to clients. */
  private deck: Card[] = freshDeck()
  /** Private reconnect token -> public player id. */
  private tokens = new Map<string, string>()

  static restore(snapshot: RoomSnapshot): Room {
    const room: Room = Object.create(Room.prototype)
    Object.assign(room, { state: snapshot.state, deck: snapshot.deck, tokens: new Map(snapshot.tokens) })
    return room
  }

  snapshot(): RoomSnapshot {
    return { state: this.state, deck: this.deck, tokens: [...this.tokens] }
  }

  constructor(code: string, hostToken: string, hostName: string, hostGender: Gender) {
    const host: Player = { id: randomId(), name: cleanName(hostName), gender: hostGender, connected: true }
    this.tokens.set(hostToken, host.id)
    this.state = {
      code,
      gameId: 1,
      phase: 'lobby',
      hostId: host.id,
      players: [host],
      rules: { ...DEFAULT_RULES },
      taken: Array(DECK_SIZE).fill(false),
      cardsLeft: DECK_SIZE,
      starterId: null,
      turnId: null,
      current: null,
      mateGroups: [],
      houseRules: [],
      cup: { drawn: 0, total: 0 },
      history: [],
      endReason: null,
    }
    this.state.cup.total = this.cupTotal()
  }

  get hostId() {
    return this.state.hostId
  }

  playerForToken(token: string): Player | undefined {
    const id = this.tokens.get(token)
    return id ? this.player(id) : undefined
  }

  player(id: string): Player | undefined {
    return this.state.players.find((p) => p.id === id)
  }

  private requireHost(actorId: string) {
    if (actorId !== this.state.hostId) fail('Only the host can do that')
  }

  private requirePhase(phase: GameState['phase']) {
    if (this.state.phase !== phase) fail(phase === 'lobby' ? 'The game has already started' : "The game isn't running")
  }

  // ── Lobby ────────────────────────────────────────────────────────────────

  join(token: string, name: string, gender: Gender): Player {
    const existing = this.playerForToken(token)
    if (existing) {
      existing.connected = true
      if (this.state.phase === 'lobby') {
        existing.name = cleanName(name)
        existing.gender = gender
      }
      return existing
    }
    if (this.state.phase !== 'lobby') fail("This game has already started. Ask the host to start a new one")
    if (this.state.players.length >= MAX_PLAYERS) fail('This game is full')
    const clean = cleanName(name)
    if (this.state.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      fail(`Someone called ${clean} is already in. Try a nickname`)
    }
    const player: Player = { id: randomId(), name: clean, gender, connected: true }
    this.tokens.set(token, player.id)
    this.state.players.push(player)
    return player
  }

  setConnected(playerId: string, connected: boolean) {
    const p = this.player(playerId)
    if (p) p.connected = connected
  }

  /** Takes a player out of the game for good. Mid-game, play skips over their seat. */
  remove(playerId: string) {
    const s = this.state
    const idx = s.players.findIndex((p) => p.id === playerId)
    if (idx < 0) return

    if (s.phase === 'playing') {
      // If they leave mid-card, wrap the card up so the game doesn't get stuck on it.
      if (s.current?.playerId === playerId) this.finishDraw()
      if (s.turnId === playerId) s.turnId = s.players[(idx + 1) % s.players.length].id
    }

    s.players.splice(idx, 1)
    for (const [token, id] of this.tokens) if (id === playerId) this.tokens.delete(token)
    s.mateGroups = s.mateGroups.map((g) => g.filter((id) => id !== playerId)).filter((g) => g.length > 1)
    if (s.current) s.current.drinkers = s.current.drinkers.filter((d) => d.id !== playerId)

    if (s.hostId === playerId && s.players.length) {
      s.hostId = (s.players.find((p) => p.connected) ?? s.players[0]).id
    }
    if (s.phase === 'playing' && (s.players.length < MIN_PLAYERS || s.cardsLeft === 0)) {
      this.finish(s.cardsLeft === 0 ? 'deck' : 'players')
    }
  }

  kick(actorId: string, playerId: string) {
    this.requireHost(actorId)
    this.requirePhase('lobby')
    if (playerId === actorId) fail("You can't remove yourself")
    this.remove(playerId)
  }

  setRule(actorId: string, rank: Rank, ruleId: string) {
    this.requireHost(actorId)
    this.requirePhase('lobby')
    if (!RANKS.includes(rank) || !isRuleId(ruleId)) fail('Unknown rule')
    this.state.rules[rank] = ruleId
    this.state.cup.total = this.cupTotal()
  }

  resetRules(actorId: string) {
    this.requireHost(actorId)
    this.requirePhase('lobby')
    this.state.rules = { ...DEFAULT_RULES }
    this.state.cup.total = this.cupTotal()
  }

  swapSeats(actorId: string, a: string, b: string) {
    this.requireHost(actorId)
    this.requirePhase('lobby')
    const players = this.state.players
    const i = players.findIndex((p) => p.id === a)
    const j = players.findIndex((p) => p.id === b)
    if (i < 0 || j < 0) fail('Player not found')
    ;[players[i], players[j]] = [players[j], players[i]]
  }

  start(actorId: string) {
    this.requireHost(actorId)
    this.requirePhase('lobby')
    if (this.state.players.length < MIN_PLAYERS) fail(`You need at least ${MIN_PLAYERS} players`)
    const starter = this.state.players[Math.floor(Math.random() * this.state.players.length)]
    this.state.phase = 'playing'
    this.state.starterId = starter.id
    this.state.turnId = starter.id
  }

  // ── Playing ──────────────────────────────────────────────────────────────

  draw(actorId: string, slot: number) {
    this.requirePhase('playing')
    const s = this.state
    if (actorId !== s.turnId) fail("It's not your turn")
    if (s.current) fail('Finish the current card first')
    if (!Number.isInteger(slot) || slot < 0 || slot >= DECK_SIZE || s.taken[slot]) fail('That card is gone')

    const drawerId = s.turnId!
    const card = this.deck[slot]
    const ruleId = s.rules[card.rank]
    const rule = getRule(ruleId)
    s.taken[slot] = true
    s.cardsLeft--

    const draw: GameState['current'] = {
      card,
      slot,
      playerId: drawerId,
      ruleId,
      awaitingChoice: false,
      drinkers: [],
    }

    switch (rule.action.kind) {
      case 'self':
        draw.drinkers = this.withMates([drawerId])
        break
      case 'everyone':
        draw.drinkers = s.players.map((p) => ({ id: p.id }))
        break
      case 'gender': {
        const gender = rule.action.gender
        draw.drinkers = this.withMates(s.players.filter((p) => p.gender === gender).map((p) => p.id))
        break
      }
      case 'chooseMate':
        draw.awaitingChoice = this.matesOf(drawerId).length < s.players.length - 1
        // The whole table is already one mate group, so there's nobody to pick: the drawer just drinks.
        if (!draw.awaitingChoice) draw.drinkers = [{ id: drawerId }]
        break
      case 'chooseDrinker':
      case 'writeRule':
        draw.awaitingChoice = true
        break
      case 'kingsCup': {
        s.cup.drawn++
        draw.cupNumber = s.cup.drawn
        draw.finalCup = s.cup.drawn >= s.cup.total
        // Downing the cup is on the drawer alone; mates don't count here.
        if (draw.finalCup) draw.drinkers = [{ id: drawerId }]
        break
      }
      case 'master':
      case 'none':
        break
    }

    s.current = draw
  }

  choose(actorId: string, targetId: string) {
    this.requirePhase('playing')
    const s = this.state
    const draw = s.current
    if (!draw || !draw.awaitingChoice) fail('Nothing to choose')
    if (actorId !== draw.playerId) fail("It's not your pick")
    if (!this.player(targetId)) fail('Player not found')
    if (targetId === draw.playerId) fail('Pick someone else')

    const kind = getRule(draw.ruleId).action.kind
    if (kind === 'chooseDrinker') {
      draw.drinkers = this.withMates([targetId])
    } else if (kind === 'chooseMate') {
      if (this.matesOf(draw.playerId).includes(targetId)) fail("You're already mates")
      this.linkMates(draw.playerId, targetId)
    } else {
      fail('Nothing to choose')
    }
    draw.targetId = targetId
    draw.awaitingChoice = false
    // Picking someone is the whole turn, so there's nothing left to press Done for.
    this.endTurn()
  }

  writeRule(actorId: string, text: string) {
    this.requirePhase('playing')
    const s = this.state
    const draw = s.current
    if (!draw || !draw.awaitingChoice || getRule(draw.ruleId).action.kind !== 'writeRule') fail('Nothing to write')
    if (actorId !== draw.playerId) fail("It's not your rule to make")
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_RULE_TEXT)
    if (!clean) fail('Write a rule first')
    draw.ruleText = clean
    draw.awaitingChoice = false
    s.houseRules.push({ id: randomId(), text: clean, by: draw.playerId })
  }

  removeHouseRule(actorId: string, id: string) {
    this.requireHost(actorId)
    this.state.houseRules = this.state.houseRules.filter((r) => r.id !== id)
  }

  endGame(actorId: string) {
    this.requireHost(actorId)
    this.requirePhase('playing')
    this.finish('host')
  }

  private finish(reason: NonNullable<GameState['endReason']>) {
    const s = this.state
    s.phase = 'finished'
    s.endReason = reason
    s.current = null
    s.turnId = null
  }

  /** Moves the current card into history. */
  private finishDraw() {
    const s = this.state
    const draw = s.current
    if (!draw) return
    s.history.unshift({
      card: draw.card,
      slot: draw.slot,
      playerId: draw.playerId,
      ruleId: draw.ruleId,
      targetId: draw.targetId,
      drinkers: draw.drinkers,
    })
    s.history.length = Math.min(s.history.length, HISTORY_LIMIT)
    s.current = null
  }

  done(actorId: string) {
    this.requirePhase('playing')
    const draw = this.state.current
    if (!draw) fail('Draw a card first')
    if (actorId !== draw.playerId) fail("It's not your turn")
    if (draw.awaitingChoice) fail(getRule(draw.ruleId).action.kind === 'writeRule' ? 'Make your rule first' : 'Make your pick first')
    this.endTurn()
  }

  /** Host override for a stuck turn: skips it whether or not a card has been drawn. */
  skip(actorId: string) {
    this.requireHost(actorId)
    this.requirePhase('playing')
    if (this.state.turnId === actorId) fail("It's your turn. Just play it")
    this.endTurn()
  }

  /** Wraps up any drawn card and passes play clockwise (or ends the game if the deck's empty). */
  private endTurn() {
    const s = this.state
    this.finishDraw()
    if (s.cardsLeft === 0) {
      this.finish('deck')
      return
    }
    const idx = s.players.findIndex((p) => p.id === s.turnId)
    s.turnId = s.players[(idx + 1) % s.players.length].id
  }

  newGame(actorId: string) {
    this.requireHost(actorId)
    const s = this.state
    this.deck = freshDeck()
    s.gameId++
    s.phase = 'lobby'
    s.taken = Array(DECK_SIZE).fill(false)
    s.cardsLeft = DECK_SIZE
    s.starterId = null
    s.turnId = null
    s.current = null
    s.mateGroups = []
    s.houseRules = []
    s.cup = { drawn: 0, total: this.cupTotal() }
    s.history = []
    s.endReason = null
    // Anyone who dropped out during the last game gets cleared from the lobby.
    for (const p of s.players.filter((p) => !p.connected)) this.remove(p.id)
  }

  // ── Mates ────────────────────────────────────────────────────────────────

  private matesOf(id: string): string[] {
    return this.state.mateGroups.find((g) => g.includes(id))?.filter((m) => m !== id) ?? []
  }

  /** Mates are transitive: linking two people merges their whole groups. */
  private linkMates(a: string, b: string) {
    const groups = this.state.mateGroups
    const ga = groups.find((g) => g.includes(a)) ?? [a]
    const gb = groups.find((g) => g.includes(b)) ?? [b]
    const merged = [...new Set([...ga, ...gb])]
    this.state.mateGroups = [...groups.filter((g) => g !== ga && g !== gb), merged]
  }

  private withMates(ids: string[]): Drinker[] {
    const result: Drinker[] = ids.map((id) => ({ id }))
    const seen = new Set(ids)
    for (const id of ids) {
      for (const mate of this.matesOf(id)) {
        if (seen.has(mate)) continue
        seen.add(mate)
        result.push({ id: mate, viaMateOf: id })
      }
    }
    return result
  }

  private cupTotal(): number {
    return RANKS.filter((r) => getRule(this.state.rules[r]).action.kind === 'kingsCup').length * SUITS.length
  }
}
