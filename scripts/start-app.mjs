#!/usr/bin/env node
// Starts the Expo app against a running Open Services backend.
//
//   node scripts/start-app.mjs                 # web build on the deployed backend
//   node scripts/start-app.mjs --native        # dev server for a phone (press a / i)
//   node scripts/start-app.mjs --port 8082     # a specific port
//   node scripts/start-app.mjs --no-open       # do not open a browser
//
// The API URL comes from EXPO_PUBLIC_API_URL and falls back to the deployed
// instance. Point it at a local worker with:
//
//   EXPO_PUBLIC_API_URL=http://127.0.0.1:8788 npm run app

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const DEFAULT_API_URL = "https://open-services-api.snorlaxking310.workers.dev";
const DEFAULT_PORT = 8081;

function parseArgs(argv) {
  const options = { native: false, open: true, port: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--native") options.native = true;
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--url") options.url = argv[++index];
  }
  return options;
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function pickPort(preferred) {
  for (let port = preferred; port < preferred + 20; port += 1) {
    if (await portIsFree(port)) return port;
  }
  throw new Error(`No free port between ${preferred} and ${preferred + 19}.`);
}

function demoAccounts() {
  const file = join(root, "worker", ".demo-accounts");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const [email, password] = line.trim().split(/\s+/);
      return { email, password };
    });
}

async function checkBackend(apiUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${apiUrl}/api/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function openBrowser(url) {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(command, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // Not fatal, the URL is printed anyway.
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiUrl = (
    options.url ||
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    DEFAULT_API_URL
  ).replace(/\/+$/, "");

  if (!existsSync(join(root, "node_modules", "expo"))) {
    console.error("Dependencies are missing. Run: npm install");
    process.exit(1);
  }

  const port = await pickPort(options.port ?? DEFAULT_PORT);
  const appUrl = `http://localhost:${port}`;

  console.log("");
  console.log("  Open Services");
  console.log(`  API      ${apiUrl}`);
  console.log(`  App      ${appUrl}`);
  console.log("");

  const reachable = await checkBackend(apiUrl);
  if (!reachable) {
    console.log(`  ! The API at ${apiUrl} did not answer.`);
    if (apiUrl.includes("127.0.0.1") || apiUrl.includes("localhost")) {
      console.log("    Start the local worker first: npm run worker:dev");
    } else {
      console.log("    Check the URL and your network.");
    }
    console.log("");
  }

  const accounts = demoAccounts();
  if (accounts && accounts.length > 0 && reachable) {
    console.log("  Sign in with one of these accounts:");
    for (const account of accounts) {
      console.log(`    ${account.email}  ${account.password}`);
    }
    console.log("");
    console.log("  Or create a new one: npm run worker:invite -- --email you@example.com");
    console.log("");
  }

  const args = options.native
    ? ["expo", "start", "--port", String(port)]
    : ["expo", "start", "--web", "--port", String(port)];
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  const child = spawn(npx, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl },
  });

  if (options.open && !options.native) {
    setTimeout(() => openBrowser(appUrl), 4000);
  }

  const stop = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 0));
  });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
