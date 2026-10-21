import type { Env } from "./types";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

export function noContent(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }

  console.error("unhandled worker error", error);
  return jsonResponse(
    {
      error: {
        code: "internal_error",
        message: "Something went wrong on the server.",
      },
    },
    500,
  );
}

function configuredOrigins(env: Env): string[] {
  return (env.APP_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "10.0.2.2" ||
      url.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

export function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const configured = configuredOrigins(env);
  if (configured.length > 0) {
    return configured.includes(origin) ? origin : null;
  }

  return isLocalOrigin(origin) ? origin : null;
}

export function withCors(
  response: Response,
  request: Request,
  env: Env,
): Response {
  const origin = allowedOrigin(request, env);
  if (!origin) return response;

  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  );
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function preflightResponse(request: Request, env: Env): Response {
  return withCors(noContent(), request, env);
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Send a JSON request body.",
    );
  }

  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "invalid_json", "The request body is not valid JSON.");
  }
}

export function stringField(
  body: Record<string, unknown>,
  key: string,
  options: { min?: number; max: number; trim?: boolean } = { max: 4000 },
): string {
  const raw = body[key];
  if (typeof raw !== "string") {
    throw new HttpError(400, "invalid_request", `${key} must be a string.`);
  }
  const value = options.trim === false ? raw : raw.trim();
  const min = options.min ?? 1;
  if (value.length < min || value.length > options.max) {
    throw new HttpError(
      400,
      "invalid_request",
      `${key} must be between ${min} and ${options.max} characters.`,
    );
  }
  return value;
}

export function optionalStringField(
  body: Record<string, unknown>,
  key: string,
  max: number,
): string | null {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new HttpError(400, "invalid_request", `${key} must be a string.`);
  }
  const value = raw.trim();
  if (value.length > max) {
    throw new HttpError(
      400,
      "invalid_request",
      `${key} must be at most ${max} characters.`,
    );
  }
  return value;
}
