import { DurableObject } from 'cloudflare:workers'
import type { ClientMessage, ServerMessage } from '../shared/types.ts'
import { GameError, Room, type RoomSnapshot } from './game.ts'

/** Rooms nobody is connected to are deleted after this long. */
const ROOM_IDLE_MS = 6 * 60 * 60 * 1000

function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code))
}

/**
 * Routes `/ws/:code` (a player's socket) to that room's Durable Object. Hosting a game is just
 * connecting to a fresh code and sending `create`. Everything else is the built React app.
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/') return withLinkPreview(await env.ASSETS.fetch(request), url)

    const match = url.pathname.match(/^\/ws\/([A-Za-z]{4})$/)
    if (match) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
      return roomStub(env, match[1].toUpperCase()).fetch(request)
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

/**
 * Fills in the link-preview tags chat apps read. They need absolute URLs, and an invite link
 * (`/?join=ABCD`) gets a preview that names the game code.
 */
function withLinkPreview(page: Response, url: URL): Response {
  const code = (url.searchParams.get('join') ?? '').toUpperCase().replace(/[^A-Z]/g, '')
  const invite = code.length === 4
  const tags: Record<string, string> = {
    'og:title': invite ? 'Join my Ring of Fire game' : 'Ring of Fire',
    'og:description': invite
      ? `Game code ${code}. Tap to join, no cards needed.`
      : 'The drinking game, for when nobody brought the cards.',
    'og:image': `${url.origin}/og-image.png`,
    'og:url': url.href,
  }
  let rewriter = new HTMLRewriter()
  for (const [property, content] of Object.entries(tags)) {
    rewriter = rewriter.on(`meta[property="${property}"]`, { element: (el) => void el.setAttribute('content', content) })
  }
  if (invite) {
    // Some apps (iMessage) show the page title rather than og:title, so personalise that too.
    rewriter = rewriter
      .on('title', { element: (el) => void el.setInnerContent(`Join my Ring of Fire game · ${code}`) })
      .on('meta[name="description"]', { element: (el) => void el.setAttribute('content', tags['og:description']) })
  }
  return rewriter.transform(page)
}

/** Stored on each socket so it survives the object hibernating. */
interface SocketInfo {
  /** The room's code, from the address the socket connected to. */
  code: string
  /** Set once the socket is someone's seat. */
  playerId?: string
}

function socketInfo(ws: WebSocket): SocketInfo {
  return (ws.deserializeAttachment() as SocketInfo | null) ?? { code: '' }
}

function setPlayer(ws: WebSocket, playerId: string | undefined) {
  ws.serializeAttachment({ code: socketInfo(ws).code, playerId } satisfies SocketInfo)
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

  async fetch(request: Request): Promise<Response> {
    // Read storage now, while the socket is opening, so the first message doesn't wait on it.
    await this.load()
    const code = new URL(request.url).pathname.slice('/ws/'.length).toUpperCase()
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ code } satisfies SocketInfo)
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
      const { playerId } = socketInfo(ws)
      return playerId ? [{ ws, playerId }] : []
    })
  }

  private broadcast() {
    if (!this.room) return
    const now = Date.now()
    for (const { ws, playerId } of this.sockets()) send(ws, { type: 'state', state: this.room.state, you: playerId, now })
  }

  /** Points this socket at a player, dropping any other socket that was using the same seat. */
  private attach(ws: WebSocket, room: Room, playerId: string) {
    for (const other of this.sockets()) {
      if (other.ws !== ws && other.playerId === playerId) {
        this.drop(other.ws, 'You opened this game somewhere else')
      }
    }
    setPlayer(ws, playerId)
    room.setConnected(playerId, true)
    this.save()
    this.broadcast()
  }

  private drop(ws: WebSocket, message: string) {
    setPlayer(ws, undefined)
    send(ws, { type: 'error', message, fatal: true })
    try {
      ws.close(1000, 'Removed')
    } catch {
      // Already closed.
    }
  }

  private async detach(ws: WebSocket) {
    const { playerId } = socketInfo(ws)
    setPlayer(ws, undefined)
    const room = await this.load()
    if (!playerId || !room) return
    if (this.sockets().some((s) => s.ws !== ws && s.playerId === playerId)) return
    room.setConnected(playerId, false)
    this.save()
    this.broadcast()
  }

  private async handle(ws: WebSocket, msg: ClientMessage) {
    const room = await this.load()

    switch (msg.type) {
      case 'create': {
        if (room) {
          // A retried create from the same phone just rejoins; anyone else needs a different code.
          const player = room.playerForToken(msg.token)
          if (player) this.attach(ws, room, player.id)
          else send(ws, { type: 'codeTaken' })
          return
        }
        this.room = new Room(socketInfo(ws).code, msg.token, msg.name, msg.gender, msg.rules)
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

    const { playerId } = socketInfo(ws)
    if (!room || !playerId) throw new GameError('Not in a game')

    switch (msg.type) {
      case 'leave': {
        setPlayer(ws, undefined)
        // The host leaving before the game starts (or after it's over) closes the game for everyone.
        // Mid-game, someone else takes over as host instead.
        if (playerId === room.hostId && room.state.phase !== 'playing') {
          const hostName = room.player(playerId)?.name ?? 'The host'
          send(ws, { type: 'left' })
          for (const other of this.sockets()) this.drop(other.ws, `${hostName} left, so the game has closed`)
          await this.ctx.storage.deleteAll()
          this.room = null
          return
        }
        room.remove(playerId)
        send(ws, { type: 'left' })
        if (room.state.players.length === 0) {
          await this.ctx.storage.deleteAll()
          this.room = null
          return
        }
        break
      }
      case 'kick':
        room.kick(playerId, msg.playerId)
        for (const other of this.sockets()) {
          if (other.playerId === msg.playerId) this.drop(other.ws, 'The host removed you from the game')
        }
        break
      case 'updateProfile':
        room.updateProfile(playerId, msg.name, msg.gender)
        break
      case 'makeHost':
        room.makeHost(playerId, msg.playerId)
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
      case 'undoDone':
        room.undoDone(playerId)
        break
      case 'startTimer':
        room.startTimer(playerId)
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
