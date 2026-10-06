import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, GameState, ServerMessage } from '../../shared/types.ts'
import { deviceToken, loadRoomCode, saveRoomCode } from './storage.ts'

const WS_URL =
  import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export type ConnectionStatus = 'connecting' | 'open' | 'closed'

export interface Notice {
  id: number
  message: string
}

export function useGame() {
  const [state, setState] = useState<GameState | null>(null)
  const [you, setYou] = useState<string | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [notice, setNotice] = useState<Notice | null>(null)
  // Until the first resume attempt settles we don't know whether to show the home screen.
  const [resuming, setResuming] = useState(() => loadRoomCode() !== null)

  const wsRef = useRef<WebSocket | null>(null)
  const queue = useRef<ClientMessage[]>([])
  const retry = useRef(0)

  const notify = useCallback((message: string) => setNotice({ id: Date.now(), message }), [])

  const connect = useCallback(() => {
    const current = wsRef.current
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) return

    setStatus('connecting')
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      retry.current = 0
      setStatus('open')
      const code = loadRoomCode()
      if (code) ws.send(JSON.stringify({ type: 'resume', token: deviceToken(), code } satisfies ClientMessage))
      for (const msg of queue.current.splice(0)) ws.send(JSON.stringify(msg))
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage
      if (msg.type === 'state') {
        setState(msg.state)
        setYou(msg.you)
        saveRoomCode(msg.state.code)
        setResuming(false)
      } else if (msg.type === 'error') {
        if (msg.fatal) {
          saveRoomCode(null)
          setState(null)
          setResuming(false)
        }
        notify(msg.message)
      } else if (msg.type === 'left') {
        saveRoomCode(null)
        setState(null)
      }
    }

    ws.onclose = () => {
      if (wsRef.current !== ws) return
      setStatus('closed')
      const delay = Math.min(5000, 500 * 2 ** retry.current++)
      setTimeout(connect, delay)
    }
  }, [notify])

  useEffect(() => {
    connect()
    // Phones kill sockets when the screen locks. Reconnect as soon as we're back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') connect()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [connect])

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    else queue.current.push(msg)
  }, [])

  return { state, you, status, notice, resuming, send, notify }
}

export type Send = (msg: ClientMessage) => void
