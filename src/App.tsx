import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Toast } from './components/Overlays.tsx'
import { useGame } from './lib/useGame.ts'
import { Finished } from './screens/Finished.tsx'
import { Game } from './screens/Game.tsx'
import { Home } from './screens/Home.tsx'
import { Lobby } from './screens/Lobby.tsx'

export function App() {
  const { state, you, status, notice, resuming, send, notify } = useGame()

  // Let everyone know when someone leaves or is removed.
  const lastPlayers = useRef(state?.players)
  useEffect(() => {
    const before = lastPlayers.current
    lastPlayers.current = state?.players
    if (!state || !before || state.phase === 'lobby') return
    const gone = before.filter((p) => !state.players.some((q) => q.id === p.id))
    if (gone.length) notify(`${gone.map((p) => p.name).join(' and ')} left the game`)
  }, [state, notify])

  // Once you're in a game, drop ?join=CODE so a refresh doesn't try to rejoin a stale code.
  useEffect(() => {
    if (state && location.search) history.replaceState(null, '', location.pathname)
  }, [state])

  let screen
  if (state && you) {
    if (state.phase === 'lobby') screen = <Lobby key="lobby" state={state} you={you} send={send} notify={notify} />
    else if (state.phase === 'playing') screen = <Game key={`game-${state.gameId}`} state={state} you={you} send={send} />
    else screen = <Finished key="finished" state={state} you={you} send={send} />
  } else if (resuming) {
    screen = (
      <div key="loading" className="flex min-h-dvh items-center justify-center text-smoke">
        Finding your seat…
      </div>
    )
  } else {
    screen = <Home key="home" send={send} notify={notify} />
  }

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={screen.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {screen}
        </motion.div>
      </AnimatePresence>
      <Toast message={notice} />
      {status !== 'open' && (state || resuming) && (
        <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center">
          <span className="mb-2 rounded-full bg-flame px-4 py-1.5 text-sm font-semibold text-cream shadow-lg">Reconnecting…</span>
        </div>
      )}
    </>
  )
}
