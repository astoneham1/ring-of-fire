import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { getRule, ruleName } from '../../shared/rules.ts'
import { RANKS, type GameState } from '../../shared/types.ts'
import { DrawSheet } from '../components/DrawSheet.tsx'
import { HostSkip } from '../components/HostSkip.tsx'
import { SeatPanel, useSeatSelection } from '../components/SeatPanel.tsx'
import { ConfirmSheet, FinalCup, LastCardFlash, PickAnnouncement, StarterReveal, YouDrink } from '../components/Overlays.tsx'
import { RankBadge } from '../components/PlayingCard.tsx'
import { Table } from '../components/Table.tsx'
import { TableInfo } from '../components/TableInfo.tsx'
import { nameOf, vibrate } from '../lib/players.ts'
import type { Send } from '../lib/useGame.ts'

const YOU_DRINK_MS = 4500
/** How long someone can sit on their turn before everyone gets a gentle nudge. */
const SLOW_TURN_MS = 15_000

export function Game({ state, you, send }: { state: GameState; you: string; send: Send }) {
  const isHost = state.hostId === you
  const yourTurn = state.turnId === you
  const draw = state.current
  const [showRules, setShowRules] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  // A card that was already open when this screen appeared (e.g. after reconnecting) doesn't fly in.
  const openOnArrival = useRef(state.current?.slot)
  const seats = useSeatSelection(send, state.players)
  const selectedPlayer = state.players.find((p) => p.id === seats.selected)
  // A card coming up takes over the bottom of the screen, so put the seat controls away.
  const { clear: clearSeats } = seats
  const drawSlot = draw?.slot
  useEffect(() => {
    if (drawSlot !== undefined) clearSeats()
  }, [drawSlot, clearSeats])

  // Intro spin only for a brand new game, not when reconnecting halfway through.
  const [introFor, setIntroFor] = useState<number | null>(() =>
    state.history.length === 0 && !state.current ? state.gameId : null,
  )
  const [seenFinalCup, setSeenFinalCup] = useState<string | null>(null)
  const finalCupKey = draw?.finalCup ? `${state.gameId}-${draw.slot}` : null

  const idx = state.players.findIndex((p) => p.id === state.turnId)
  const nextId = state.players[(idx + 1) % state.players.length]?.id

  useEffect(() => {
    if (yourTurn && !draw) vibrate(180)
  }, [yourTurn, draw])

  const canDraw = !draw && yourTurn

  // Nudge everyone if the current player is taking ages to pick a card from the ring.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (draw) return
    const t = setTimeout(() => setSlow(true), SLOW_TURN_MS)
    return () => clearTimeout(t)
  }, [state.turnId, draw])
  // One card left and it's waiting to be drawn.
  const lastCard = state.cardsLeft === 1 && !draw
  // Flash "Last card" when we get down to it, but not for someone reconnecting at that point.
  const [lastCardFlash, setLastCardFlash] = useState(false)
  const cardsLeftBefore = useRef(state.cardsLeft)
  useEffect(() => {
    if (lastCard && cardsLeftBefore.current > 1) setLastCardFlash(true)
    if (!draw) cardsLeftBefore.current = state.cardsLeft
  }, [lastCard, draw, state.cardsLeft])
  useEffect(() => {
    if (!lastCardFlash) return
    const t = setTimeout(() => setLastCardFlash(false), 2200)
    return () => clearTimeout(t)
  }, [lastCardFlash])

  const nudge = slow && (
    <motion.p className="font-semibold text-gold italic" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      A good game's a quick game
    </motion.p>
  )

  // Announce picks (You, Mate), since those cards finish the moment a name is confirmed.
  const latest = state.history[0]
  const latestKey = latest ? `${state.gameId}-${latest.slot}` : null
  const seenKey = useRef(latestKey)
  const [announce, setAnnounce] = useState<typeof latest | null>(null)
  // If someone picked *you* on "2 — You", you get a big box instead, since nothing else tells you.
  const [pickedYou, setPickedYou] = useState<typeof latest | null>(null)
  useEffect(() => {
    if (latestKey === seenKey.current) return
    seenKey.current = latestKey
    if (!latest?.targetId) return
    if (latest.targetId === you && getRule(latest.ruleId).action.kind === 'chooseDrinker') setPickedYou(latest)
    else setAnnounce(latest)
  }, [latestKey, latest, you])
  useEffect(() => {
    if (!announce) return
    const t = setTimeout(() => setAnnounce(null), 4000)
    return () => clearTimeout(t)
  }, [announce])
  useEffect(() => {
    if (!pickedYou) return
    const t = setTimeout(() => setPickedYou(null), YOU_DRINK_MS)
    return () => clearTimeout(t)
  }, [pickedYou])

  return (
    <main className={`safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-4 ${seats.selected ? 'pb-48' : ''}`}>
      <header className="grid grid-cols-[1fr_auto_1fr] items-center">
        <button
          type="button"
          className="justify-self-start rounded-full border border-char px-3 py-1 text-sm font-semibold text-smoke"
          onClick={() => setConfirmExit(true)}
        >
          {isHost ? 'End game' : 'Leave'}
        </button>
        {lastCard ? (
          <span className="text-sm font-bold text-gold">Last card</span>
        ) : (
          <span className="text-sm font-semibold text-smoke">
            <span className="text-cream">{state.cardsLeft}</span> {state.cardsLeft === 1 ? 'card' : 'cards'} left
          </span>
        )}
        <button
          type="button"
          className="justify-self-end rounded-full border border-char px-3 py-1 text-sm font-semibold text-smoke"
          onClick={() => setShowRules(true)}
        >
          Rules
        </button>
      </header>

      <div className="mt-5 min-h-[72px] text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.turnId ?? ''}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {yourTurn ? (
              <>
                <h1 className="font-display text-4xl font-extrabold tracking-tight text-ember">Your turn</h1>
                {nudge ||
                  (lastCard ? (
                    <p className="font-semibold text-gold">The last card. Make it count.</p>
                  ) : (
                    <p className="text-smoke">Tap a card from the ring</p>
                  ))}
              </>
            ) : (
              <>
                <h1 className="font-display text-3xl font-extrabold tracking-tight">{nameOf(state, state.turnId)}'s turn</h1>
                {nudge ||
                  (lastCard ? (
                    <p className="font-semibold text-gold">The last card in the ring</p>
                  ) : (
                    <p className="text-smoke">{nextId === you ? "You're up next" : '\u00a0'}</p>
                  ))}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div ref={seats.tableRef} className="mx-auto w-full max-w-[400px] scroll-mb-48">
        <Table
          players={state.players}
          viewerId={you}
          hostId={state.hostId}
          taken={state.taken}
          seed={state.gameId}
          turnId={state.turnId}
          cupFill={state.cup.total ? state.cup.drawn / state.cup.total : 0}
          cupLabel={state.cup.total ? `${state.cup.drawn} / ${state.cup.total}` : undefined}
          canDraw={canDraw}
          onDraw={(slot) => send({ type: 'draw', slot })}
          onSeatTap={isHost ? seats.tapSeat : undefined}
          selectedSeat={seats.selected}
        />
      </div>

      {isHost && !yourTurn && !draw && (
        <div className="mt-7 flex justify-center">
          <HostSkip label={`Skip ${nameOf(state, state.turnId)}'s turn`} onSkip={() => send({ type: 'skip' })} />
        </div>
      )}

      <section className="mt-4 pb-4">
        <TableInfo state={state} you={you} send={send} />
      </section>

      <AnimatePresence>{draw && <DrawSheet key={draw.slot} state={state} draw={draw} you={you} send={send} fly={draw.slot !== openOnArrival.current} />}</AnimatePresence>

      <AnimatePresence>
        {draw && finalCupKey && seenFinalCup !== finalCupKey && (
          <FinalCup state={state} draw={draw} you={you} onDone={() => setSeenFinalCup(finalCupKey)} />
        )}
      </AnimatePresence>

      <AnimatePresence>{announce && <PickAnnouncement key={announce.slot} state={state} entry={announce} you={you} />}</AnimatePresence>

      <AnimatePresence>
        {pickedYou && (
          <YouDrink
            key={pickedYou.slot}
            pickerName={nameOf(state, pickedYou.playerId)}
            duration={YOU_DRINK_MS}
            onDone={() => setPickedYou(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{lastCardFlash && <LastCardFlash />}</AnimatePresence>

      <AnimatePresence>
        {introFor === state.gameId && <StarterReveal state={state} you={you} onDone={() => setIntroFor(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPlayer && (
          <SeatPanel
            key={selectedPlayer.id}
            player={selectedPlayer}
            isYou={selectedPlayer.id === you}
            onMakeHost={() => {
              send({ type: 'makeHost', playerId: selectedPlayer.id })
              seats.clear()
            }}
            onRemove={() => {
              send({ type: 'kick', playerId: selectedPlayer.id })
              seats.clear()
            }}
            onClose={seats.clear}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{showRules && <RulesSheet state={state} onClose={() => setShowRules(false)} />}</AnimatePresence>

      <AnimatePresence>
        {confirmExit &&
          (isHost ? (
            <ConfirmSheet
              title="End the game?"
              body={`This ends it for everyone, with ${state.cardsLeft} cards still in the ring. You can start a new game with the same people afterwards.`}
              confirmLabel="End game"
              cancelLabel="Keep playing"
              onConfirm={() => send({ type: 'endGame' })}
              onCancel={() => setConfirmExit(false)}
            />
          ) : (
            <ConfirmSheet
              title="Leave the game?"
              body="You'll lose your seat and play will skip you."
              confirmLabel="Leave"
              cancelLabel="Stay"
              onConfirm={() => send({ type: 'leave' })}
              onCancel={() => setConfirmExit(false)}
            />
          ))}
      </AnimatePresence>
    </main>
  )
}

function RulesSheet({ state, onClose }: { state: GameState; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-30 flex flex-col justify-end bg-ink/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.section
        className="safe-bottom mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[32px] border-t border-ash bg-coal px-5 pt-5"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Card rules</h2>
          <button type="button" className="btn-ghost -mr-3" onClick={onClose}>
            Close
          </button>
        </div>
        <ul className="mt-2 divide-y divide-char">
          {RANKS.map((rank) => {
            const rule = getRule(state.rules[rank])
            return (
              <li key={rank} className="flex items-center gap-3 py-2.5">
                <RankBadge rank={rank} />
                <div className="min-w-0">
                  <p className="font-semibold">{ruleName(rule, rank)}</p>
                  <p className="text-sm text-smoke">{rule.summary}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </motion.section>
    </motion.div>
  )
}
