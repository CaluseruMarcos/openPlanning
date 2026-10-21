#!/usr/bin/env node
// Seeds the demo accounts and one chat.
//
// Registration is invite only, so the script asks the admin endpoint for an
// invite code per account. It is idempotent: existing users are signed in,
// existing direct conversations are reused, and the demo message is only sent
// once.
//
// Usage:
//   node worker/seed.mjs
//   WORKER_URL=http://127.0.0.1:8787/api node worker/seed.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const BASE_URL = (process.env.WORKER_URL ?? "http://127.0.0.1:8787/api").replace(
  /\/+$/,
);
const DEMO_PASSWORD = process.env.WORKER_DEMO_PASSWORD ?? "openservices";

const USERS = [
  { name: "Marcos", email: "marcos@example.com" },
  { name: "Sarah Chen", email: "sarah@example.com" },
  { name: "Michael Johnson", email: "michael@example.com" },
];

function readKeyFrom(file) {
  try {
    const match = readFileSync(file, "utf8").match(/^ADMIN_KEY=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

const ADMIN_KEY =
  process.env.ADMIN_KEY?.trim() ||
  readKeyFrom(join(root, "worker", ".secrets.local")) ||
  readKeyFrom(join(root, "worker", ".dev.vars"));

/**
 * The deployed demo accounts have their own random password, listed in the
 * gitignored worker/.demo-accounts. A local database always uses the default
 * one. WORKER_DEMO_PASSWORD overrides everything.
 */
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2|0\.0\.0\.0)/.test(
  BASE_URL,
);

function passwordFor(email) {
  if (process.env.WORKER_DEMO_PASSWORD) return process.env.WORKER_DEMO_PASSWORD;
  if (IS_LOCAL) return DEMO_PASSWORD;
  try {
    const file = readFileSync(join(root, "worker", ".demo-accounts"), "utf8");
    for (const line of file.split("\n")) {
      if (line.startsWith("#")) continue;
      const [account, password] = line.trim().split(/\s+/);
      if (account === email && password) return password;
    }
  } catch {
    // No file, so the default password is used.
  }
  return DEMO_PASSWORD;
}

async function request(path, { method = "GET", token, body, admin } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(admin ? { "X-Admin-Key": ADMIN_KEY ?? "" } : {}),
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

async function createInvite(email) {
  if (!ADMIN_KEY) {
    throw new Error(
      "No admin key. Set ADMIN_KEY or add it to worker/.secrets.local.",
    );
  }
  const invite = await request("/admin/invites", {
    method: "POST",
    admin: true,
    body: { email, lifetimeHours: 1 },
  });
  return invite.code;
}

async function ensureUser(user) {
  const password = passwordFor(user.email);
  try {
    return await request("/auth/signup", {
      method: "POST",
      body: {
        ...user,
        password,
        inviteCode: await createInvite(user.email),
      },
    });
  } catch (error) {
    if (error.status === 409) {
      // The account exists. The password only matches on a local database
      // that was seeded with the default one.
      try {
        return await request("/auth/signin", {
          method: "POST",
          body: { email: user.email, password },
        });
      } catch (signInError) {
        if (signInError.status === 401) {
          throw new Error(
            `${user.email} already exists, but the password does not match. ` +
              `Set WORKER_DEMO_PASSWORD to the current one, or delete the ` +
              `account first.`,
          );
        }
        throw signInError;
      }
    }
    if (error.status === 429) {
      throw new Error(
        "The server is rate limiting registrations from this address (429). " +
          "Wait a little and run the seed again.",
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
  console.log("Demo accounts ready:");
  for (const user of USERS) console.log(`  ${user.email}`);
  console.log(
    IS_LOCAL
      ? `\nPassword of the local database: ${DEMO_PASSWORD}`
      : "\nPassword of the deployment: see worker/.demo-accounts",
  );
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
