import { motion, useAnimate } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { MASTER_TITLES, RANK_NAMES, describe, getRule, ruleName } from '../../shared/rules.ts'
import type { Draw, GameState } from '../../shared/types.ts'
import { clockwiseFrom, matesOf, nameOf, vibrate } from '../lib/players.ts'
import { serverNow, type Send } from '../lib/useGame.ts'
import { Avatar, PlayerTag } from './Avatar.tsx'
import { HostSkip } from './HostSkip.tsx'
import { CardBack, CardFace } from './PlayingCard.tsx'
import { CARD_WIDTH, ringSlots } from './Table.tsx'

interface Props {
  state: GameState
  draw: Draw
  you: string
  send: Send
}

/** `fly`: the card was just drawn, so animate it out of the ring rather than flipping in place. */
export function DrawSheet({ state, draw, you, send, fly: flyProp = false }: Props & { fly?: boolean }) {
  // Decided once when the sheet opens, so a later re-render can't switch animations mid-flight.
  const [fly] = useState(flyProp)
  const rule = getRule(draw.ruleId)
  const isDrawer = draw.playerId === you
  const isHost = state.hostId === you
  const drawer = state.players.find((p) => p.id === draw.playerId)
  const drawerName = nameOf(state, draw.playerId)
  // Picking someone ends the turn by itself, so there's no Done button for it.
  const finishesOnPick = (rule.action.kind === 'chooseDrinker' || rule.action.kind === 'chooseMate') && draw.awaitingChoice
  // Timer cards (Hotseat) start the clock from the main button, so it's always in reach.
  const needsTimerStart = rule.action.kind === 'timer' && !draw.timerEndsAt

  // With a flying card, the rule stays hidden until the card turns over, so it isn't spoiled.
  const [revealed, setRevealed] = useState(!fly)

  return (
    <motion.div
      className="fixed inset-0 z-30 flex flex-col justify-end bg-ink/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <motion.section
        className="safe-bottom mx-auto flex max-h-[94dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-[32px] border-t border-ash bg-coal px-5 pt-5"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={fly ? { type: 'spring', stiffness: 420, damping: 40 } : { type: 'spring', stiffness: 260, damping: 30 }}
      >
        <p className="label text-center">{isDrawer ? 'You drew' : `${drawerName} drew`}</p>

        {fly ? (
          <FlyingDraw draw={draw} gameId={state.gameId} onReveal={() => setRevealed(true)} />
        ) : (
          <FlipCard draw={draw} />
        )}

        <motion.div
          className={revealed ? '' : 'pointer-events-none'}
          initial={false}
          animate={{ opacity: revealed ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mt-5 text-center">
            <p className="label">{RANK_NAMES[draw.card.rank]}</p>
            <h2 className="font-display text-4xl leading-tight font-extrabold tracking-tight">{ruleName(rule, draw.card.rank)}</h2>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-cream/80">
              {drawer && describe(rule, drawer, isDrawer)}
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <Outcome state={state} draw={draw} you={you} canAct={isDrawer} send={send} />
          </div>

          <div className="sticky bottom-0 mt-6 bg-coal pt-2">
            {isDrawer ? (
              !finishesOnPick &&
              (needsTimerStart ? (
                <button type="button" className="btn-primary w-full" onClick={() => send({ type: 'startTimer' })}>
                  Start the timer
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={draw.awaitingChoice}
                  onClick={() => send({ type: 'done' })}
                >
                  Done
                </button>
              ))
            ) : (
              <>
                {/* While they're picking, the outcome above already says what we're waiting for. */}
                {!draw.awaitingChoice && (
                  <div className="flex h-14 items-center justify-center rounded-2xl border border-char text-smoke">
                    Waiting for {drawerName} to finish…
                  </div>
                )}
                {isHost && (
                  <div className="mt-3 flex justify-center">
                    <HostSkip label={`Skip ${drawerName}'s turn`} onSkip={() => send({ type: 'skip' })} />
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.section>
    </motion.div>
  )
}

/** Where a ring card is on screen right now, from the table's seeded layout. */
function ringCardRect(slot: number, gameId: number) {
  const ring = document.querySelector('[data-card-ring]')
  if (!ring) return null
  const box = ring.getBoundingClientRect()
  const spot = ringSlots(gameId)[slot]
  const width = box.width * CARD_WIDTH
  return {
    left: box.left + (box.width * spot.x) / 100 - width / 2,
    top: box.top + (box.width * spot.y) / 100 - (width * 1.4) / 2,
    width,
    rotate: spot.rotate,
  }
}

/** Where an element in the draw sheet will be once the sheet has finished sliding up. */
function settledRect(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const sheet = el.closest('section')
  let slideLeft = 0
  try {
    if (sheet) slideLeft = new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42
  } catch {
    // No transform: the sheet is already in place.
  }
  return { left: rect.left, top: rect.top - slideLeft, width: rect.width }
}

/** The drawn card lifts out of its spot in the ring, flies into the sheet and turns over. */
function FlyingDraw({
  draw,
  gameId,
  onReveal,
}: {
  draw: Draw
  gameId: number
  /** Called as the card starts turning over. */
  onReveal: () => void
}) {
  const slotRef = useRef<HTMLDivElement>(null)
  const [landed, setLanded] = useState(false)
  return (
    <div ref={slotRef} className="mx-auto mt-4 w-[42%] max-w-44">
      {landed ? <CardFace card={draw.card} /> : <div className="aspect-[5/7]" />}
      {!landed && (
        <FlyingCard
          draw={draw}
          gameId={gameId}
          target={slotRef}
          onFlip={onReveal}
          onLanded={() => setLanded(true)}
        />
      )}
    </div>
  )
}

function FlyingCard({
  draw,
  gameId,
  target,
  onFlip,
  onLanded,
}: {
  draw: Draw
  gameId: number
  target: RefObject<HTMLDivElement | null>
  onFlip: () => void
  onLanded: () => void
}) {
  const [scope, animate] = useAnimate()
  // Measured once, before the ring re-renders without this card.
  const [from] = useState(() => {
    const rect = ringCardRect(draw.slot, gameId)
    return rect ?? { left: innerWidth / 2 - 20, top: innerHeight / 3, width: 40, rotate: 0 }
  })
  const callbacks = useRef({ onFlip, onLanded })
  callbacks.current = { onFlip, onLanded }

  // Lift it out of the ring, fly to the card slot while the sheet slides up, then turn it over.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await animate(scope.current, { scale: 1.4 }, { duration: 0.16, ease: 'easeOut' })
      const to = target.current && settledRect(target.current)
      if (cancelled || !to) return
      await animate(
        scope.current,
        { left: to.left, top: to.top, width: to.width, rotate: 0, scale: 1 },
        { duration: 0.4, ease: [0.3, 0.7, 0.2, 1] },
      )
      if (cancelled) return
      callbacks.current.onFlip()
      await animate(scope.current, { rotateY: 0 }, { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] })
      if (!cancelled) callbacks.current.onLanded()
    })()
    return () => {
      cancelled = true
    }
  }, [animate, scope, target])

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[35]" style={{ perspective: 1200 }}>
      <motion.div
        ref={scope}
        className="absolute"
        style={{ left: from.left, top: from.top, width: from.width, rotate: from.rotate, rotateY: 180, transformStyle: 'preserve-3d' }}
      >
        <CardFace card={draw.card} className="[backface-visibility:hidden]" />
        <CardBack className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]" />
      </motion.div>
    </div>,
    document.body,
  )
}

