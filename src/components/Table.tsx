import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef, type MouseEvent } from 'react'
import { DECK_SIZE, type Player } from '../../shared/types.ts'
import { seeded } from '../lib/players.ts'
import { Avatar } from './Avatar.tsx'
import { Cup } from './Cup.tsx'

// All sizes are fractions of the table's width so it scales to any phone.
const CARD_RADIUS = 0.27
const CARD_WIDTH = 0.05
const SEAT_RADIUS = 0.425
const AVATAR = 0.1
const CUP_SIZE = 0.23
const POINTER_RADIUS = 0.155

interface Slot {
  index: number
  x: number
  y: number
  rotate: number
}

function polar(radius: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180
  return { x: 50 + radius * 100 * Math.cos(rad), y: 50 + radius * 100 * Math.sin(rad) }
}

/** Seat angle in screen degrees. The viewer sits at the bottom; play runs clockwise from there. */
function seatAngle(index: number, viewerIndex: number, count: number) {
  return 90 + ((index - viewerIndex) * 360) / count
}

interface TableProps {
  players: Player[]
  viewerId: string | null
  hostId?: string
  /** Ring cards already drawn. Omit to show a full ring. */
  taken?: boolean[]
  seed?: number
  turnId?: string | null
  cupFill?: number
  cupLabel?: string
  canDraw?: boolean
  onDraw?: (slot: number) => void
  selectedSeat?: string | null
  onSeatTap?: (playerId: string) => void
  showSeats?: boolean
}

