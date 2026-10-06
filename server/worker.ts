import { DurableObject } from 'cloudflare:workers'
import type { ClientMessage, ServerMessage } from '../shared/types.ts'
import { GameError, Room, type RoomSnapshot } from './game.ts'

/** Rooms nobody is connected to are deleted after this long. */
const ROOM_IDLE_MS = 6 * 60 * 60 * 1000
// No I/O/0/1 so codes are easy to read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

function randomCode(): string {
  return Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
}

function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code))
}

/**
 * Routes `POST /api/rooms` (reserve a new code) and `/ws/:code` (a player's socket) to the
 * room's Durable Object. Everything else is served straight from the built React app.
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 20; attempt++) {
        const code = randomCode()
        if (await roomStub(env, code).claim(code)) return Response.json({ code })
      }
      return new Response('No free game codes, try again', { status: 503 })
    }

    const match = url.pathname.match(/^\/ws\/([A-Za-z]{4})$/)
    if (match) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
      return roomStub(env, match[1].toUpperCase()).fetch(request)
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

/** Stored on each socket so it survives the object hibernating. */
interface SocketInfo {
  playerId: string
}

/**
 * One game room. Sockets use the hibernation API, so an idle room costs nothing; the room is
 * saved to storage after every change and reloaded when the object wakes up again.
 */
export class RoomDO extends DurableObject<Env> {
  /** `undefined` until loaded from storage; `null` when there's no game here. */
  private room: Room | null | undefined

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Keep-alive pings from phones are answered without waking the room up.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  /** Reserves this room's code for a new game. False if it's already in use. */
  async claim(code: string): Promise<boolean> {
    if (await this.ctx.storage.get('code')) return false
    await this.ctx.storage.put('code', code)
    await this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_MS)
    return true
  }

  async fetch(): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string') return
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    try {
      await this.handle(ws, msg)
    } catch (err) {
      if (err instanceof GameError) send(ws, { type: 'error', message: err.message })
      else {
        console.error(err)
        send(ws, { type: 'error', message: 'Something went wrong' })
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.detach(ws)
  }

  async webSocketError(ws: WebSocket) {
    await this.detach(ws)
  }

  /** Clears out rooms that have been abandoned. */
  async alarm() {
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_MS)
      return
    }
    await this.ctx.storage.deleteAll()
    this.room = null
  }

  private async load(): Promise<Room | null> {
    if (this.room === undefined) {
      const snapshot = await this.ctx.storage.get<RoomSnapshot>('room')
      this.room = snapshot ? Room.restore(snapshot) : null
    }
    return this.room
  }

  private save() {
    if (this.room) this.ctx.storage.put('room', this.room.snapshot())
    this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_MS)
  }

  private sockets(): { ws: WebSocket; playerId: string }[] {
    return this.ctx.getWebSockets().flatMap((ws) => {
      const info = ws.deserializeAttachment() as SocketInfo | null
      return info ? [{ ws, playerId: info.playerId }] : []
    })
  }

  private broadcast() {
    if (!this.room) return
    for (const { ws, playerId } of this.sockets()) send(ws, { type: 'state', state: this.room.state, you: playerId })
  }

  /** Points this socket at a player, dropping any other socket that was using the same seat. */
  private attach(ws: WebSocket, room: Room, playerId: string) {
    for (const other of this.sockets()) {
      if (other.ws !== ws && other.playerId === playerId) {
        this.drop(other.ws, 'You opened this game somewhere else')
      }
    }
    ws.serializeAttachment({ playerId } satisfies SocketInfo)
    room.setConnected(playerId, true)
    this.save()
    this.broadcast()
  }

  private drop(ws: WebSocket, message: string) {
    ws.serializeAttachment(null)
    send(ws, { type: 'error', message, fatal: true })
    try {
      ws.close(1000, 'Removed')
    } catch {
      // Already closed.
    }
  }

  private async detach(ws: WebSocket) {
    const info = ws.deserializeAttachment() as SocketInfo | null
    ws.serializeAttachment(null)
    const room = await this.load()
    if (!info || !room) return
    if (this.sockets().some((s) => s.ws !== ws && s.playerId === info.playerId)) return
    room.setConnected(info.playerId, false)
    this.save()
    this.broadcast()
  }

  private async handle(ws: WebSocket, msg: ClientMessage) {
    const room = await this.load()

    switch (msg.type) {
      case 'create': {
        if (room) {
          // A retried create from the same phone just rejoins.
          const player = room.playerForToken(msg.token)
          if (!player) throw new GameError('That game code is already taken')
          this.attach(ws, room, player.id)
          return
        }
        const code = await this.ctx.storage.get<string>('code')
        if (!code) throw new GameError("Couldn't create the game. Try again")
        this.room = new Room(code, msg.token, msg.name, msg.gender)
        this.attach(ws, this.room, this.room.hostId)
        return
      }
      case 'join': {
        if (!room) {
          send(ws, { type: 'error', message: "Couldn't find that game. Check the code", fatal: true })
          return
        }
        const player = room.join(msg.token, msg.name, msg.gender)
        this.attach(ws, room, player.id)
        return
      }
      case 'resume': {
        const player = room?.playerForToken(msg.token)
        if (!room || !player) {
          send(ws, { type: 'error', message: 'That game has ended', fatal: true })
          return
        }
        this.attach(ws, room, player.id)
        return
      }
    }

    const info = ws.deserializeAttachment() as SocketInfo | null
    if (!room || !info) throw new GameError('Not in a game')
    const { playerId } = info

    switch (msg.type) {
      case 'leave':
        ws.serializeAttachment(null)
        room.remove(playerId)
        send(ws, { type: 'left' })
        if (room.state.players.length === 0) {
          await this.ctx.storage.deleteAll()
          this.room = null
          return
        }
        break
      case 'kick':
        room.kick(playerId, msg.playerId)
        for (const other of this.sockets()) {
          if (other.playerId === msg.playerId) this.drop(other.ws, 'The host removed you from the game')
        }
        break
      case 'setRule':
        room.setRule(playerId, msg.rank, msg.ruleId)
        break
      case 'resetRules':
        room.resetRules(playerId)
        break
      case 'swapSeats':
        room.swapSeats(playerId, msg.a, msg.b)
        break
      case 'start':
        room.start(playerId)
        break
      case 'draw':
        room.draw(playerId, msg.slot)
        break
      case 'choose':
        room.choose(playerId, msg.targetId)
        break
      case 'writeRule':
        room.writeRule(playerId, msg.text)
        break
      case 'removeHouseRule':
        room.removeHouseRule(playerId, msg.id)
        break
      case 'done':
        room.done(playerId)
        break
      case 'skip':
        room.skip(playerId)
        break
      case 'endGame':
        room.endGame(playerId)
        break
      case 'newGame':
        room.newGame(playerId)
        break
      default:
        throw new GameError('Unknown action')
    }
    this.save()
    this.broadcast()
  }
}

function send(ws: WebSocket, msg: ServerMessage) {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // Socket already gone.
  }
}
