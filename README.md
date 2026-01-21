# Function Server

A minimal, multi-tenant web-based operating system. Install on any server with a single command.

## Quick Install

```bash
curl -fsSL https://functionserver.com/install | bash
```

### Custom Name

```bash
curl -fsSL https://functionserver.com/install | bash -s -- --name "MyOS" --icon "🚀"
```

## Features

- **Multi-tenant**: Multiple users share a single installation
- **Terminal**: Full terminal with Claude Code support
- **Configurable**: Change the OS name and branding
- **Single binary**: Built with Go, no runtime dependencies
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

## Installation Options

```bash
curl -fsSL https://functionserver.com/install | bash -s -- [options]

Options:
  --name NAME      OS display name (default: Function Server)
  --icon EMOJI     OS icon emoji (default: ⚡)
  --dir PATH       Installation directory
  --domain DOMAIN  Domain name
  --port PORT      Port (default: 8080)
  --help           Show help
```

## Manual Installation

```bash
git clone https://github.com/williamsharkey/functionserver.git
cd cecilia/go
go build -o functionserver main.go
./functionserver
```

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `OS_NAME` | Display name | Function Server |
| `OS_ICON` | Emoji icon | ⚡ |
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
functionserver/
├── core/           # Frontend (os.html)
├── go/             # Go backend
├── install/        # Installer script
└── tests/          # Puppeteer tests
```

## License

MIT
