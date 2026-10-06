import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { getRule } from '../../shared/rules.ts'
import { RANKS, type GameState } from '../../shared/types.ts'
import { DrawSheet } from '../components/DrawSheet.tsx'
import { FinalCup, StarterReveal } from '../components/Overlays.tsx'
import { RankBadge } from '../components/PlayingCard.tsx'
import { Table } from '../components/Table.tsx'
import { TableInfo } from '../components/TableInfo.tsx'
import { nameOf, vibrate } from '../lib/players.ts'
import type { Send } from '../lib/useGame.ts'

export function Game({ state, you, send }: { state: GameState; you: string; send: Send }) {
  const isHost = state.hostId === you
  const yourTurn = state.turnId === you
  const draw = state.current
  const [hostDrawing, setHostDrawing] = useState(false)
  const [showRules, setShowRules] = useState(false)

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

  useEffect(() => setHostDrawing(false), [state.turnId, draw])

  const canDraw = !draw && (yourTurn || (isHost && hostDrawing))

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-4">
      <header className="flex items-center justify-between">
        <span className="rounded-full border border-char px-3 py-1 font-display text-sm font-bold tracking-[0.15em] text-smoke">
          {state.code}
        </span>
        <span className="text-sm font-semibold text-smoke">
          <span className="text-cream">{state.cardsLeft}</span> cards left
        </span>
        <button type="button" className="rounded-full border border-char px-3 py-1 text-sm font-semibold text-smoke" onClick={() => setShowRules(true)}>
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
                <p className="text-smoke">Tap a card from the ring</p>
              </>
            ) : (
              <>
                <h1 className="font-display text-3xl font-extrabold tracking-tight">{nameOf(state, state.turnId)}'s turn</h1>
                {isHost && !draw ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-smoke underline decoration-ash underline-offset-4"
                    onClick={() => setHostDrawing((v) => !v)}
                  >
                    {hostDrawing ? `Tap a card for ${nameOf(state, state.turnId)} · cancel` : `Draw for ${nameOf(state, state.turnId)}`}
                  </button>
                ) : (
                  <p className="text-smoke">{nextId === you ? "You're up next" : '\u00a0'}</p>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mx-auto w-full max-w-[400px]">
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
        />
      </div>

      <section className="mt-4 pb-4">
        <TableInfo state={state} you={you} send={send} />
      </section>

      <AnimatePresence>{draw && <DrawSheet key={draw.slot} state={state} draw={draw} you={you} send={send} />}</AnimatePresence>

      <AnimatePresence>
        {draw && finalCupKey && seenFinalCup !== finalCupKey && (
          <FinalCup state={state} draw={draw} you={you} onDone={() => setSeenFinalCup(finalCupKey)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {introFor === state.gameId && <StarterReveal state={state} you={you} onDone={() => setIntroFor(null)} />}
      </AnimatePresence>

      <AnimatePresence>{showRules && <RulesSheet state={state} onClose={() => setShowRules(false)} />}</AnimatePresence>
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
                  <p className="font-semibold">{rule.name}</p>
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
