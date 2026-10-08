import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { getRule } from '../../shared/rules.ts'
import { serverNow, type Send } from '../lib/useGame.ts'
import type { Draw, GameState, HistoryEntry, Player } from '../../shared/types.ts'
import { nameOf, vibrate } from '../lib/players.ts'
import { Avatar } from './Avatar.tsx'
import { Cup } from './Cup.tsx'

/** A brief, non-blocking "Last card" moment when the ring is down to one. */
export function LastCardFlash() {
  useEffect(() => {
    vibrate([80, 60, 80])
  }, [])
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(closest-side,rgb(255_122_47/0.35),transparent)]" />
      <motion.div
        className="relative rounded-[28px] border border-ember/50 bg-coal px-9 py-6 text-center shadow-[0_24px_60px_-12px_rgb(232_69_44/0.55)]"
        initial={{ scale: 1.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14 }}
      >
        <p className="label text-gold">One left</p>
        <p className="mt-1 font-display text-6xl leading-none font-extrabold tracking-tight text-cream">
          Last <span className="text-ember">card</span>
        </p>
      </motion.div>
    </motion.div>
  )
}

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
        Then it goes clockwise.
      </p>
    </motion.div>
  )
}

/** The big moment: the final King's Cup card. */
export function FinalCup({ state, draw, you, onDone }: { state: GameState; draw: Draw; you: string; onDone: () => void }) {
  const name = nameOf(state, draw.playerId, you)

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
        {name} {draw.playerId === you ? 'have' : 'has'} to down the cup
      </motion.h2>
      <motion.p className="relative mt-4 text-lg text-cream/85" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
        Good luck
      </motion.p>
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

/** A bottom sheet asking "are you sure?" before something you can't undo. */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[45] flex flex-col justify-end bg-ink/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.section
        className="safe-bottom mx-auto w-full max-w-md rounded-t-[32px] border-t border-ash bg-coal px-5 pt-6"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-cream/80">{body}</p>
        <div className="mt-6 flex flex-col gap-1">
          <button type="button" className="btn w-full bg-flame text-cream" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </motion.section>
    </motion.div>
  )
}

/** Shown on every phone for a few seconds after a "pick someone" card, since that card closes as soon as they pick. */
export function PickAnnouncement({ state, entry, you }: { state: GameState; entry: HistoryEntry; you: string }) {
  const target = state.players.find((p) => p.id === entry.targetId)
  const drawer = state.players.find((p) => p.id === entry.playerId)
  if (!target || !drawer) return null
  const isMate = getRule(entry.ruleId).action.kind === 'chooseMate'

  let avatars: Player[]
  let title: string
  let detail: string
  if (isMate) {
    // Put "You" first when you're one of the pair.
    const pair = target.id === you ? [target, drawer] : [drawer, target]
    const others = (state.mateGroups.find((g) => g.includes(drawer.id)) ?? []).filter((id) => id !== drawer.id && id !== target.id)
    avatars = pair
    title = `${pair.map((p) => nameOf(state, p.id, you)).join(' & ')} are mates`
    detail = others.length
      ? `Linked with ${listNames(others.map((id) => nameOf(state, id, you)))} too`
      : 'When one drinks, so does the other'
  } else {
    const isYou = target.id === you
    const mates = entry.drinkers.filter((d) => d.viaMateOf)
    avatars = [target]
    title = isYou ? 'You drink' : `${target.name} drinks`
    detail = `${nameOf(state, drawer.id, you)} picked ${isYou ? 'you' : 'them'}`
    if (mates.length) detail += ` · ${listNames(mates.map((m) => nameOf(state, m.id, you)))} drink too`
  }

  return (
    <motion.div
      className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div className="flex w-full max-w-sm items-center gap-3 rounded-3xl border border-ember/40 bg-char p-3 pr-5 shadow-[0_12px_40px_-8px_rgb(0_0_0/0.7)]">
        <div className="flex shrink-0 -space-x-1">
          {avatars.map((p) => (
            <Avatar key={p.id} player={p} size={avatars.length > 1 ? 40 : 48} className="ring-[3px] ring-char" />
          ))}
        </div>
        <div className="min-w-0">
          <p className="font-display text-xl leading-tight font-extrabold">{title}</p>
          <p className="truncate text-sm text-smoke">{detail}</p>
        </div>
      </div>
    </motion.div>
  )
}

function listNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
}

/** Big, centred box for the person who was just picked to drink on "2 — You". */
export function YouDrink({ pickerName, duration, onDone }: { pickerName: string; duration: number; onDone: () => void }) {
  useEffect(() => {
    vibrate([120, 60, 120])
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-[45] flex items-center justify-center bg-ink/75 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDone}
    >
      <motion.div
        className="relative w-full max-w-sm overflow-hidden rounded-[32px] border border-ember/50 bg-gradient-to-b from-[#3a1a12] to-coal px-6 pt-10 pb-8 text-center shadow-[0_30px_80px_-20px_rgb(232_69_44/0.55)]"
        initial={{ scale: 0.6, rotate: -4 }}
        animate={{ scale: 1, rotate: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      >
        <p className="label text-gold">Decorum!</p>
        <h2 className="mt-2 font-display text-6xl leading-none font-extrabold tracking-tight text-ember">Drink!</h2>
        <p className="mt-5 font-display text-2xl leading-snug font-bold">{pickerName} picked you to drink</p>
        <p className="mt-6 text-sm text-cream/50">Tap to close</p>
        <motion.div
          className="absolute inset-x-0 bottom-0 h-1 origin-left bg-ember"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
        />
      </motion.div>
    </motion.div>
  )
}

/** A few seconds to take back a Done tapped by mistake. Shown to the drawer and the host. */
export function UndoDone({ until, drawerName, onUndo }: { until: number; drawerName: string | null; onUndo: () => void }) {
  const [left] = useState(() => Math.max(0, until - serverNow()))
  const [gone, setGone] = useState(left === 0)
  useEffect(() => {
    const t = setTimeout(() => setGone(true), left)
    return () => clearTimeout(t)
  }, [left])
  if (gone) return null

  return (
    <motion.div
      className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
    >
      <div className="pointer-events-auto relative flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-2xl border border-ash bg-char py-2 pr-2 pl-4 shadow-[0_12px_40px_-8px_rgb(0_0_0/0.7)]">
        <p className="min-w-0 flex-1 truncate text-sm">
          {drawerName ? `${drawerName} finished their card` : 'Tapped Done by mistake?'}
        </p>
        <button type="button" className="btn h-10 shrink-0 bg-gold px-4 text-base text-ink" onClick={onUndo}>
          Undo
        </button>
        <motion.div
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gold"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: left / 1000, ease: 'linear' }}
        />
      </div>
    </motion.div>
  )
}

/** The host leaving outside a game closes it for everyone, so check first. */
export function CloseGameSheet({ send, onCancel }: { send: Send; onCancel: () => void }) {
  return (
    <ConfirmSheet
      title="Close the game?"
      body="You're the host, so leaving closes the game and sends everyone back to the start."
      confirmLabel="Close game"
      cancelLabel="Stay"
      onConfirm={() => send({ type: 'leave' })}
      onCancel={onCancel}
    />
  )
}