function FlipCard({ draw }: { draw: Draw }) {
  return (
    <div className="mx-auto mt-4 w-[42%] max-w-44" style={{ perspective: 900 }}>
      <motion.div
        key={`${draw.slot}`}
        className="relative"
        style={{ transformStyle: 'preserve-3d' }}
        initial={{ rotateY: 180, scale: 0.7, y: 40 }}
        animate={{ rotateY: 0, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: 0.1 }}
      >
        <CardFace card={draw.card} className="[backface-visibility:hidden]" />
        <CardBack className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]" />
      </motion.div>
    </div>
  )
}

function Outcome({ state, draw, you, canAct, send }: Props & { canAct: boolean }) {
  const rule = getRule(draw.ruleId)
  const action = rule.action
  const drawer = state.players.find((p) => p.id === draw.playerId)!
  const drawerName = nameOf(state, draw.playerId, you)

  const blocks: ReactNode[] = []

  if (action.kind === 'kingsCup') {
    blocks.push(
      draw.finalCup ? (
        <Callout key="cup" tone="fire">
          That's the last one. <b>{drawerName}</b> {draw.playerId === you ? 'have' : 'has'} to drink the whole cup.
        </Callout>
      ) : (
        <Callout key="cup">
          {kingsCupProgress(draw, state.cup.total)}
        </Callout>
      ),
    )
  }

  if (action.kind === 'master') {
    blocks.push(
      <Callout key="master">
        <b>{drawerName}</b> {draw.playerId === you ? 'are' : 'is'} the {MASTER_TITLES[action.key]}.
      </Callout>,
    )
  }

  if (action.kind === 'chooseDrinker' || action.kind === 'chooseMate') {
    if (draw.awaitingChoice) {
      blocks.push(
        canAct ? (
          <PlayerPicker
            key="pick"
            state={state}
            draw={draw}
            you={you}
            title={action.kind === 'chooseMate' ? 'Pick your mate' : 'Who drinks?'}
            onPick={(id) => send({ type: 'choose', targetId: id })}
          />
        ) : (
          <Waiting key="pick">
            {drawer.name} is picking {action.kind === 'chooseMate' ? 'a mate' : 'someone'}…
          </Waiting>
        ),
      )
    } else if (action.kind === 'chooseMate') {
      // Only happens when the whole table is already linked, so there's nobody left to pick.
      blocks.push(
        <Callout key="mates">
          Everyone's already mates, so <b>{draw.playerId === you ? 'you' : drawerName}</b> {draw.playerId === you ? 'drink' : 'drinks'}{' '}
          instead.
        </Callout>,
      )
    }
  }

  if (action.kind === 'timer') {
    blocks.push(
      <Countdown key="timer" endsAt={draw.timerEndsAt} seconds={action.seconds} isDrawer={canAct} drawerName={drawer.name} />,
    )
  }

  if (action.kind === 'writeRule') {
    blocks.push(
      draw.awaitingChoice ? (
        canAct ? (
          <RuleWriter key="rule" onSubmit={(text) => send({ type: 'writeRule', text })} />
        ) : (
          <Waiting key="rule">{drawer.name} is making a rule…</Waiting>
        )
      ) : (
        <Callout key="rule" tone="gold">
          <span className="label mb-1 block text-gold/80">New rule</span>
          <span className="font-display text-lg font-bold">“{draw.ruleText}”</span>
        </Callout>
      ),
    )
  }

  if (draw.drinkers.length > 0) {
    blocks.push(
      <div key="drinkers" className="space-y-2">
        <p className="label">Drinking</p>
        <div className="flex flex-wrap gap-2">
          {draw.drinkers.map((d) => {
            const p = state.players.find((x) => x.id === d.id)
            if (!p) return null
            return <PlayerTag key={d.id} player={p} note={d.viaMateOf ? `mate of ${nameOf(state, d.viaMateOf, you)}` : undefined} />
          })}
        </div>
      </div>,
    )
  } else if (action.kind === 'gender') {
    blocks.push(<Callout key="nobody">Nobody here. Lucky lot.</Callout>)
  }

  if (rule.goesRound) {
    const order = clockwiseFrom(state.players, draw.playerId)
    blocks.push(
      <div key="order" className="space-y-2">
        <p className="label">Order</p>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
          {order.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-smoke">→</span>}
              <span className={p.id === you ? 'font-bold text-gold' : 'font-semibold'}>{p.id === you ? 'You' : p.name}</span>
            </span>
          ))}
        </div>
      </div>,
    )
  }

  return <>{blocks}</>
}

