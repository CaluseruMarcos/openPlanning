import type { Env, RealtimeEvent } from "./types";

/**
 * Fan out one event to each recipient's personal UserHub.
 *
 * The Worker is the only caller. Keeping the DO binding internal means these
 * requests cannot be reached from the public internet.
 */
export async function publishToUsers(
  env: Env,
  userIds: string[],
  event: RealtimeEvent,
): Promise<void> {
  const unique = [...new Set(userIds)];
  const results = await Promise.allSettled(
    unique.map(async (userId) => {
      const stub = env.USER_HUB.get(env.USER_HUB.idFromName(userId));
      const response = await stub.fetch("https://user-hub.internal/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
      if (!response.ok) {
        throw new Error(`UserHub publish failed with ${response.status}`);
      }
    }),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("realtime fan-out failed", result.reason);
    }
  }
}

export class UserHub implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/publish")) {
      let event: RealtimeEvent;
      try {
        event = (await request.json()) as RealtimeEvent;
      } catch {
        return new Response("Invalid event", { status: 400 });
      }
      this.broadcast(event);
      return new Response(null, { status: 204 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const userId = request.headers.get("X-User-Id");
    if (!userId) {
      return new Response("Missing user", { status: 401 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);

    server.send(
      JSON.stringify({
        type: "ready",
        userId,
        connectedAt: new Date().toISOString(),
      } satisfies RealtimeEvent),
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== "string") return;

    try {
      const parsed = JSON.parse(message) as { type?: unknown };
      if (parsed.type === "ping") {
        socket.send(JSON.stringify({ type: "pong" }));
      } else if (parsed.type === "close") {
        socket.close(1000, "Client closed");
      }
    } catch {
      // Ignore malformed client frames. The client only sends ping.
    }
  }

  async webSocketClose(
    _socket: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    // Hibernation manages the socket lifecycle. Nothing to persist.
  }

  async webSocketError(_socket: WebSocket, error: unknown): Promise<void> {
    console.error("UserHub websocket error", error);
  }

  private broadcast(event: RealtimeEvent): void {
    const payload = JSON.stringify(event);
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        try {
          socket.close(1011, "Send failed");
        } catch {
          // The socket is already gone.
        }
      }
    }
  }
}
