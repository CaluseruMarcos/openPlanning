#!/usr/bin/env node
// Creates and lists invite codes for a deployment.
//
// Registration is closed: an account only exists when an owner hands out a
// code. The code is shown once, can be used once, and expires.
//
// Usage:
//   node worker/invite.mjs                      # create a code
//   node worker/invite.mjs --email a@b.de       # bind the code to an address
//   node worker/invite.mjs --note "for Sarah"  # a note for the owner
//   node worker/invite.mjs --hours 24           # lifetime, default 72
//   node worker/invite.mjs list                 # show the codes and their state
//
// Configuration:
//   WORKER_URL  base url of the API, default http://127.0.0.1:8787/api
//   ADMIN_KEY   the admin key of the deployment. Falls back to the
//               ADMIN_KEY entry of worker/.secrets.local or worker/.dev.vars.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const BASE_URL = (
  process.env.WORKER_URL ?? "http://127.0.0.1:8787/api"
).replace(/\/+$/, "");

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

function parseArgs(argv) {
  const options = { command: "create" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "list") {
      options.command = "list";
    } else if (arg === "--email") {
      options.email = argv[++index];
    } else if (arg === "--note") {
      options.note = argv[++index];
    } else if (arg === "--hours") {
      options.hours = Number(argv[++index]);
    } else {
      options.command = "create";
    }
  }
  return options;
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "X-Admin-Key": ADMIN_KEY ?? "",
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
    const message = data?.error?.message ?? text;
    throw new Error(`${method} ${path} -> ${response.status}: ${message}`);
  }
  return data;
}

async function main() {
  if (!ADMIN_KEY) {
    throw new Error(
      "No admin key. Set ADMIN_KEY or add it to worker/.secrets.local.",
    );
  }

  const options = parseArgs(process.argv.slice(2));

  if (options.command === "list") {
    const data = await request("/admin/invites");
    if (data.items.length === 0) {
      console.log("No invites yet.");
      return;
    }
    for (const invite of data.items) {
      const state = invite.usedAt
        ? `used at ${invite.usedAt}`
        : invite.expiresAt < new Date().toISOString()
          ? "expired"
          : `valid until ${invite.expiresAt}`;
      console.log(
        `  ${invite.email ?? "(any address)"}  ${state}${
          invite.note ? `  · ${invite.note}` : ""
        }`,
      );
    }
    return;
  }

  const invite = await request("/admin/invites", {
    method: "POST",
    body: {
      ...(options.email ? { email: options.email } : {}),
      ...(options.note ? { note: options.note } : {}),
      ...(options.hours ? { lifetimeHours: options.hours } : {}),
    },
  });

  console.log("\nInvite code: " + invite.code);
  console.log(`Valid until: ${invite.expiresAt}`);
  if (invite.email) console.log(`Only for:    ${invite.email}`);
  console.log(
    "\nShare the code. The person enters it in the sign-up form together with\n" +
      "their email and a password of at least 8 characters.",
  );
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
