import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Player } from '../../shared/types.ts'
import type { Send } from '../lib/useGame.ts'
import { Avatar } from './Avatar.tsx'

/**
 * The host's seat controls, shared by the lobby and the game: tap someone to select them,
 * tap a second seat to swap the two. The returned ref goes on the table so it can be kept
 * in view above the panel.
 */
export function useSeatSelection(send: Send, players: Player[]) {
  const [selected, setSelected] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  // Drop the selection if that person leaves or is removed.
  useEffect(() => {
    if (selected && !players.some((p) => p.id === selected)) setSelected(null)
  }, [selected, players])

  useEffect(() => {
    if (selected) tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selected])

  const tapSeat = (id: string) => {
    if (!selected) return setSelected(id)
    if (selected !== id) send({ type: 'swapSeats', a: selected, b: id })
    setSelected(null)
  }

  const clear = useCallback(() => setSelected(null), [])

  return { selected, tapSeat, clear, tableRef }
}

/** Slides up from the bottom when the host taps a seat. It doesn't cover the table, so a second seat can be tapped. */
export function SeatPanel({
  player,
  isYou,
  onMakeHost,
  onRemove,
  onClose,
}: {
  player: Player
  isYou: boolean
  onMakeHost: () => void
  onRemove: () => void
  onClose: () => void
}) {
  // Removing someone can't be undone, so it takes a second tap.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <motion.section
      className="safe-bottom fixed inset-x-0 bottom-0 z-[45] mx-auto w-full max-w-md rounded-t-[32px] border-t border-ash bg-coal px-5 pt-5 shadow-[0_-20px_50px_-10px_rgb(0_0_0/0.7)]"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
    >
      <div className="flex items-center gap-3">
        <Avatar player={player} size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl font-bold">{isYou ? 'You' : player.name}</h2>
          <p className="text-sm text-smoke">Tap another seat to swap {isYou ? 'with you' : 'them'}</p>
        </div>
        <button type="button" className="btn-ghost -mr-3 h-10" onClick={onClose}>
          Cancel
        </button>
      </div>
      {!isYou && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary h-12 text-base text-gold" onClick={onMakeHost}>
            Make host
          </button>
          <button
            type="button"
            className={`btn h-12 border text-base ${armed ? 'border-flame bg-flame text-cream' : 'border-flame/50 text-flame'}`}
            onClick={() => (armed ? onRemove() : setArmed(true))}
          >
            {armed ? 'Tap again' : 'Remove'}
          </button>
        </div>
      )}
    </motion.section>
  )
}
