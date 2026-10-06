import { motion } from 'motion/react'
import { useId } from 'react'

/** The cup in the middle. Fills up as King's Cup cards are drawn. */
export function Cup({ fill, className = '' }: { fill: number; className?: string }) {
  const id = useId()
  const level = Math.max(0, Math.min(1, fill))
  // Glass interior spans y=14..90 in the 100x100 viewBox.
  const top = 91 - level * 77

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <clipPath id={`${id}-inside`}>
          <path d="M24 14 H76 L69 86 Q68 90 64 90 H36 Q32 90 31 86 Z" />
        </clipPath>
        <linearGradient id={`${id}-liquid`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f4c06a" />
          <stop offset="1" stopColor="#d9792a" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-inside)`}>
        <rect x="0" y="0" width="100" height="100" fill="#ffffff" fillOpacity="0.05" />
        <motion.rect
          x="0"
          width="100"
          height="100"
          fill={`url(#${id}-liquid)`}
          initial={false}
          animate={{ y: top }}
          transition={{ type: 'spring', stiffness: 60, damping: 14 }}
        />
        {level > 0 && (
          <motion.rect
            x="0"
            width="100"
            height="5"
            fill="#fbf5ec"
            fillOpacity="0.85"
            initial={false}
            animate={{ y: top - 3 }}
            transition={{ type: 'spring', stiffness: 60, damping: 14 }}
          />
        )}
      </g>
      <path
        d="M24 14 H76 L69 86 Q68 90 64 90 H36 Q32 90 31 86 Z"
        fill="none"
        stroke="#f6ede2"
        strokeOpacity="0.55"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M30 22 L35 80" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
