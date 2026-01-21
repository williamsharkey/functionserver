#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-run
/**
 * Cecilia OS - Deno Backend
 * Multi-tenant web-based operating system
 *
 * Run: deno run --allow-net --allow-read --allow-write --allow-env --allow-run server.ts
 * Or: deno task start
 */

import { encode as base64Encode, decode as base64Decode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { ensureDir } from "https://deno.land/std@0.208.0/fs/mod.ts";
import { join, resolve } from "https://deno.land/std@0.208.0/path/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

// Configuration
const config = {
  osName: Deno.env.get("OS_NAME") || "Cecilia",
  osIcon: Deno.env.get("OS_ICON") || "🌼",
  apiBase: Deno.env.get("API_BASE") || "/api",
  dataDir: Deno.env.get("DATA_DIR") || "./data",
  homesDir: Deno.env.get("HOMES_DIR") || (Deno.build.os === "linux" ? "/home" : "./data/homes"),
  sessionSecret: Deno.env.get("SESSION_SECRET") || "change-this-secret-key-in-production",
  sessionExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
  port: parseInt(Deno.env.get("PORT") || "8080"),
  terminalIcon: "💻",
  folderIcon: "📁",
  settingsIcon: "⚙",
  logoutIcon: "🚪",
};

const ALLOWED_COMMANDS = [
  "ls", "cd", "pwd", "cat", "head", "tail", "wc",
  "mkdir", "rmdir", "touch", "cp", "mv", "rm",
  "echo", "date", "whoami", "id", "uname",
  "grep", "find", "sort", "uniq", "diff",
  "tar", "gzip", "gunzip", "zip", "unzip",
  "curl", "wget", "deno",
  "node", "npm", "npx", "python", "python3", "pip", "pip3",
  "git", "claude", "vim", "nano", "less", "more"
];

const BLOCKED_COMMANDS = [
  "sudo", "su", "passwd", "useradd", "userdel", "usermod",
  "chown", "chmod", "chgrp", "mount", "umount",
  "reboot", "shutdown", "halt", "poweroff",
  "systemctl", "service", "iptables", "ufw",
  "dd", "mkfs", "fdisk", "parted"
];

const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,31}$/;

// Ensure directories
const usersDir = join(config.dataDir, "users");
await ensureDir(usersDir);
await ensureDir(config.homesDir);

// Types
interface User {
  username: string;
  password_hash: string;
  created: number;
  last_login: number;
}

interface TokenPayload {
  username: string;
  exp: number;
  rand: string;
}

// Token functions
async function generateToken(username: string): Promise<string> {
  const payload: TokenPayload = {
    username,
    exp: Date.now() + config.sessionExpiry,
    rand: crypto.randomUUID(),
  };

  const data = base64Encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return `${data}.${sigHex}`;
}

