#!/usr/bin/env node
// Seeds demo users, conversations, and messages through the PocketBase API.
// Requires the server to be running (./start.sh) and the admin credentials below.
//
// Usage:
//   node seed.mjs
//   PB_URL=http://127.0.0.1:8090 PB_ADMIN_EMAIL=... PB_ADMIN_PASSWORD=... node seed.mjs

const BASE_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL ?? "admin@openservices.local";
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD ?? "devpassword";
const DEMO_PASSWORD = process.env.PB_DEMO_PASSWORD ?? "openservices";

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  }

  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const auth = await request("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const token = auth.token;

  async function findUser(email) {
    const result = await request(
      `/api/collections/users/records?perPage=1&filter=${encodeURIComponent(`email = "${email}"`)}`,
      { token },
    );
    return result.items[0] ?? null;
  }

  async function ensureUser(email, name) {
    const existing = await findUser(email);
    if (existing) {
      return existing;
    }

    const created = await request("/api/collections/users/records", {
      method: "POST",
      token,
      body: {
        email,
        password: DEMO_PASSWORD,
        passwordConfirm: DEMO_PASSWORD,
        name,
      },
    });
    console.log(`created user ${email}`);
    return created;
  }

  const marcos = await ensureUser("marcos@example.com", "Marcos");
  const sarah = await ensureUser("sarah@example.com", "Sarah Chen");
  const michael = await ensureUser("michael@example.com", "Michael Johnson");

  const existingConversations = await request(
    "/api/collections/conversations/records?perPage=1",
    { token },
  );

  if (existingConversations.items.length > 0) {
    console.log("conversations already exist — skipping conversation seed");
    console.log(`demo login: marcos@example.com / ${DEMO_PASSWORD}`);
    return;
  }

  async function createConversation({ title, kind, participants }) {
    return request("/api/collections/conversations/records", {
      method: "POST",
      token,
      body: {
        title,
        kind,
        created_by: marcos.id,
        participants: participants.map((user) => user.id),
      },
    });
  }

  async function createMessage(conversation, author, body, replyToId) {
    const created = await request("/api/collections/messages/records", {
      method: "POST",
      token,
      body: {
        conversation: conversation.id,
        author: author.id,
        body,
        ...(replyToId ? { reply_to: replyToId } : {}),
      },
    });
    await sleep(30);
    return created;
  }

  async function addReaction(message, user, emoji) {
    await request("/api/collections/message_reactions/records", {
      method: "POST",
      token,
      body: { message: message.id, user: user.id, emoji },
    });
  }

  async function markRead(conversation, user, message) {
    await request("/api/collections/conversation_reads/records", {
      method: "POST",
      token,
      body: {
        conversation: conversation.id,
        user: user.id,
        last_read_message: message.id,
        last_read_at: message.created,
      },
    });
  }

  const worship = await createConversation({
    title: "Worship Team",
    kind: "team",
    participants: [marcos, sarah, michael],
  });
  const setList = await createMessage(
    worship,
    sarah,
    "I added the set list for this Sunday. Please review the transitions.",
  );
  const diBox = await createMessage(
    worship,
    michael,
    "Looks great. I can bring the extra DI box.",
  );
  const clickTrack = await createMessage(
    worship,
    marcos,
    "Perfect — I'll bring the click track too.",
    diBox.id,
  );
  await addReaction(setList, marcos, "👍");
  await addReaction(diBox, sarah, "🎉");
  await markRead(worship, sarah, clickTrack);
  await markRead(worship, michael, clickTrack);

  const direct = await createConversation({
    title: "Sarah Chen",
    kind: "direct",
    participants: [marcos, sarah],
  });
  const rehearsal = await createMessage(
    direct,
    sarah,
    "Could you confirm the rehearsal time?",
  );
  await markRead(direct, marcos, rehearsal);

  const planning = await createConversation({
    title: "Service Planning",
    kind: "group",
    participants: [marcos, sarah, michael],
  });
  await createMessage(planning, michael, "The plan is ready for review.");

  console.log(
    "seeded 3 conversations, 5 messages, 2 reactions and 3 read receipts",
  );
  console.log(`demo login: marcos@example.com / ${DEMO_PASSWORD}`);
  console.log(`secondary:  sarah@example.com / ${DEMO_PASSWORD}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