export function Table({
  players,
  viewerId,
  hostId,
  taken,
  seed = 1,
  turnId,
  cupFill = 0,
  cupLabel,
  canDraw = false,
  onDraw,
  selectedSeat,
  onSeatTap,
  showSeats = true,
}: TableProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Scatter the cards a little, like a real ring on a sticky table.
  const slots = useMemo<Slot[]>(() => {
    const rand = seeded(seed * 7919)
    return Array.from({ length: DECK_SIZE }, (_, index) => {
      const angle = -90 + (index * 360) / DECK_SIZE + (rand() - 0.5) * 3
      const radius = CARD_RADIUS + (rand() - 0.5) * 0.025
      const { x, y } = polar(radius, angle)
      return { index, x, y, rotate: angle + 90 + (rand() - 0.5) * 26 }
    })
  }, [seed])

  const viewerIndex = Math.max(0, players.findIndex((p) => p.id === viewerId))
  const turnIndex = players.findIndex((p) => p.id === turnId)

  // Always turn the pointer clockwise, even when play wraps back to the first seat.
  const pointerAngle = useRef<number | null>(null)
  if (turnIndex >= 0) {
    const raw = seatAngle(turnIndex, viewerIndex, players.length)
    const prev = pointerAngle.current
    pointerAngle.current = prev === null ? raw : prev + ((((raw - prev) % 360) + 360) % 360)
  }

  // Tapping anywhere near the ring takes the closest card, so tiny cards are still easy to hit.
  const handleTap = (e: MouseEvent<HTMLDivElement>) => {
    if (!canDraw || !onDraw || !ref.current) return
    const box = ref.current.getBoundingClientRect()
    const dx = (e.clientX - box.left) / box.width - 0.5
    const dy = (e.clientY - box.top) / box.height - 0.5
    const dist = Math.hypot(dx, dy)
    if (dist < CARD_RADIUS - 0.09 || dist > CARD_RADIUS + 0.08) return
    const tapAngle = (Math.atan2(dy, dx) * 180) / Math.PI
    let best = -1
    let bestDiff = Infinity
    for (const slot of slots) {
      if (taken?.[slot.index]) continue
      const slotAngle = Math.atan2(slot.y - 50, slot.x - 50) * (180 / Math.PI)
      const diff = Math.abs(((tapAngle - slotAngle + 540) % 360) - 180)
      if (diff < bestDiff) {
        bestDiff = diff
        best = slot.index
      }
    }
    if (best >= 0 && bestDiff < 25) onDraw(best)
  }

  return (
    <div
      ref={ref}
      className="relative aspect-square w-full select-none"
      style={{ containerType: 'inline-size' }}
      onClick={handleTap}
    >
      {/* Glow under the ring when it's your go. */}
      <AnimatePresence>
        {canDraw && (
          <motion.div
            className="pointer-events-none absolute rounded-full"
            style={{
              inset: `${(0.5 - CARD_RADIUS - 0.07) * 100}%`,
              boxShadow: '0 0 0 2px rgb(255 122 47 / 0.35), 0 0 60px 6px rgb(255 122 47 / 0.25), inset 0 0 50px 4px rgb(255 122 47 / 0.18)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.55, 1, 0.55] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>

      {/* The ring of face-down cards. */}
      <AnimatePresence initial={false}>
        {slots
          .filter((s) => !taken?.[s.index])
          .map((s) => (
            <motion.div
              key={`${seed}-${s.index}`}
              className="card-back pointer-events-none absolute aspect-[5/7] rounded-[3px] border-[1.5px] border-paper/90 shadow-[0_2px_4px_rgb(0_0_0/0.5)]"
              style={{ width: `${CARD_WIDTH * 100}%`, translate: '-50% -50%' }}
              initial={false}
              animate={{ left: `${s.x}%`, top: `${s.y}%`, rotate: s.rotate, opacity: 1, scale: 1 }}
              exit={{ left: '50%', top: '50%', rotate: 0, scale: 2.4, opacity: 0, zIndex: 20 }}
              transition={{ duration: 0.45, ease: [0.3, 0.7, 0.2, 1] }}
            />
          ))}
      </AnimatePresence>

      {/* Cup in the middle. */}
      <div
        className="pointer-events-none absolute flex flex-col items-center"
        style={{ width: `${CUP_SIZE * 100}%`, left: '50%', top: '50%', translate: '-50% -55%' }}
      >
        <Cup fill={cupFill} className="w-full" />
        {cupLabel && <span className="mt-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap text-smoke">{cupLabel}</span>}
      </div>

      {/* Pointer from the cup to whoever's turn it is. */}
      {showSeats && turnIndex >= 0 && (
        <motion.div
          className="pointer-events-none absolute top-1/2 left-1/2 h-0 w-0"
          initial={false}
          animate={{ rotate: pointerAngle.current ?? 0 }}
          transition={{ type: 'spring', stiffness: 70, damping: 13 }}
        >
          <div
            className="absolute h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-ember"
            style={{ left: `${POINTER_RADIUS * 100}cqw`, top: -7 }}
          />
        </motion.div>
      )}

      {/* Seats. */}
      {showSeats &&
        players.map((p, i) => {
          const { x, y } = polar(SEAT_RADIUS, seatAngle(i, viewerIndex, players.length))
          const isTurn = p.id === turnId
          const isSelected = p.id === selectedSeat
          return (
            <motion.button
              key={p.id}
              type="button"
              disabled={!onSeatTap}
              onClick={(e) => {
                e.stopPropagation()
                onSeatTap?.(p.id)
              }}
              className="absolute flex flex-col items-center gap-0.5"
              style={{ width: '22%', translate: '-50% -32%' }}
              initial={false}
              animate={{ left: `${x}%`, top: `${y}%` }}
              transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            >
              <span
                className={`relative flex rounded-full p-[3px] transition ${
                  isSelected ? 'bg-gold' : isTurn ? 'bg-ember shadow-[0_0_18px_2px_rgb(255_122_47/0.55)]' : 'bg-transparent'
                }`}
              >
                <Avatar player={p} size={`${AVATAR * 100}cqw`} />
                {p.id === hostId && (
                  <span className="absolute -top-1 -right-1 rounded-full bg-gold px-1 text-[8px] font-bold tracking-wide text-ink">
                    HOST
                  </span>
                )}
              </span>
              <span
                className={`max-w-full truncate text-[11px] leading-tight font-semibold ${
                  p.id === viewerId ? 'text-gold' : isTurn ? 'text-cream' : 'text-smoke'
                }`}
              >
                {p.id === viewerId ? 'You' : p.name}
              </span>
            </motion.button>
          )
        })}
    </div>
  )
}
