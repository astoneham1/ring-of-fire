import { motion } from 'motion/react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { MASTER_TITLES, RANK_NAMES, describe, getRule } from '../../shared/rules.ts'
import type { Draw, GameState } from '../../shared/types.ts'
import { clockwiseFrom, matesOf, nameOf } from '../lib/players.ts'
import type { Send } from '../lib/useGame.ts'
import { Avatar, PlayerTag } from './Avatar.tsx'
import { CardBack, CardFace } from './PlayingCard.tsx'

interface Props {
  state: GameState
  draw: Draw
  you: string
  send: Send
}

export function DrawSheet({ state, draw, you, send }: Props) {
  const rule = getRule(draw.ruleId)
  const isDrawer = draw.playerId === you
  const isHost = state.hostId === you
  const canAct = isDrawer || isHost
  const drawerName = nameOf(state, draw.playerId)
  const blocked = draw.awaitingChoice && (isDrawer || !isHost)

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
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <p className="label text-center">{isDrawer ? 'You drew' : `${drawerName} drew`}</p>

        <FlipCard draw={draw} />

        <div className="mt-5 text-center">
          <p className="label">{RANK_NAMES[draw.card.rank]}</p>
          <h2 className="font-display text-4xl leading-tight font-extrabold tracking-tight">{rule.name}</h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-cream/80">
            {describe(rule, drawerName, isDrawer)}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <Outcome state={state} draw={draw} you={you} canAct={canAct} send={send} />
        </div>

        <div className="sticky bottom-0 mt-6 bg-coal pt-2">
          {canAct ? (
            <button type="button" className="btn-primary w-full" disabled={blocked} onClick={() => send({ type: 'done' })}>
              {isDrawer ? 'Done' : `Done for ${drawerName}`}
            </button>
          ) : (
            <div className="flex h-14 items-center justify-center rounded-2xl border border-char text-smoke">
              Waiting for {drawerName} to finish…
            </div>
          )}
        </div>
      </motion.section>
    </motion.div>
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
          Cup card <b>{draw.cupNumber}</b> of {state.cup.total}. {state.cup.total - (draw.cupNumber ?? 0)} to go until someone
          downs it.
        </Callout>
      ),
    )
  }

  if (action.kind === 'master') {
    const prev = draw.previousMasterId && draw.previousMasterId !== draw.playerId ? nameOf(state, draw.previousMasterId, you) : null
    blocks.push(
      <Callout key="master">
        <b>{drawerName}</b> {draw.playerId === you ? 'are' : 'is'} now {MASTER_TITLES[action.key]}
        {prev && <span className="text-smoke"> (taking over from {prev})</span>}.
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
    } else if (action.kind === 'chooseMate' && draw.targetId) {
      const group = [draw.playerId, ...matesOf(state, draw.playerId)]
      blocks.push(
        <div key="mates" className="space-y-2">
          <p className="label">Drinking mates</p>
          <div className="flex flex-wrap gap-2">
            {group.map((id) => {
              const p = state.players.find((x) => x.id === id)
              return p && <PlayerTag key={id} player={p} />
            })}
          </div>
          {group.length > 2 && <p className="text-sm text-smoke">Mates of mates count, so all {group.length} of you are linked.</p>}
        </div>,
      )
    }
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

  if (options.length === 0) {
    return <Callout>Everyone's already mates.</Callout>
  }

  return (
    <div className="space-y-2">
      <p className="label">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            className="flex items-center gap-2.5 rounded-2xl border border-ash bg-char p-2.5 text-left font-semibold transition active:scale-[0.97] active:border-ember"
          >
            <Avatar player={p} size={34} />
            <span className="truncate">{p.id === you ? 'You' : p.name}</span>
          </button>
        ))}
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
