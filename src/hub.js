// Durable Object unique : diffuse chaque modification à tous les écrans staff (WebSocket hibernable).
import { DurableObject } from 'cloudflare:workers';

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Keep-alive sans réveiller l'objet (pas de coût CPU).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const exp = Number(req.headers.get('X-Session-Exp')) || Date.now();
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ exp });
    return new Response(null, { status: 101, webSocket: client });
  }

  /** RPC appelée par le Worker après chaque écriture. */
  async broadcast(msg) {
    const data = JSON.stringify(msg);
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      try {
        if ((ws.deserializeAttachment()?.exp ?? 0) < now) ws.close(4401, 'session expired');
        else ws.send(data);
      } catch {
        /* socket déjà fermée */
      }
    }
  }

  webSocketMessage() {
    /* canal descendant uniquement */
  }

  webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      /* déjà fermée */
    }
  }

  webSocketError(ws) {
    try {
      ws.close(1011, 'error');
    } catch {
      /* déjà fermée */
    }
  }
}

export const hub = (env) => env.HUB.get(env.HUB.idFromName('event'));