/** A shared countdown (e.g. Hotseat). The server sets when it ends; every phone counts to that. */
function Countdown({
  endsAt,
  seconds,
  isDrawer,
  drawerName,
}: {
  endsAt?: number
  seconds: number
  isDrawer: boolean
  drawerName: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    if (!endsAt) return
    // Read the clock straight away: a stale reading would briefly show more than the full minute.
    setNow(serverNow())
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const id = setInterval(() => setNow(serverNow()), 200)
    return () => clearInterval(id)
  }, [endsAt])

  const totalMs = seconds * 1000
  const leftMs = endsAt ? Math.min(totalMs, Math.max(0, endsAt - now)) : totalMs
  const finished = !!endsAt && leftMs === 0
  const shown = Math.ceil(leftMs / 1000)
  const label = `${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, '0')}`

  useEffect(() => {
    if (finished) vibrate([200, 100, 200])
  }, [finished])

  // Ring drains as time runs out, and turns red for the last 10 seconds.
  const r = 44
  const circumference = 2 * Math.PI * r
  const hot = finished || (!!endsAt && leftMs <= 10_000)

  return (
    <div ref={ref} className="flex scroll-mb-28 items-center gap-4 rounded-2xl border border-char bg-char/60 p-3 pr-4">
      <div className="relative h-20 w-20 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-ash)" strokeWidth="7" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={hot ? 'var(--color-flame)' : 'var(--color-ember)'}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - leftMs / totalMs)}
            style={{ transition: 'stroke-dashoffset 0.2s linear' }}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center font-display text-xl font-extrabold tabular-nums ${
            finished ? 'text-flame' : 'text-cream'
          }`}
        >
          {label}
        </span>
      </div>
      <p className={finished ? 'font-display text-xl font-bold text-flame' : 'text-sm text-cream/80'}>
        {finished
          ? "Time's up!"
          : endsAt
            ? 'Ask away. Every question has to be answered.'
            : isDrawer
              ? "Tap Start the timer when everyone's ready."
              : `Waiting for ${drawerName} to start the clock…`}
      </p>
    </div>
  )
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth']

/** e.g. "The second King has been drawn. Only 2 more remain." */
function kingsCupProgress(draw: Draw, total: number) {
  const n = draw.cupNumber ?? 1
  const left = total - n
  const card = RANK_NAMES[draw.card.rank]
  return `The ${ORDINALS[n - 1] ?? `${n}th`} ${card} has been drawn. Only ${left} more ${left === 1 ? 'remains' : 'remain'}.`
}

function Callout({ children, tone }: { children: ReactNode; tone?: 'fire' | 'gold' }) {
  const styles =
    tone === 'fire'
      ? 'border-flame/50 bg-gradient-to-br from-flame/25 to-ember/10 text-cream'
      : tone === 'gold'
        ? 'border-gold/40 bg-gold/10 text-cream'
        : 'border-char bg-char/60 text-cream/90'
  return <div className={`rounded-2xl border p-4 text-[15px] leading-relaxed ${styles}`}>{children}</div>
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-ash p-4 text-smoke">
      <motion.span
        className="h-2 w-2 rounded-full bg-ember"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      {children}
    </div>
  )
}

function PlayerPicker({
  state,
  draw,
  you,
  title,
  onPick,
}: {
  state: GameState
  draw: Draw
  you: string
  title: string
  onPick: (id: string) => void
}) {
  const action = getRule(draw.ruleId).action.kind
  const existingMates = matesOf(state, draw.playerId)
  const options = state.players.filter((p) => p.id !== draw.playerId && !(action === 'chooseMate' && existingMates.includes(p.id)))

  // First tap picks, second tap on the same person confirms, so a fat finger can't end the turn.
  const [picked, setPicked] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const tap = (id: string) => {
    if (sent) return
    if (picked !== id) return setPicked(id)
    setSent(true)
    onPick(id)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="label">{title}</p>
        <p className={`text-xs font-semibold transition-opacity ${picked ? 'text-ember opacity-100' : 'opacity-0'}`}>
          Tap again to confirm
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((p) => {
          const isPicked = p.id === picked
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => tap(p.id)}
              className={`flex items-center gap-2.5 rounded-2xl border p-2.5 text-left font-semibold transition active:scale-[0.97] ${
                isPicked ? 'border-ember bg-ember/15 shadow-[0_0_0_1px_var(--color-ember)]' : 'border-ash bg-char'
              }`}
            >
              <Avatar player={p} size={34} />
              <span className="min-w-0 flex-1 truncate">{p.id === you ? 'You' : p.name}</span>
              {isPicked && <span className="shrink-0 text-xs font-bold text-ember">{sent ? '…' : 'Sure?'}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RuleWriter({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) onSubmit(text)
  }
  return (
    <form className="space-y-2" onSubmit={submit}>
      <p className="label">Your rule</p>
      <textarea
        className="field h-auto min-h-24 resize-none py-3 leading-snug"
        placeholder="e.g. No saying the word “drink”"
        maxLength={140}
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="btn-secondary w-full" disabled={!text.trim()}>
        Set the rule
      </button>
    </form>
  )
}
