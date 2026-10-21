import { cleanupExpiredSessions } from "./auth";
import {
  errorResponse,
  preflightResponse,
  withCors,
} from "./http";
import { handleApiRequest } from "./router";
import type { Env } from "./types";

export { UserHub } from "./realtime";

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return preflightResponse(request, env);
    }

    try {
      const response = await handleApiRequest(request, env);
      // A 101 response carries the client WebSocket; wrapping it would drop it.
      if (response.status === 101) return response;
      return withCors(response, request, env);
    } catch (error) {
      return withCors(errorResponse(error), request, env);
    }
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(cleanupExpiredSessions(env));
  },
};
