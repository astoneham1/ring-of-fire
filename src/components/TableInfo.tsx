import { MASTER_TITLES, getRule } from '../../shared/rules.ts'
import type { GameState, MasterKey } from '../../shared/types.ts'
import { nameOf } from '../lib/players.ts'
import type { Send } from '../lib/useGame.ts'
import { Avatar } from './Avatar.tsx'
import { CardChip } from './PlayingCard.tsx'

/** Everything that's in play: masters, mates, house rules and the last card. */
export function TableInfo({ state, you, send }: { state: GameState; you: string; send: Send }) {
  const isHost = state.hostId === you
  const masters = (Object.entries(state.masters) as [MasterKey, string][]).filter(([, id]) => id)
  const last = state.history[0]
  const empty = masters.length === 0 && state.mateGroups.length === 0 && state.houseRules.length === 0 && !last

  if (empty) {
    return <p className="px-2 text-center text-sm text-smoke">Masters, mates and rules will show up here as the game goes on.</p>
  }

  return (
    <div className="space-y-3">
      {masters.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {masters.map(([key, id]) => {
            const p = state.players.find((x) => x.id === id)
            return (
              <div key={key} className="panel flex items-center gap-2.5 p-3">
                {p && <Avatar player={p} size={32} />}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-wide text-smoke uppercase">{MASTER_TITLES[key]}</p>
                  <p className="truncate font-semibold">{nameOf(state, id, you)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

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
                <span className="mt-0.5 font-display font-bold text-gold">{i + 1}</span>
                <span className="flex-1">
                  {rule.text}
                  <span className="block text-xs text-smoke">by {nameOf(state, rule.by, you)}</span>
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
        </p>
      )}
    </div>
  )
}
