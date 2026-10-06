import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '../shared/types.ts'
import { GameError, Room } from './game.ts'

const PORT = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 8787)
const ROOM_IDLE_MS = 6 * 60 * 60 * 1000
// No I/O/0/1 so codes are easy to read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

const rooms = new Map<string, Room>()

interface Session {
  room: Room
  playerId: string
}
const sessions = new Map<WebSocket, Session>()

function newCode(): string {
  for (;;) {
    const code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
    if (!rooms.has(code)) return code
  }
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function broadcast(room: Room) {
  room.lastActive = Date.now()
  for (const [ws, session] of sessions) {
    if (session.room === room) send(ws, { type: 'state', state: room.state, you: session.playerId })
  }
}

/** Points this socket at a player, dropping any other socket that was using the same seat. */
function attach(ws: WebSocket, room: Room, playerId: string) {
  for (const [other, session] of sessions) {
    if (other !== ws && session.room === room && session.playerId === playerId) {
      sessions.delete(other)
      send(other, { type: 'error', message: 'You opened this game somewhere else', fatal: true })
      other.close()
    }
  }
  sessions.set(ws, { room, playerId })
  room.setConnected(playerId, true)
  broadcast(room)
}

function handle(ws: WebSocket, msg: ClientMessage) {
  const session = sessions.get(ws)

  switch (msg.type) {
    case 'create': {
      if (session) detach(ws)
      const room = new Room(newCode(), msg.token, msg.name, msg.gender)
      rooms.set(room.state.code, room)
      attach(ws, room, room.hostId)
      return
    }
    case 'join': {
      const room = rooms.get(msg.code.toUpperCase().trim())
      if (!room) throw new GameError("Couldn't find that game. Check the code")
      if (session && session.room !== room) detach(ws)
      const player = room.join(msg.token, msg.name, msg.gender)
      attach(ws, room, player.id)
      return
    }
    case 'resume': {
      const room = rooms.get(msg.code)
      const player = room?.playerForToken(msg.token)
      if (!room || !player) {
        send(ws, { type: 'error', message: 'That game has ended', fatal: true })
        return
      }
      attach(ws, room, player.id)
      return
    }
  }

  if (!session) throw new GameError('Not in a game')
  const { room, playerId } = session

  switch (msg.type) {
    case 'leave':
      sessions.delete(ws)
      room.remove(playerId)
      send(ws, { type: 'left' })
      if (room.state.players.length === 0) rooms.delete(room.state.code)
      else broadcast(room)
      return
    case 'kick': {
      room.kick(playerId, msg.playerId)
      for (const [other, s] of sessions) {
        if (s.room === room && s.playerId === msg.playerId) {
          sessions.delete(other)
          send(other, { type: 'error', message: 'The host removed you from the game', fatal: true })
        }
      }
      break
    }
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
  broadcast(room)
}

function detach(ws: WebSocket) {
  const session = sessions.get(ws)
  if (!session) return
  sessions.delete(ws)
  const stillHere = [...sessions.values()].some((s) => s.room === session.room && s.playerId === session.playerId)
  if (!stillHere) {
    session.room.setConnected(session.playerId, false)
    broadcast(session.room)
  }
}

// ── HTTP: serves the built client in production ─────────────────────────────

const DIST = resolve(import.meta.dirname, '../dist')
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.end('ok')
    return
  }
  if (!existsSync(DIST)) {
    res.writeHead(404).end('Run the client with `npm run dev`, or `npm run build` first.')
    return
  }
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  let file = normalize(join(DIST, urlPath))
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    try {
      handle(ws, msg)
    } catch (err) {
      if (err instanceof GameError) send(ws, { type: 'error', message: err.message })
      else {
        console.error(err)
        send(ws, { type: 'error', message: 'Something went wrong' })
      }
    }
  })
  ws.on('close', () => detach(ws))
})

// Keep connections alive through proxies, and tidy up abandoned rooms.
setInterval(() => {
  for (const ws of wss.clients) ws.ping()
  const now = Date.now()
  for (const [code, room] of rooms) {
    const anyoneHere = [...sessions.values()].some((s) => s.room === room)
    if (!anyoneHere && now - room.lastActive > ROOM_IDLE_MS) rooms.delete(code)
  }
}, 30_000)

server.listen(PORT, () => console.log(`Ring of Fire server on http://localhost:${PORT}`))
