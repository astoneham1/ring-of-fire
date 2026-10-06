import type { Gender } from '../../shared/types.ts'

// Storage can throw (private mode, blocked site data), so every access is guarded.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Not fatal: the player just won't be remembered.
  }
}

function randomToken(): string {
  // crypto.randomUUID needs a secure context, which a phone on http://192.168.x.x isn't.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

let cachedToken: string | null = null

/** A private per-device id the server uses to put you back in your seat after a reconnect. */
export function deviceToken(): string {
  if (cachedToken) return cachedToken
  cachedToken = read('rof:token') ?? randomToken()
  write('rof:token', cachedToken)
  return cachedToken
}

export interface Profile {
  name: string
  gender: Gender | null
}

export function loadProfile(): Profile {
  try {
    const parsed = JSON.parse(read('rof:profile') ?? '{}')
    return { name: typeof parsed.name === 'string' ? parsed.name : '', gender: parsed.gender ?? null }
  } catch {
    return { name: '', gender: null }
  }
}

export function saveProfile(profile: Profile) {
  write('rof:profile', JSON.stringify(profile))
}

export function loadRoomCode(): string | null {
  return read('rof:room')
}

export function saveRoomCode(code: string | null) {
  write('rof:room', code)
}
