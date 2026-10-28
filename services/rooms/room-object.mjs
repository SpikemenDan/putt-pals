export class RoomDurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/__local/identity' && request.method === 'GET'
      && this.env.ROOM_ENVIRONMENT === 'development' && this.env.ROOM_LOCAL_DIAGNOSTICS === 'true') {
      return Response.json({ id: this.ctx.id.toString() }, {
        headers: { 'cache-control': 'no-store' },
      });
    }

    if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required.', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.addEventListener('message', () => {
      server.close(1013, 'Room protocol is not implemented yet.');
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
