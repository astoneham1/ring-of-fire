import type { GameState, Player } from '../../shared/types.ts'

const AVATAR_COLORS = ['#ff7a2f', '#f4c06a', '#e8452c', '#5fb3a1', '#d98aa8', '#8aa8d8', '#c9a27e', '#9bc06a']

export function avatarColor(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase()
}

export function nameOf(state: GameState, id: string | null | undefined, you?: string | null): string {
  if (id && id === you) return 'You'
  return state.players.find((p) => p.id === id)?.name ?? 'Someone'
}

/** Players in turn order, starting with `id` and going clockwise. */
export function clockwiseFrom(players: Player[], id: string): Player[] {
  const i = players.findIndex((p) => p.id === id)
  if (i < 0) return players
  return [...players.slice(i), ...players.slice(0, i)]
}

export function matesOf(state: GameState, id: string): string[] {
  return state.mateGroups.find((g) => g.includes(id))?.filter((m) => m !== id) ?? []
}

/** Small deterministic PRNG so every phone scatters the ring identically. */
export function seeded(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Unsupported (iOS) — that's fine.
  }
}
