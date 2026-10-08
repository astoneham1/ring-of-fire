import { useCallback, useEffect, useRef, useState } from 'react'
import { randomCode, type ClientMessage, type GameState, type ServerMessage } from '../../shared/types.ts'
import { deviceToken, loadRoomCode, saveRoomCode } from './storage.ts'

const WS_BASE = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
/** Phones and proxies drop quiet sockets, so ping every so often. The server answers without waking up. */
const KEEPALIVE_MS = 25_000

let clockOffset = 0

/** The server's current time, as best we can tell. Use this for shared countdowns. */
export function serverNow(): number {
  return Date.now() + clockOffset
}

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed'

export interface Notice {
  id: number
  message: string
}

/**
 * Each game room is its own server (a Cloudflare Durable Object) at `/ws/CODE`, so a socket is only
 * opened once we know which room we're in: when hosting, joining, or coming back to a saved game.
 */
export function useGame() {
  const [state, setState] = useState<GameState | null>(null)
  const [you, setYou] = useState<string | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [notice, setNotice] = useState<Notice | null>(null)
  /** Set while hosting or joining, until the room answers. */
  const [pending, setPending] = useState<'host' | 'join' | null>(null)
  // Until the first resume attempt settles we don't know whether to show the home screen.
  const [resuming, setResuming] = useState(() => loadRoomCode() !== null)

  const wsRef = useRef<WebSocket | null>(null)
  /** The room we want to be connected to. Null once we've left. */
  const codeRef = useRef<string | null>(null)
  const queue = useRef<ClientMessage[]>([])
  /** What to send when (re)connecting: create/join until we're in, then resume. */
  const firstMsg = useRef<ClientMessage | null>(null)
  const codeTries = useRef(0)
  /** A connection opened ahead of time to a fresh code, so hosting doesn't wait for it. */
  const warm = useRef<{ code: string; ws: WebSocket } | null>(null)
  const retry = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const notify = useCallback((message: string) => setNotice({ id: Date.now(), message }), [])

  const disconnect = useCallback(() => {
    codeRef.current = null
    clearTimeout(retryTimer.current)
    queue.current = []
    firstMsg.current = null
    const ws = wsRef.current
    wsRef.current = null
    ws?.close()
    setStatus('idle')
    setPending(null)
  }, [])

  /** Opens a socket to a room. `first` is sent as soon as it's open (create, join or resume). */
  const connect = useCallback(
    /** `existing`: an already-open socket to this code (the pre-warmed one) to use instead of a new one. */
    (code: string, first: ClientMessage, existing?: WebSocket) => {
      clearTimeout(retryTimer.current)
      wsRef.current?.close()
      codeRef.current = code
      firstMsg.current = first
      queue.current = [first]
      setStatus('connecting')

      const ws = existing ?? new WebSocket(`${WS_BASE}/ws/${code}`)
      wsRef.current = ws

      const opened = () => {
        retry.current = 0
        setStatus('open')
        for (const msg of queue.current.splice(0)) ws.send(JSON.stringify(msg))
      }
      if (ws.readyState === WebSocket.OPEN) opened()
      else ws.onopen = opened

      ws.onmessage = (event) => {
        if (event.data === 'pong') return
        const msg = JSON.parse(event.data) as ServerMessage
        if (msg.type === 'state') {
          // We're in: from now on, reconnecting means getting back into this seat.
          firstMsg.current = { type: 'resume', token: deviceToken(), code: msg.state.code }
          setPending(null)
          clockOffset = msg.now - Date.now()
          setState(msg.state)
          setYou(msg.you)
          saveRoomCode(msg.state.code)
          setResuming(false)
        } else if (msg.type === 'error') {
          if (!msg.fatal && firstMsg.current?.type !== 'resume') {
            // Hosting or joining didn't work (e.g. name taken): back to the home screen's form.
            disconnect()
          }
          if (msg.fatal) {
            disconnect()
            saveRoomCode(null)
            setState(null)
            setResuming(false)
          }
          notify(msg.message)
        } else if (msg.type === 'codeTaken') {
          // Someone already has this code. Very rare, so just try another.
          const create = firstMsg.current
          if (create?.type === 'create' && codeTries.current++ < 10) connect(randomCode(), create)
          else {
            disconnect()
            notify("Couldn't set up a game. Try again")
          }
        } else if (msg.type === 'left') {
          disconnect()
          saveRoomCode(null)
          setState(null)
        }
      }

      ws.onclose = () => {
        if (wsRef.current !== ws) return
        wsRef.current = null
        if (codeRef.current !== code) return
        // Dropped unexpectedly (screen locked, bad signal): come back to the same seat.
        setStatus('closed')
        const delay = Math.min(5000, 500 * 2 ** retry.current++)
        const again = firstMsg.current ?? { type: 'resume', token: deviceToken(), code }
        retryTimer.current = setTimeout(() => connect(code, again), delay)
      }
    },
    [disconnect, notify],
  )

  useEffect(() => {
    const saved = loadRoomCode()
    if (saved) connect(saved, { type: 'resume', token: deviceToken(), code: saved })

    // Phones kill sockets when the screen locks. Reconnect as soon as we're back.
    const onVisible = () => {
      const code = codeRef.current
      const ws = wsRef.current
      if (document.visibilityState !== 'visible' || !code) return
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
      connect(code, { type: 'resume', token: deviceToken(), code })
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)

    const keepalive = setInterval(() => {
      for (const ws of [wsRef.current, warm.current?.ws]) if (ws?.readyState === WebSocket.OPEN) ws.send('ping')
    }, KEEPALIVE_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
      clearInterval(keepalive)
      warm.current?.ws.close()
      disconnect()
    }
  }, [connect, disconnect])

  const send = useCallback(
    (msg: ClientMessage) => {
      if (msg.type === 'create') {
        // Straight to a fresh code; the room replies codeTaken in the rare case it's in use.
        // Use the pre-warmed connection, even if it's still opening: that beats starting another.
        codeTries.current = 0
        setPending('host')
        const state = warm.current?.ws.readyState
        const ready = state === WebSocket.OPEN || state === WebSocket.CONNECTING ? warm.current : null
        warm.current = null
        if (ready) connect(ready.code, msg, ready.ws)
        else connect(randomCode(), msg)
        return
      }
      if (msg.type === 'join') {
        warm.current?.ws.close()
        warm.current = null
        setPending('join')
        connect(msg.code.toUpperCase().trim(), msg)
        return
      }
      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
      else queue.current.push(msg)
    },
    [connect, notify],
  )

  /** Opens a spare connection to a fresh code while the home screen is up. Safe to call repeatedly. */
  const prewarm = useCallback(() => {
    if (codeRef.current) return
    const current = warm.current?.ws
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) return
    const code = randomCode()
    const ws = new WebSocket(`${WS_BASE}/ws/${code}`)
    ws.onclose = () => {
      if (warm.current?.ws === ws) warm.current = null
    }
    warm.current = { code, ws }
  }, [])

  return { state, you, status, notice, resuming, pending, send, notify, prewarm }
}

export type Send = (msg: ClientMessage) => void
