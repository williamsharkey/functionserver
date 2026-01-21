# Cecilia OS

A minimal, multi-tenant web-based operating system that you can install on any server with a single command.

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/williamsharkey/cecilia/main/install/install.sh | bash
```

### Custom OS Name

```bash
curl -fsSL https://raw.githubusercontent.com/williamsharkey/cecilia/main/install/install.sh | bash -s -- --name "MyOS" --icon "🚀"
```

### Choose Backend

```bash
# Go (fast, single binary)
curl -fsSL ... | bash -s -- --backend go

# Bun (fastest JavaScript)
curl -fsSL ... | bash -s -- --backend bun

# Deno (TypeScript, secure)
curl -fsSL ... | bash -s -- --backend deno
```

## Features

- **Multi-tenant**: Multiple users share a single installation
- **Terminal**: Full terminal with Claude Code support
- **Configurable**: Change the OS name and branding
- **7 Backends**: PHP, Python, Node.js, Go, Ruby, Deno, Bun
- **Cross-platform**: Linux, macOS, WSL

## Supported Platforms

| Platform | Status |
|----------|--------|
| Ubuntu/Debian | ✅ |
| CentOS/RHEL/Fedora | ✅ |
| Alpine | ✅ |
| Arch/Manjaro | ✅ |
| macOS | ✅ |
| WSL | ✅ |

## Backend Comparison

| Backend | Language | Startup | Memory | Best For |
|---------|----------|---------|--------|----------|
| **Go** | Go | Fast | Low | Production, single binary |
| **Bun** | TypeScript | Fastest | Low | Modern JS, fast dev |
| **Deno** | TypeScript | Fast | Medium | Security, TypeScript |
| **Node.js** | JavaScript | Medium | Medium | Ecosystem, compatibility |
| **Python** | Python | Medium | Medium | ML, data science |
| **Ruby** | Ruby | Medium | Medium | Rails devs |
| **PHP** | PHP | Fast | Low | Shared hosting |

## Installation Options

```bash
./install.sh [options]

Options:
  --name NAME      OS display name (default: Cecilia)
  --icon EMOJI     OS icon emoji (default: 🌼)
  --dir PATH       Installation directory
  --backend TYPE   php, python, nodejs, go, ruby, deno, bun
  --domain DOMAIN  Domain name for SSL
  --port PORT      Port (default: 8080)
  --dev            Development mode
  --help           Show help
```

## Manual Installation

### Go
```bash
git clone https://github.com/williamsharkey/cecilia.git
cd cecilia/go
go build -o cecilia
./cecilia
```

### Bun
```bash
git clone https://github.com/williamsharkey/cecilia.git
cd cecilia/bun
bun run server.ts
```

### Deno
```bash
git clone https://github.com/williamsharkey/cecilia.git
cd cecilia/deno
deno task start
```

### Node.js
```bash
git clone https://github.com/williamsharkey/cecilia.git
cd cecilia/nodejs
npm install
npm start
```

### Python
```bash
git clone https://github.com/williamsharkey/cecilia.git
cd cecilia/python
pip install -r requirements.txt
python app.py
```

### Ruby
```bash
git clone https://github.com/williamsharkey/cecilia.git
cd cecilia/ruby
bundle install
ruby app.rb
```

### PHP
```bash
git clone https://github.com/williamsharkey/cecilia.git
cd cecilia/php
php -S 0.0.0.0:8080
```

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `OS_NAME` | Display name | Cecilia |
| `OS_ICON` | Emoji icon | 🌼 |
| `PORT` | Server port | 8080 |
| `DATA_DIR` | Data storage | ./data |
| `HOMES_DIR` | User homes | /home |
| `SESSION_SECRET` | Token secret | (random) |

## User Management

Users self-register through the web interface. Each user gets:
- Sandboxed home directory
- Terminal access
- File management

## Claude Code Support

Claude Code works in the terminal:

```bash
# After logging in, open Terminal and run:
claude
```

For full TTY support, SSH in:
```bash
ssh username@your-server.com
claude
```

## Security

- Commands sandboxed to user home
- Dangerous commands blocked (sudo, chmod, etc.)
- Sessions expire after 7 days
- Passwords hashed with bcrypt

## Project Structure

```
cecilia/
├── core/           # Frontend (os.html)
├── php/            # PHP backend
├── python/         # Python/Flask backend
├── nodejs/         # Node.js backend
├── go/             # Go backend
├── ruby/           # Ruby/Sinatra backend
├── deno/           # Deno backend
├── bun/            # Bun backend
├── install/        # Universal installer
└── tests/          # Puppeteer tests
```

## License

MIT
