import { motion } from 'motion/react'
import type { GameState } from '../../shared/types.ts'
import { Cup } from '../components/Cup.tsx'
import { TableInfo } from '../components/TableInfo.tsx'
import { nameOf } from '../lib/players.ts'
import type { Send } from '../lib/useGame.ts'

export function Finished({ state, you, send }: { state: GameState; you: string; send: Send }) {
  const isHost = state.hostId === you

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
        <p className="label mt-6">Game over</p>
        <h1 className="mt-1 font-display text-5xl leading-none font-extrabold tracking-tight">
          That's the <span className="text-ember">deck</span>
        </h1>
        <p className="mt-3 text-smoke">All 52 cards drawn. Hope you've got water.</p>
      </div>

      <section className="mt-8">
        <TableInfo state={{ ...state, history: [] }} you={you} send={send} />
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
        <button type="button" className="btn-ghost w-full" onClick={() => send({ type: 'leave' })}>
          Leave game
        </button>
      </div>
    </main>
  )
}
