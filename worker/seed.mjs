#!/usr/bin/env node
// Seed the local Cloudflare Worker backend with demo accounts and one chat.
// The script is idempotent: existing users are signed in, existing direct
// conversations are reused, and the demo message is only sent once.
//
// Usage:
//   node worker/seed.mjs
//   WORKER_URL=http://127.0.0.1:8787/api node worker/seed.mjs

const BASE_URL = (process.env.WORKER_URL ?? "http://127.0.0.1:8787/api").replace(
  /\/+$/,
  "",
);
const DEMO_PASSWORD = process.env.WORKER_DEMO_PASSWORD ?? "openservices";

const USERS = [
  { name: "Marcos", email: "marcos@example.com" },
  { name: "Sarah Chen", email: "sarah@example.com" },
  { name: "Michael Johnson", email: "michael@example.com" },
];

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(`${method} ${path} -> ${response.status}: ${text}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function ensureUser(user) {
  try {
    return await request("/auth/signup", {
      method: "POST",
      body: { ...user, password: DEMO_PASSWORD },
    });
  } catch (error) {
    if (error.status === 409) {
      return request("/auth/signin", {
        method: "POST",
        body: { email: user.email, password: DEMO_PASSWORD },
      });
    }
    if (error.status === 429) {
      throw new Error(
        `The server is rate limiting registrations from this address (429). ` +
          `Wait a little and run the seed again.`,
      );
    }
    throw error;
  }
}

async function main() {
  const sessions = new Map();
  for (const user of USERS) {
    const session = await ensureUser(user);
    sessions.set(user.email, session);
    console.log(`user ready: ${user.email}`);
  }

  const marcos = sessions.get("marcos@example.com");
  const sarah = sessions.get("sarah@example.com");
  const michael = sessions.get("michael@example.com");

  const conversation = await request("/conversations", {
    token: marcos.token,
    method: "POST",
    body: {
      title: "Sarah Chen",
      kind: "direct",
      participantIds: [sarah.user.id],
    },
  });
  console.log(`conversation ready: ${conversation.id}`);

  const existing = await request(
    `/conversations/${conversation.id}/messages?limit=100`,
    { token: marcos.token },
  );

  let message = existing.items.find(
    (item) => item.author.id === marcos.user.id,
  );

  if (!message) {
    message = await request(`/conversations/${conversation.id}/messages`, {
      token: marcos.token,
      method: "POST",
      body: {
        body: "Welcome to the Cloudflare Worker backend. This is a seeded demo message.",
      },
    });
    console.log("demo message created");
  }

  const withReactions = await request(
    `/conversations/${conversation.id}/messages?limit=100`,
    { token: sarah.token },
  );
  const current = withReactions.items.find((item) => item.id === message.id);
  const hasSarahReaction = current?.reactions?.some(
    (reaction) => reaction.user.id === sarah.user.id && reaction.emoji === "👋",
  );
  if (!hasSarahReaction) {
    await request(`/messages/${message.id}/reactions`, {
      token: sarah.token,
      method: "POST",
      body: { emoji: "👋" },
    });
    console.log("demo reaction created");
  }

  await request(`/conversations/${conversation.id}/read`, {
    token: sarah.token,
    method: "PUT",
    body: { lastReadMessageId: message.id },
  });

  // Keep the third account available for starting new conversations.
  await request("/people", { token: michael.token });

  console.log("");
  console.log("Demo accounts (password: " + DEMO_PASSWORD + ")");
  for (const user of USERS) console.log(`  ${user.email}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