async function verifyToken(token: string): Promise<string | null> {
  try {
    const [data, signature] = token.split(".");
    if (!data || !signature) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(config.sessionSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = new Uint8Array(signature.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;

    const payload: TokenPayload = JSON.parse(new TextDecoder().decode(base64Decode(data)));
    if (payload.exp < Date.now()) return null;

    return payload.username;
  } catch {
    return null;
  }
}

// User functions
function getUserFile(username: string): string {
  return join(usersDir, `${username}.json`);
}

async function loadUser(username: string): Promise<User | null> {
  try {
    const data = await Deno.readTextFile(getUserFile(username));
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveUser(user: User): Promise<void> {
  await Deno.writeTextFile(getUserFile(user.username), JSON.stringify(user, null, 2));
}

async function createHomeDir(username: string): Promise<boolean> {
  try {
    await ensureDir(join(config.homesDir, username));
    return true;
  } catch {
    return false;
  }
}

function isCommandAllowed(cmd: string): boolean {
  if (BLOCKED_COMMANDS.includes(cmd)) return false;
  return ALLOWED_COMMANDS.includes(cmd);
}

// Request handling
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

async function requireAuth(request: Request): Promise<string | null> {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return await verifyToken(auth.slice(7));
}

// Handlers
async function handleLogin(request: Request): Promise<Response> {
  const { username, password } = await request.json();

  if (!USERNAME_REGEX.test(username)) {
    return jsonResponse({ error: "Invalid username format" });
  }

  const user = await loadUser(username);
  if (!user) {
    return jsonResponse({ error: "User not found" });
  }

  if (!await bcrypt.compare(password, user.password_hash)) {
    return jsonResponse({ error: "Invalid password" });
  }

  user.last_login = Date.now();
  await saveUser(user);

  const token = await generateToken(username);
  return jsonResponse({ success: true, username, token });
}

async function handleRegister(request: Request): Promise<Response> {
  const { username, password } = await request.json();

  if (!USERNAME_REGEX.test(username)) {
    return jsonResponse({ error: "Invalid username. Must be 3-32 chars, start with letter, lowercase alphanumeric only." });
  }

  if (!password || password.length < 6) {
    return jsonResponse({ error: "Password must be at least 6 characters" });
  }

  const existing = await loadUser(username);
  if (existing) {
    return jsonResponse({ error: "Username already taken" });
  }

  if (!await createHomeDir(username)) {
    return jsonResponse({ error: "Could not create user directory" });
  }

  const user: User = {
    username,
    password_hash: await bcrypt.hash(password),
    created: Date.now(),
    last_login: Date.now(),
  };

  await saveUser(user);
  const token = await generateToken(username);
  return jsonResponse({ success: true, username, token });
}

async function handleVerify(request: Request): Promise<Response> {
  const { token, username } = await request.json();
  const tokenUser = await verifyToken(token);

  if (tokenUser && tokenUser === username) {
    return jsonResponse({ valid: true, username });
  }
  return jsonResponse({ valid: false });
}

async function handleTerminalExec(request: Request): Promise<Response> {
  const username = await requireAuth(request);
  if (!username) {
    return jsonResponse({ error: "Authorization required" }, 401);
  }

  const { command } = await request.json();
  const cmd = command?.trim();

  if (!cmd) {
    return jsonResponse({ error: "No command provided" });
  }

  const homeDir = join(config.homesDir, username);
  await ensureDir(homeDir);

  const parts = cmd.split(/\s+/);
  const baseCmd = parts[0];

  if (!isCommandAllowed(baseCmd)) {
    if (baseCmd === "help") {
      return jsonResponse({ output: `Available commands: ${ALLOWED_COMMANDS.sort().join(", ")}` });
    }
    return jsonResponse({ error: `Command not allowed: ${baseCmd}` });
  }

  try {
    const process = new Deno.Command("sh", {
      args: ["-c", cmd],
      cwd: homeDir,
      env: {
        HOME: homeDir,
        USER: username,
        PATH: "/usr/local/bin:/usr/bin:/bin",
      },
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await process.output();
    const output = new TextDecoder().decode(stdout).trimEnd();
    const error = new TextDecoder().decode(stderr).trimEnd();

    const response: Record<string, string> = { output };
    if (error && code !== 0) {
      response.error = error;
    }

    return jsonResponse(response);
  } catch (e) {
    return jsonResponse({ error: String(e) });
  }
}

async function handleFileList(request: Request): Promise<Response> {
  const username = await requireAuth(request);
  if (!username) {
    return jsonResponse({ error: "Authorization required" }, 401);
  }

  const url = new URL(request.url);
  const homeDir = join(config.homesDir, username);
  let path = url.searchParams.get("path") || "~";

  let targetPath: string;
  if (path === "~" || path === "") {
    targetPath = homeDir;
  } else if (path.startsWith("~")) {
    targetPath = join(homeDir, path.slice(1));
  } else {
    targetPath = path;
  }

  const resolved = resolve(targetPath);
  if (!resolved.startsWith(resolve(homeDir))) {
    return jsonResponse({ error: "Access denied" }, 403);
  }

  try {
    const files = [];
    for await (const entry of Deno.readDir(resolved)) {
      const info = await Deno.stat(join(resolved, entry.name));
      files.push({
        name: entry.name,
        type: entry.isDirectory ? "directory" : "file",
        size: entry.isFile ? info.size : 0,
        modified: info.mtime?.getTime() || 0,
      });
    }

    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    const displayPath = resolved.replace(resolve(homeDir), "~");
    return jsonResponse({ path: displayPath, files });
  } catch {
    return jsonResponse({ error: "Not a directory" });
  }
}

async function serveOS(): Promise<Response> {
  const paths = ["../core/os.html", "./core/os.html", "./os.html"];
  let content: string | null = null;

  for (const p of paths) {
    try {
      content = await Deno.readTextFile(p);
      break;
    } catch {
      // Try next path
    }
  }

  if (!content) {
    return new Response("OS template not found", { status: 500 });
  }

  const replacements: Record<string, string> = {
    "{{OS_NAME}}": config.osName,
    "{{OS_ICON}}": config.osIcon,
    "{{API_BASE}}": config.apiBase,
    "{{TERMINAL_ICON}}": config.terminalIcon,
    "{{FOLDER_ICON}}": config.folderIcon,
    "{{SETTINGS_ICON}}": config.settingsIcon,
    "{{LOGOUT_ICON}}": config.logoutIcon,
  };

  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(key, value);
  }

  return new Response(content, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Router
async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // API routes
  if (path === "/api/auth/login") return handleLogin(request);
  if (path === "/api/auth/register") return handleRegister(request);
  if (path === "/api/auth/verify") return handleVerify(request);
  if (path === "/api/terminal/exec") return handleTerminalExec(request);
  if (path === "/api/files/list") return handleFileList(request);

  // Serve OS
  return serveOS();
}

// Start server
console.log(`\n  ${config.osIcon} ${config.osName} running at http://localhost:${config.port}\n`);
Deno.serve({ port: config.port }, handler);
