import { AnimatePresence, motion } from 'motion/react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { DEFAULT_RULES, RULE_LIBRARY, getRule, ruleName } from '../../shared/rules.ts'
import { RANKS, type GameState } from '../../shared/types.ts'
import { RankBadge } from '../components/PlayingCard.tsx'
import { SeatPanel, useSeatSelection } from '../components/SeatPanel.tsx'
import { Table } from '../components/Table.tsx'
import { nameOf } from '../lib/players.ts'
import { saveLastRules } from '../lib/storage.ts'
import type { Send } from '../lib/useGame.ts'

export function Lobby({ state, you, send, notify }: { state: GameState; you: string; send: Send; notify: (m: string) => void }) {
  const isHost = state.hostId === you
  const seats = useSeatSelection(send, state.players)
  const selectedPlayer = state.players.find((p) => p.id === seats.selected)
  const [showQr, setShowQr] = useState(false)
  const rulesRef = useRef<HTMLHeadingElement>(null)
  const footerRef = useRef<HTMLElement>(null)
  const rulesHidden = useHiddenBehind(rulesRef, footerRef)
  const link = `${location.origin}/?join=${state.code}`
  const onLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname)
  const rulesChanged = RANKS.some((r) => state.rules[r] !== DEFAULT_RULES[r])
  const unusedRules = RULE_LIBRARY.filter((rule) => !RANKS.some((r) => state.rules[r] === rule.id))

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Ring of Fire', text: `Join my game: ${state.code}`, url: link })
      else {
        await navigator.clipboard.writeText(link)
        notify('Invite link copied')
      }
    } catch {
      // Share sheet dismissed.
    }
  }


  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-36">
      <header className="flex items-start justify-between gap-3">
        <div>
          <span className="label">Game code</span>
          <div className="font-display text-5xl leading-none font-extrabold tracking-[0.12em] text-gold">{state.code}</div>
        </div>
        <div className="flex gap-2 pt-4">
          <button type="button" className="btn-secondary h-11 px-4 text-base" onClick={() => setShowQr((v) => !v)}>
            {showQr ? 'Hide QR' : 'QR'}
          </button>
          <button type="button" className="btn-secondary h-11 px-4 text-base" onClick={share}>
            Invite
          </button>
        </div>
      </header>

      <AnimatePresence>
        {showQr && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex flex-col items-center gap-3 rounded-3xl bg-paper p-5">
              <QRCodeSVG value={link} size={196} bgColor="#fbf5ec" fgColor="#140e0c" />
              <span className="text-sm font-medium text-suit-black/70">Scan to join</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {onLocalhost && (
        <p className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 p-3 text-sm text-gold">
          You're on localhost, so phones can't use this link. Open the Network address that Vite printed in the
          terminal instead.
        </p>
      )}

      <section className="mt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold">Seats</h2>
          <span className="text-sm text-smoke">{state.players.length} in</span>
        </div>
        <p className="mt-1 text-sm text-smoke">
          {isHost
            ? 'Tap two people to swap their seats, or tap someone to make them host or remove them.'
            : 'The host is arranging the seats.'}
        </p>
        {/* Sized by screen height too, so the house rules peek out above the footer. */}
        <div
          ref={seats.tableRef}
          className="mx-auto mt-1 scroll-mb-48"
          style={{ width: 'min(100%, 380px, max(260px, calc(100dvh - 380px)))' }}
        >
          <Table
            players={state.players}
            viewerId={you}
            hostId={state.hostId}
            seed={state.gameId}
            cupLabel="clockwise ↻"
            selectedSeat={seats.selected}
            onSeatTap={isHost ? seats.tapSeat : undefined}
          />
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 ref={rulesRef} className="scroll-mt-4 font-display text-xl font-bold">
            House rules
          </h2>
          {isHost && rulesChanged && (
            <button type="button" className="text-sm font-semibold text-ember" onClick={() => send({ type: 'resetRules' })}>
              Reset
            </button>
          )}
        </div>
        <ul className="panel mt-3 divide-y divide-char">
          {RANKS.map((rank) => {
            const rule = getRule(state.rules[rank])
            // Same rule on more than one card is allowed, but flag it in case it was a slip.
            const alsoOn = RANKS.filter((r) => r !== rank && state.rules[r] === state.rules[rank])
            return (
              <li key={rank} className="flex items-center gap-3 px-3 py-2.5">
                <RankBadge rank={rank} />
                {isHost ? (
                  <div className="relative min-w-0 flex-1">
                    <select
                      className="w-full appearance-none truncate rounded-xl bg-transparent py-1 pr-7 font-semibold text-cream focus:outline-none"
                      value={state.rules[rank]}
                      onChange={(e) => send({ type: 'setRule', rank, ruleId: e.target.value })}
                    >
                      {RULE_LIBRARY.map((r) => (
                        <option key={r.id} value={r.id}>
                          {ruleName(r, rank)}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-smoke">▾</span>
                    <p className="truncate text-xs text-smoke">{rule.summary}</p>
                    {alsoOn.length > 0 && <DuplicateNote ranks={alsoOn} />}
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{ruleName(rule, rank)}</p>
                    <p className="truncate text-xs text-smoke">{rule.summary}</p>
                    {alsoOn.length > 0 && <DuplicateNote ranks={alsoOn} />}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {unusedRules.length > 0 && (
          <p className="mt-3 px-1 text-sm leading-relaxed text-smoke">
            <span className="label mr-2">Not in use</span>
            {unusedRules.map((r) => r.name).join(' · ')}
          </p>
        )}
      </section>

      <AnimatePresence>
        {selectedPlayer && (
          <SeatPanel
            key={selectedPlayer.id}
            player={selectedPlayer}
            isYou={selectedPlayer.id === you}
            onMakeHost={() => {
              send({ type: 'makeHost', playerId: selectedPlayer.id })
              seats.clear()
            }}
            onRemove={() => {
              send({ type: 'kick', playerId: selectedPlayer.id })
              seats.clear()
            }}
            onClose={seats.clear}
          />
        )}
      </AnimatePresence>

      <footer
        ref={footerRef}
        className="safe-bottom fixed inset-x-0 bottom-0 bg-gradient-to-t from-ink from-75% to-transparent px-4 pt-8"
      >
        <div className="mx-auto flex max-w-md flex-col gap-1">
          {isHost ? (
            <button
              type="button"
              className="btn-primary w-full"
              disabled={state.players.length < 2}
              onClick={() => {
                // Remember these rules for the next game this phone hosts.
                saveLastRules(state.rules)
                send({ type: 'start' })
              }}
            >
              {state.players.length < 2 ? 'Waiting for players…' : `Start with ${state.players.length} players`}
            </button>
          ) : (
            <div className="flex h-14 items-center justify-center rounded-2xl border border-char text-smoke">
              Waiting for {nameOf(state, state.hostId)} to start…
            </div>
          )}
          <div className="flex justify-center">
            <button type="button" className="btn-ghost" onClick={() => send({ type: 'leave' })}>
              Leave game
            </button>
            {rulesHidden && (
              <button
                type="button"
                className="btn-ghost text-cream"
                onClick={() => rulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                House rules ↓
              </button>
            )}
          </div>
        </div>
      </footer>
    </main>
  )
}

/** True while `target` sits below the top of `cover` (i.e. hidden behind the fixed footer). */
function useHiddenBehind(target: RefObject<HTMLElement | null>, cover: RefObject<HTMLElement | null>) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const check = () => {
      if (!target.current || !cover.current) return
      setHidden(target.current.getBoundingClientRect().bottom > cover.current.getBoundingClientRect().top + 24)
    }
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    // Content above can change height (QR code, players joining), so re-check on layout changes too.
    const observer = new ResizeObserver(check)
    observer.observe(document.body)
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      observer.disconnect()
    }
  }, [target, cover])
  return hidden
}

function DuplicateNote({ ranks }: { ranks: string[] }) {
  return (
    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-gold">
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" aria-hidden>
        <path d="M8 1.5 15 14H1z" fill="currentColor" />
        <path d="M8 6v3.5M8 11.4v.1" stroke="var(--color-ink)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Also on {ranks.join(', ')}
    </p>
  )
}
