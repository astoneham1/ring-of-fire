import { useEffect, useState, type FormEvent } from 'react'
import type { Gender } from '../../shared/types.ts'
import { Table } from '../components/Table.tsx'
import { deviceToken, loadLastRules, loadProfile, saveProfile } from '../lib/storage.ts'
import type { Send } from '../lib/useGame.ts'

function codeFromUrl(): string {
  const code = new URLSearchParams(location.search).get('join') ?? ''
  return code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}

export function Home({
  send,
  notify,
  pending,
  prewarm,
}: {
  send: Send
  notify: (msg: string) => void
  /** Which button is waiting on the server, if any. */
  pending: 'host' | 'join' | null
  /** Opens a connection ahead of time so hosting is quick. */
  prewarm: () => void
}) {
  const profile = loadProfile()
  const [name, setName] = useState(profile.name)
  const [gender, setGender] = useState<Gender | null>(profile.gender)
  const [code, setCode] = useState(codeFromUrl)
  const joining = code.length > 0

  // Get a connection ready while they type their name (and again if the phone dropped it).
  useEffect(() => {
    prewarm()
    const again = () => document.visibilityState === 'visible' && prewarm()
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [prewarm])

  const ready = () => {
    if (!name.trim()) {
      notify('Enter your name first')
      return false
    }
    if (!gender) {
      notify('Pick guy or girl (for the 5s and 6s)')
      return false
    }
    saveProfile({ name: name.trim(), gender })
    return true
  }

  const host = () => {
    if (pending) return
    if (ready()) send({ type: 'create', token: deviceToken(), name, gender: gender!, rules: loadLastRules() })
  }

  const join = (e?: FormEvent) => {
    e?.preventDefault()
    if (pending) return
    if (code.length !== 4) return notify('Game codes are 4 letters')
    if (ready()) send({ type: 'join', token: deviceToken(), code, name, gender: gender! })
  }

  return (
    <main className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-4">
      {/* The table leaves room for seats around the ring; crop that off, and shrink on short screens. */}
      <div className="relative mx-auto mt-2 aspect-square opacity-90" style={{ width: 'min(46vw, 22dvh, 200px)' }}>
        <div className="absolute" style={{ inset: '-27%' }}>
          <Table players={[]} viewerId={null} cupFill={0.55} showSeats={false} seed={3} />
        </div>
      </div>

      <header className="relative mt-5 text-center short:mt-3">
        <h1 className="font-display text-[2.6rem] leading-none font-extrabold tracking-tight">
          Ring of <span className="text-ember">Fire</span>
        </h1>
        <p className="mt-1.5 text-smoke short:hidden">Forgot the cards? Not a problem.</p>
      </header>

      <section className="mt-6 space-y-3 short:mt-4 short:space-y-2">
        <label className="block">
          <span className="label mb-1.5 block">Your name</span>
          <input
            className="field"
            value={name}
            maxLength={20}
            autoComplete="nickname"
            placeholder="e.g. Jamie"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div>
          <span className="label mb-1.5 block">Your gender</span>
          <div className="grid grid-cols-2 gap-2">
            {(['boy', 'girl'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={`h-12 rounded-2xl border font-semibold transition ${
                  gender === g ? 'border-ember bg-ember/15 text-cream' : 'border-ash bg-coal text-smoke'
                }`}
              >
                {g === 'boy' ? 'Guy' : 'Girl'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-auto space-y-3 pt-6 short:space-y-2 short:pt-4">
        {!joining && (
          <>
            <button type="button" className="btn-primary w-full" aria-busy={pending === 'host'} onClick={host}>
              {pending === 'host' ? (
                <>
                  <Spinner /> Setting up…
                </>
              ) : (
                'Host a game'
              )}
            </button>
            {/* Extra room on top so the button's raised edge doesn't crowd the divider. */}
            <div className="flex items-center gap-3 pt-3 text-xs font-semibold tracking-[0.14em] text-smoke uppercase short:pt-2">
              <span className="h-px flex-1 bg-char" />
              or join one
              <span className="h-px flex-1 bg-char" />
            </div>
          </>
        )}
        <form className="flex gap-2" onSubmit={join}>
          <input
            className="field flex-1 text-center font-display text-2xl font-bold tracking-[0.5em] uppercase placeholder:text-base placeholder:font-sans placeholder:font-normal placeholder:tracking-normal"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="Game code"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
          <button type="submit" className={joining ? 'btn-primary' : 'btn-secondary'} aria-busy={pending === 'join'}>
            {pending === 'join' ? <Spinner /> : 'Join'}
          </button>
        </form>
        {joining && (
          <button type="button" className="btn-ghost w-full" onClick={() => setCode('')}>
            Host your own game instead
          </button>
        )}
      </section>
    </main>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" aria-label="Loading">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
