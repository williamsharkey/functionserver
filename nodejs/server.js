#!/usr/bin/env node
/**
 * Cecilia OS - Node.js Backend
 * Multi-tenant web-based operating system
 *
 * Run with: node server.js
 * Or: npm start
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const url = require('url');

// Configuration
const config = {
  OS_NAME: process.env.OS_NAME || 'Cecilia',
  OS_ICON: process.env.OS_ICON || '🌼',
  API_BASE: process.env.API_BASE || '/api',
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, 'data'),
  HOMES_DIR: process.env.HOMES_DIR || '/home',
  SESSION_SECRET: process.env.SESSION_SECRET || 'change-this-secret-key-in-production',
  SESSION_EXPIRY: 86400 * 7 * 1000, // 7 days in ms
  PORT: parseInt(process.env.PORT) || 8080,

  // Icons
  TERMINAL_ICON: '💻',
  FOLDER_ICON: '📁',
  SETTINGS_ICON: '⚙',
  LOGOUT_ICON: '🚪',

  // Security
  ALLOWED_COMMANDS: [
    'ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'wc',
    'mkdir', 'rmdir', 'touch', 'cp', 'mv', 'rm',
    'echo', 'date', 'whoami', 'id', 'uname',
    'grep', 'find', 'sort', 'uniq', 'diff',
    'tar', 'gzip', 'gunzip', 'zip', 'unzip',
    'curl', 'wget',
    'node', 'npm', 'npx', 'python', 'python3', 'pip', 'pip3',
    'git', 'claude', 'vim', 'nano', 'less', 'more'
  ],
  BLOCKED_COMMANDS: [
    'sudo', 'su', 'passwd', 'useradd', 'userdel', 'usermod',
    'chown', 'chmod', 'chgrp', 'mount', 'umount',
    'reboot', 'shutdown', 'halt', 'poweroff',
    'systemctl', 'service', 'iptables', 'ufw',
    'dd', 'mkfs', 'fdisk', 'parted'
  ]
};

// Ensure directories exist
const USERS_DIR = path.join(config.DATA_DIR, 'users');
fs.mkdirSync(USERS_DIR, { recursive: true });

// ==================== AUTH ====================
function generateToken(username) {
  const payload = {
    username,
    exp: Date.now() + config.SESSION_EXPIRY,
    rand: crypto.randomBytes(16).toString('hex')
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto
    .createHmac('sha256', config.SESSION_SECRET)
    .update(data)
    .digest('hex');
  return `${data}.${signature}`;
}

function verifyToken(token) {
  try {
    const [data, signature] = token.split('.');
    const expected = crypto
      .createHmac('sha256', config.SESSION_SECRET)
      .update(data)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(data, 'base64').toString());
    if (payload.exp < Date.now()) {
      return null;
    }

    return payload.username;
  } catch {
    return null;
  }
}

function getUserFile(username) {
  return path.join(USERS_DIR, `${username}.json`);
}

function loadUser(username) {
  const file = getUserFile(username);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveUser(username, data) {
  fs.writeFileSync(getUserFile(username), JSON.stringify(data, null, 2));
}

function validateUsername(username) {
  return /^[a-z][a-z0-9_]{2,31}$/.test(username);
}

async function hashPassword(password) {
  const bcrypt = require('bcrypt');
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  const bcrypt = require('bcrypt');
  return bcrypt.compare(password, hash);
}

function createLinuxUser(username) {
  const homeDir = path.join(config.HOMES_DIR, username);

  // Check if user exists
  try {
    execSync(`id ${username}`, { stdio: 'ignore' });
    fs.mkdirSync(homeDir, { recursive: true });
    return true;
  } catch {
    // User doesn't exist, try to create
    try {
      execSync(`sudo useradd -m -d ${homeDir} -s /bin/bash ${username}`, { stdio: 'ignore' });
    } catch {
      // Fallback: just create directory
      fs.mkdirSync(homeDir, { recursive: true });
    }
    return fs.existsSync(homeDir);
  }
}

// ==================== REQUEST HANDLING ====================
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function requireAuth(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return null;
  }
  return verifyToken(auth.slice(7));
}

// ==================== ROUTES ====================
async function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    const endpoint = pathname.slice(5);

    switch (endpoint) {
      case 'auth/login':
        return handleLogin(req, res);
      case 'auth/register':
        return handleRegister(req, res);
      case 'auth/verify':
        return handleVerify(req, res);
      case 'terminal/exec':
        return handleTerminalExec(req, res);
      case 'files/list':
        return handleFileList(req, res, parsedUrl.query);
      default:
        return sendJson(res, { error: 'Endpoint not found' }, 404);
    }
  }

  // Serve OS interface
  serveOS(res);
}

function serveOS(res) {
  let osPath = path.join(__dirname, '..', 'core', 'os.html');
  if (!fs.existsSync(osPath)) {
    osPath = path.join(__dirname, 'os.html');
  }

  if (!fs.existsSync(osPath)) {
    res.writeHead(500);
    return res.end('Error: OS template not found');
  }

  let html = fs.readFileSync(osPath, 'utf8');

  const replacements = {
    '{{OS_NAME}}': config.OS_NAME,
    '{{OS_ICON}}': config.OS_ICON,
    '{{API_BASE}}': config.API_BASE,
    '{{TERMINAL_ICON}}': config.TERMINAL_ICON,
    '{{FOLDER_ICON}}': config.FOLDER_ICON,
    '{{SETTINGS_ICON}}': config.SETTINGS_ICON,
    '{{LOGOUT_ICON}}': config.LOGOUT_ICON,
  };

  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(key).join(value);
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function handleLogin(req, res) {
  const body = await parseBody(req);
  const { username, password } = body;

  if (!validateUsername(username)) {
    return sendJson(res, { error: 'Invalid username format' });
  }

  const user = loadUser(username);
  if (!user) {
    return sendJson(res, { error: 'User not found' });
  }

  if (!await verifyPassword(password, user.password_hash)) {
    return sendJson(res, { error: 'Invalid password' });
  }

  user.last_login = Date.now();
  saveUser(username, user);

  const token = generateToken(username);
  sendJson(res, { success: true, username, token });
}

async function handleRegister(req, res) {
  const body = await parseBody(req);
  const { username, password } = body;

  if (!validateUsername(username)) {
    return sendJson(res, { error: 'Invalid username. Must be 3-32 chars, start with letter, lowercase alphanumeric only.' });
  }

  if (!password || password.length < 6) {
    return sendJson(res, { error: 'Password must be at least 6 characters' });
  }

  if (fs.existsSync(getUserFile(username))) {
    return sendJson(res, { error: 'Username already taken' });
  }

  if (!createLinuxUser(username)) {
    return sendJson(res, { error: 'Could not create user directory' });
  }

  const userData = {
    username,
    password_hash: await hashPassword(password),
    created: Date.now(),
    last_login: Date.now()
  };

  saveUser(username, userData);

  const token = generateToken(username);
  sendJson(res, { success: true, username, token });
}

async function handleVerify(req, res) {
  const body = await parseBody(req);
  const { token, username } = body;

  const tokenUser = verifyToken(token);
  if (tokenUser && tokenUser === username) {
    sendJson(res, { valid: true, username });
  } else {
    sendJson(res, { valid: false });
  }
}

async function handleTerminalExec(req, res) {
  const username = requireAuth(req);
  if (!username) {
    return sendJson(res, { error: 'Authorization required' }, 401);
  }

  const body = await parseBody(req);
  const command = (body.command || '').trim();

  if (!command) {
    return sendJson(res, { error: 'No command provided' });
  }

  const homeDir = path.join(config.HOMES_DIR, username);
  fs.mkdirSync(homeDir, { recursive: true });

  const parts = command.split(/\s+/);
  const baseCmd = parts[0];

  // Check blocked commands
  if (config.BLOCKED_COMMANDS.includes(baseCmd)) {
    return sendJson(res, { error: `Command not allowed: ${baseCmd}` });
  }

  // Check allowed commands
  if (!config.ALLOWED_COMMANDS.includes(baseCmd)) {
    if (baseCmd === 'help') {
      return sendJson(res, { output: 'Available commands: ' + config.ALLOWED_COMMANDS.sort().join(', ') });
    }
    return sendJson(res, { error: `Command not allowed: ${baseCmd}` });
  }

  // Execute command
  try {
    const child = spawn('sh', ['-c', command], {
      cwd: homeDir,
      env: {
        HOME: homeDir,
        USER: username,
        PATH: '/usr/local/bin:/usr/bin:/bin'
      },
      timeout: 30000
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => stdout += data);
    child.stderr.on('data', data => stderr += data);

    child.on('close', code => {
      const response = { output: stdout.trimEnd() };
      if (stderr && code !== 0) {
        response.error = stderr.trimEnd();
      }
      sendJson(res, response);
    });

    child.on('error', err => {
      sendJson(res, { error: err.message });
    });
  } catch (err) {
    sendJson(res, { error: err.message });
  }
}

async function handleFileList(req, res, query) {
  const username = requireAuth(req);
  if (!username) {
    return sendJson(res, { error: 'Authorization required' }, 401);
  }

  const homeDir = path.join(config.HOMES_DIR, username);
  let targetPath = query.path || '~';

  if (targetPath.startsWith('~')) {
    targetPath = path.join(homeDir, targetPath.slice(1));
  }

  // Security check
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(path.resolve(homeDir))) {
    return sendJson(res, { error: 'Access denied' });
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return sendJson(res, { error: 'Not a directory' });
  }

  const files = fs.readdirSync(resolved).map(name => {
    const fullPath = path.join(resolved, name);
    const stat = fs.statSync(fullPath);
    return {
      name,
      type: stat.isDirectory() ? 'directory' : 'file',
      size: stat.isFile() ? stat.size : 0,
      modified: Math.floor(stat.mtimeMs)
    };
  });

  // Sort: directories first
  files.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  const displayPath = resolved.replace(path.resolve(homeDir), '~');
  sendJson(res, { path: displayPath, files });
}

// ==================== SERVER ====================
const server = http.createServer(handleRequest);

server.listen(config.PORT, () => {
  console.log(`\n  ${config.OS_ICON} ${config.OS_NAME} running at http://localhost:${config.PORT}\n`);
});
