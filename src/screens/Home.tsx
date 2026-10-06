import { useState, type FormEvent } from 'react'
import type { Gender } from '../../shared/types.ts'
import { Table } from '../components/Table.tsx'
import { deviceToken, loadLastRules, loadProfile, saveProfile } from '../lib/storage.ts'
import type { Send } from '../lib/useGame.ts'

function codeFromUrl(): string {
  const code = new URLSearchParams(location.search).get('join') ?? ''
  return code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}

export function Home({ send, notify }: { send: Send; notify: (msg: string) => void }) {
  const profile = loadProfile()
  const [name, setName] = useState(profile.name)
  const [gender, setGender] = useState<Gender | null>(profile.gender)
  const [code, setCode] = useState(codeFromUrl)
  const joining = code.length > 0

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
    if (ready()) send({ type: 'create', token: deviceToken(), name, gender: gender!, rules: loadLastRules() })
  }

  const join = (e?: FormEvent) => {
    e?.preventDefault()
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
            <button type="button" className="btn-primary w-full" onClick={host}>
              Host a game
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
            spellCheck={false}
            placeholder="Game code"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
          <button type="submit" className={joining ? 'btn-primary' : 'btn-secondary'}>
            Join
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
