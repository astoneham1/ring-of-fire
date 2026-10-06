import type { Player } from '../../shared/types.ts'
import { avatarColor, initials } from '../lib/players.ts'

export function Avatar({
  player,
  size = 40,
  className = '',
}: {
  player: Player
  /** Pixels, or any CSS length. */
  size?: number | string
  className?: string
}) {
  const fontSize = typeof size === 'number' ? size * 0.38 : `calc(${size} * 0.38)`
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-ink ${
        player.connected ? '' : 'opacity-40 grayscale'
      } ${className}`}
      style={{ width: size, height: size, fontSize, background: avatarColor(player.id) }}
    >
      {initials(player.name)}
    </span>
  )
}

export function PlayerTag({ player, note }: { player: Player; note?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ash bg-char py-1 pr-3 pl-1">
      <Avatar player={player} size={26} />
      <span className="text-sm font-semibold">{player.name}</span>
      {note && <span className="text-xs text-smoke">{note}</span>}
    </span>
  )
}
