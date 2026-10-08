import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { GameState } from '../../shared/types.ts'
import { Cup } from '../components/Cup.tsx'
import { CloseGameSheet } from '../components/Overlays.tsx'
import { TableInfo } from '../components/TableInfo.tsx'
import { nameOf } from '../lib/players.ts'
import type { Send } from '../lib/useGame.ts'

const ENDINGS = {
  deck: { title: ["That's the", 'deck'], body: () => "All 52 cards drawn. Hope you've got water." },
  host: { title: ['Game', 'over'], body: (s: GameState) => `${nameOf(s, s.hostId)} ended the game with ${s.cardsLeft} cards left.` },
  players: { title: ['Game', 'over'], body: () => 'Not enough players left to carry on.' },
}

export function Finished({ state, you, send }: { state: GameState; you: string; send: Send }) {
  const isHost = state.hostId === you
  const ending = ENDINGS[state.endReason ?? 'deck']
  const [confirmClose, setConfirmClose] = useState(false)

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-4">
      <div className="flex flex-1 flex-col items-center justify-center pt-10 text-center">
        <motion.div
          className="w-28"
          initial={{ rotate: 0 }}
          animate={{ rotate: [0, -12, 10, -6, 0] }}
          transition={{ duration: 1.2, delay: 0.3 }}
        >
          <Cup fill={0} className="w-full" />
        </motion.div>
        <p className="label mt-6">{state.endReason === 'deck' ? 'Game over' : 'Ended early'}</p>
        <h1 className="mt-1 font-display text-5xl leading-none font-extrabold tracking-tight">
          {ending.title[0]} <span className="text-ember">{ending.title[1]}</span>
        </h1>
        <p className="mt-3 text-smoke">{ending.body(state)}</p>
      </div>

      <section className="mt-8">
        <TableInfo state={{ ...state, history: [] }} you={you} send={send} emptyHint={false} />
      </section>

      <div className="mt-8 flex flex-col gap-1">
        {isHost ? (
          <button type="button" className="btn-primary w-full" onClick={() => send({ type: 'newGame' })}>
            Play again
          </button>
        ) : (
          <div className="flex h-14 items-center justify-center rounded-2xl border border-char text-smoke">
            {nameOf(state, state.hostId)} can start another round
          </div>
        )}
        <button type="button" className="btn-ghost w-full" onClick={() => (isHost ? setConfirmClose(true) : send({ type: 'leave' }))}>
          {isHost ? 'Close game' : 'Leave game'}
        </button>
      </div>
      <AnimatePresence>{confirmClose && <CloseGameSheet send={send} onCancel={() => setConfirmClose(false)} />}</AnimatePresence>
    </main>
  )
}
