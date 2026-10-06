import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { Draw, GameState } from '../../shared/types.ts'
import { nameOf, vibrate } from '../lib/players.ts'
import { Avatar } from './Avatar.tsx'
import { Cup } from './Cup.tsx'

/** Spins through the players and lands on whoever starts. */
export function StarterReveal({ state, you, onDone }: { state: GameState; you: string; onDone: () => void }) {
  const players = state.players
  const starterIndex = players.findIndex((p) => p.id === state.starterId)
  const [index, setIndex] = useState(0)
  const [landed, setLanded] = useState(false)

  useEffect(() => {
    // Do a couple of laps, slowing down, and stop on the starter.
    const steps = players.length * 2 + starterIndex + 1
    let step = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      step++
      setIndex(step % players.length)
      if (step >= steps - 1) {
        setLanded(true)
        vibrate([60, 40, 120])
        timer = setTimeout(onDone, 1800)
        return
      }
      const progress = step / steps
      timer = setTimeout(tick, 60 + progress ** 3 * 380)
    }
    timer = setTimeout(tick, 300)
    return () => clearTimeout(timer)
  }, []) // Runs once per reveal.

  const shown = players[landed ? starterIndex : index]
  if (!shown) return null

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-ink/92 px-6 backdrop-blur"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => landed && onDone()}
    >
      <p className="label">{landed ? 'First up' : 'Who goes first?'}</p>
      <motion.div
        key={shown.id + landed}
        initial={{ scale: landed ? 0.6 : 0.9, opacity: 0.4 }}
        animate={{ scale: landed ? 1.1 : 1, opacity: 1 }}
        transition={landed ? { type: 'spring', stiffness: 300, damping: 14 } : { duration: 0.08 }}
        className="flex flex-col items-center gap-4"
      >
        <span className={`rounded-full p-1 ${landed ? 'bg-ember shadow-[0_0_50px_10px_rgb(255_122_47/0.45)]' : ''}`}>
          <Avatar player={shown} size={112} />
        </span>
        <span className="font-display text-4xl font-extrabold">{shown.id === you ? 'You' : shown.name}</span>
      </motion.div>
      <p className={`text-smoke transition-opacity ${landed ? 'opacity-100' : 'opacity-0'}`}>
        Then it goes clockwise. Tap to continue.
      </p>
    </motion.div>
  )
}

/** The big moment: the final King's Cup card. */
export function FinalCup({ state, draw, you, onDone }: { state: GameState; draw: Draw; you: string; onDone: () => void }) {
  const name = nameOf(state, draw.playerId, you)
  const mates = draw.drinkers.filter((d) => d.viaMateOf)

  useEffect(() => {
    vibrate([100, 60, 100, 60, 300])
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-ink px-6 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDone}
    >
      <motion.div
        className="pointer-events-none absolute inset-x-[-20%] bottom-[-30%] h-[90%] rounded-[50%] bg-[radial-gradient(closest-side,#ff7a2f_0%,#e8452c_45%,transparent_100%)] blur-2xl"
        animate={{ scaleY: [1, 1.12, 0.96, 1.08, 1], opacity: [0.75, 1, 0.8, 0.95, 0.75] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="relative w-36"
        initial={{ scale: 0.3, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 10, delay: 0.15 }}
      >
        <Cup fill={1} className="w-full drop-shadow-[0_10px_30px_rgb(0_0_0/0.6)]" />
      </motion.div>
      <motion.p
        className="relative mt-4 label text-gold"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        The last king
      </motion.p>
      <motion.h2
        className="relative mt-2 font-display text-5xl leading-[0.95] font-extrabold tracking-tight"
        initial={{ opacity: 0, scale: 1.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.55, type: 'spring', stiffness: 220, damping: 16 }}
      >
        {name} {draw.playerId === you ? 'down' : 'downs'} the cup
      </motion.h2>
      {mates.length > 0 && (
        <motion.p className="relative mt-4 text-cream/85" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
          …and {mates.map((m) => nameOf(state, m.id, you)).join(', ')} {mates.length === 1 && mates[0].id !== you ? 'drinks' : 'drink'} with{' '}
          {draw.playerId === you ? 'you' : 'them'}.
        </motion.p>
      )}
      <motion.p className="relative mt-10 text-sm text-cream/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
        Tap to continue
      </motion.p>
    </motion.div>
  )
}

export function Toast({ message }: { message: { id: number; message: string } | null }) {
  const [visible, setVisible] = useState(message)

  useEffect(() => {
    setVisible(message)
    if (!message) return
    const t = setTimeout(() => setVisible(null), 2800)
    return () => clearTimeout(t)
  }, [message])

  return (
    <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4">
      <AnimatePresence>
        {visible && (
          <motion.div
            key={visible.id}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="mt-2 rounded-2xl border border-ash bg-char px-4 py-3 text-sm font-medium shadow-xl"
          >
            {visible.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
