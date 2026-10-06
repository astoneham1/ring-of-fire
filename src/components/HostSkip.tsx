import { useEffect, useState } from 'react'

/**
 * The host's override for a stuck turn. Deliberately low-key, and it takes two taps
 * so nobody skips someone by accident.
 */
export function HostSkip({ label, onSkip }: { label: string; onSkip: () => void }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <button
      type="button"
      onClick={() => (armed ? onSkip() : setArmed(true))}
      className={`inline-flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 text-sm font-semibold transition ${
        armed ? 'border-flame text-flame' : 'border-ash text-smoke'
      }`}
    >
      <span className="rounded bg-gold/15 px-1.5 py-px text-[10px] font-bold tracking-wider text-gold">HOST</span>
      {armed ? 'Tap again to skip' : label}
    </button>
  )
}
