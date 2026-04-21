import type { Server as HttpServer } from 'http';
import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import { env } from '../config';

interface AccessJwtPayload {
  userId: string;
  type: 'access' | 'refresh';
}

const userSockets = new Map<string, Set<WebSocket>>();

function addSocket(userId: string, ws: WebSocket) {
  let set = userSockets.get(userId);
  if (!set) {
    set = new Set();
    userSockets.set(userId, set);
  }
  set.add(ws);
}

function removeSocket(userId: string, ws: WebSocket) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) userSockets.delete(userId);
}

export function broadcastToUser(userId: string, payload: string): void {
  const set = userSockets.get(userId);
  if (!set?.size) return;
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch {
        /* ignore */
      }
    }
  }
}

function authenticateSocket(req: IncomingMessage): { userId: string } | null {
  try {
    const host = req.headers.host ?? 'localhost';
    const url = new URL(req.url ?? '/', `http://${host}`);
    const token = url.searchParams.get('token');
    if (!token) return null;
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessJwtPayload;
    if (decoded.type !== 'access' || !decoded.userId) return null;
    return { userId: decoded.userId };
  } catch {
    return null;
  }
}

/**
 * WebSocket endpoint: /ws?token=<JWT access token>
 * Must be proxied with Upgrade headers in production (nginx).
 */
export function attachWebSocketGateway(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host ?? 'localhost';
    const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const auth = authenticateSocket(request);
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const userId = auth.userId;
      addSocket(userId, ws);
      ws.on('close', () => removeSocket(userId, ws));
      ws.on('error', () => removeSocket(userId, ws));
    });
  });
}
