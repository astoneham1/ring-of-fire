import { getRule } from '../../shared/rules.ts'
import type { GameState } from '../../shared/types.ts'
import { nameOf } from '../lib/players.ts'
import type { Send } from '../lib/useGame.ts'
import { CardChip } from './PlayingCard.tsx'

/** Everything that's in play: mates, house rules and the last card. */
export function TableInfo({
  state,
  you,
  send,
  emptyHint = true,
}: {
  state: GameState
  you: string
  send: Send
  /** Show a placeholder line when nothing's in play yet. */
  emptyHint?: boolean
}) {
  const isHost = state.hostId === you
  const last = state.history[0]
  const empty = state.mateGroups.length === 0 && state.houseRules.length === 0 && !last

  if (empty) {
    if (!emptyHint) return null
    return <p className="px-2 text-center text-sm text-smoke">Mates and rules will show up here as the game goes on.</p>
  }

  return (
    <div className="space-y-3">
      {state.mateGroups.length > 0 && (
        <div className="panel p-4">
          <p className="label mb-2">Mates</p>
          <ul className="space-y-2">
            {state.mateGroups.map((group) => (
              <li key={group.join()} className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                {group.map((id, i) => (
                  <span key={id} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-ember">+</span>}
                    <span className={id === you ? 'text-gold' : ''}>{nameOf(state, id, you)}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.houseRules.length > 0 && (
        <div className="panel p-4">
          <p className="label mb-2">Rules in play</p>
          <ol className="space-y-2">
            {state.houseRules.map((rule, i) => (
              <li key={rule.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 w-5 shrink-0 text-right font-display font-bold text-gold tabular-nums">{i + 1}</span>
                <span className="flex-1">
                  {rule.text}
                  {state.players.some((p) => p.id === rule.by) && (
                    <span className="block text-xs text-smoke">by {nameOf(state, rule.by, you)}</span>
                  )}
                </span>
                {isHost && (
                  <button
                    type="button"
                    aria-label="Remove rule"
                    className="-m-2 p-2 text-smoke"
                    onClick={() => send({ type: 'removeHouseRule', id: rule.id })}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {last && (
        <p className="flex items-center justify-center gap-2 text-sm text-smoke">
          Last: {nameOf(state, last.playerId, you)} drew <CardChip card={last.card} /> {getRule(last.ruleId).name}
          {last.targetId && <span>· {lastPickText(state, last.ruleId, last.targetId, you)}</span>}
        </p>
      )}
    </div>
  )
}

function lastPickText(state: GameState, ruleId: string, targetId: string, you: string) {
  const isYou = targetId === you
  if (getRule(ruleId).action.kind === 'chooseMate') return `mates with ${isYou ? 'you' : nameOf(state, targetId)}`
  return isYou ? 'you drink' : `${nameOf(state, targetId)} drinks`
}
